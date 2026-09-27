import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { plannedDurationS } from '@mergero/shared'
import type { AudioStatus, Lang, SlideSegment, Timeline } from '@mergero/shared'
import {
  completeIntro,
  failIntro,
  failVoiceClone,
  introUpload,
  requireAnalyst,
  setVoiceId,
  voiceIdFor,
} from '../domain/analysts.ts'
import { isExpired, requireDeal } from '../domain/deals.ts'
import { advance, advanceAnalystDeals } from '../domain/pipeline.ts'
import { getTimeline, updateVersion } from '../domain/timelines.ts'
import { log } from '../log.ts'
import { loudnormToMp3, probeDurationS, transcodeIntro } from '../media/ffmpeg.ts'
import { paths } from '../paths.ts'
import { NonRetryableError, errorText, isRetryable } from '../queue/index.ts'
import type { AudioPayload, Job } from '../queue/index.ts'
import { storageFile, storageRelative } from './storage.ts'
import type { JobContext, JobHandler } from './types.ts'

const CLIP_RETRIES = 3
const CLIP_RETRY_BASE_MS = 1000
const TO_MAKE: ReadonlySet<AudioStatus> = new Set(['new', 'missing', 'failed'])

type AudioJob<K extends AudioPayload['kind']> = Job<'audio'> & { payload: Extract<AudioPayload, { kind: K }> }

interface Clip {
  file: string
  durationS: number
}

function slideSegments(timeline: Timeline): SlideSegment[] {
  return timeline.segments.filter((segment): segment is SlideSegment => segment.template !== 'facecam')
}

async function synthesizeClip(ctx: JobContext, voiceId: string, text: string, language: Lang, output: string): Promise<Clip> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mergero-clip-'))
  try {
    const raw = path.join(dir, 'speech.mp3')
    await writeFile(raw, await ctx.providers.speech.synthesize({ voiceId, text, language }))
    await loudnormToMp3(raw, output)
    return { file: storageRelative(output), durationS: await probeDurationS(output) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function makeClip(ctx: JobContext, voiceId: string, text: string, language: Lang, output: string, fields: object): Promise<Clip> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await synthesizeClip(ctx, voiceId, text, language, output)
    } catch (error) {
      if (attempt > CLIP_RETRIES || !isRetryable(error)) throw error
      const delayMs = CLIP_RETRY_BASE_MS * 2 ** (attempt - 1)
      log.warn('audio clip failed, trying again', { ...fields, attempt, delayMs, error: errorText(error) })
      await ctx.sleep(delayMs)
    }
  }
}

function applyClip(timeline: Timeline, slide: number, text: string, result: { clip: Clip } | { error: string }): Timeline {
  const segment = slideSegments(timeline).find((item) => item.slide === slide)
  if (!segment || segment.script !== text) return timeline
  if ('clip' in result) {
    segment.audio = { file: result.clip.file, durationS: result.clip.durationS, status: 'ok', error: null }
    segment.durationS = plannedDurationS(segment, timeline.fps, timeline.pauseS)
  } else {
    segment.audio = { ...segment.audio, status: 'failed', error: result.error }
  }
  return timeline
}

async function runSlides(job: AudioJob<'slides'>, ctx: JobContext): Promise<void> {
  const { dealId, version } = job.payload
  const deal = requireDeal(ctx.db, dealId)
  if (isExpired(deal, ctx.now())) {
    log.info('audio skipped, the link has expired', { dealId, version })
    return
  }
  const row = getTimeline(ctx.db, dealId, version)
  if (!row) throw new NonRetryableError(`Deal ${dealId} has no timeline version ${version}`)
  if (row.renderStatus !== 'pending') {
    log.info('audio skipped, the version is no longer pending', { dealId, version, renderStatus: row.renderStatus })
    advance(ctx.db, dealId, ctx.now())
    return
  }
  const analyst = requireAnalyst(ctx.db, deal.analystId)
  const voiceId = voiceIdFor(analyst)
  if (!voiceId) throw new NonRetryableError(`${analyst.name} has no voice clone`)
  const sameOwner = () => requireDeal(ctx.db, dealId).analystId === analyst.id

  const errors: string[] = []
  for (const segment of slideSegments(row.timeline)) {
    const text = segment.script
    if (text.trim() === '' || !TO_MAKE.has(segment.audio.status)) continue
    if (!sameOwner()) {
      log.info('audio stopped, the deal has a new owner', { dealId, version })
      break
    }
    const fields = { dealId, version, slide: segment.slide }
    const output = paths.slideAudio(dealId, segment.slide, version)
    let result: { clip: Clip } | { error: string }
    try {
      result = { clip: await makeClip(ctx, voiceId, text, row.timeline.language, output, fields) }
      log.info('audio clip made', { ...fields, durationS: result.clip.durationS })
    } catch (error) {
      result = { error: errorText(error) }
      errors.push(`slide ${segment.slide}: ${result.error}`)
      log.error('audio clip failed', { ...fields, error: result.error })
    }
    updateVersion(ctx.db, dealId, version, (timeline) => (sameOwner() ? applyClip(timeline, segment.slide, text, result) : timeline))
  }
  if (errors.length > 0 && sameOwner()) throw new NonRetryableError(`The audio could not be made for ${errors.join('; ')}`)
  advance(ctx.db, dealId, ctx.now())
}

async function runIntro(job: AudioJob<'intro'>, ctx: JobContext): Promise<void> {
  const { analystId, lang, uploadFile, recordedAt } = job.payload
  const upload = storageFile(uploadFile, 'intro upload')
  const current = introUpload(requireAnalyst(ctx.db, analystId).intros[lang])
  if (current?.recordedAt !== recordedAt) {
    log.info('intro skipped, a newer recording replaced it', { analystId, lang, recordedAt })
    await rm(upload, { force: true })
    return
  }
  if (!(await stat(upload).catch(() => null))?.isFile()) throw new NonRetryableError(`The intro upload is missing: ${uploadFile}`)
  const output = paths.intro(analystId, lang)
  await transcodeIntro(upload, output)
  const durationS = await probeDurationS(output)
  const updated = completeIntro(ctx.db, analystId, lang, recordedAt, { file: storageRelative(output), durationS }, ctx.now())
  await rm(upload, { force: true })
  log.info('intro ready', { analystId, lang, durationS, current: updated !== null })
  if (updated) advanceAnalystDeals(ctx.db, analystId, ctx.now())
}

async function runClone(job: AudioJob<'clone'>, ctx: JobContext): Promise<void> {
  const { analystId } = job.payload
  const analyst = requireAnalyst(ctx.db, analystId)
  if (!analyst.voiceSampleFile) throw new NonRetryableError(`${analyst.name} has no voice sample`)
  const file = storageFile(analyst.voiceSampleFile, 'voice sample')
  const sample = await readFile(file).catch((error: NodeJS.ErrnoException) => {
    throw error.code === 'ENOENT' ? new NonRetryableError(`The voice sample is missing: ${analyst.voiceSampleFile}`) : error
  })
  const { voiceId } = await ctx.providers.speech.cloneVoice(analyst.name, sample, path.basename(file))
  setVoiceId(ctx.db, analystId, voiceId, ctx.now())
  log.info('voice clone ready', { analystId, mode: ctx.providers.speech.mode })
  advanceAnalystDeals(ctx.db, analystId, ctx.now())
}

export const audioHandler: JobHandler<'audio'> = {
  async run(job, ctx) {
    const { payload } = job
    switch (payload.kind) {
      case 'slides':
        return runSlides({ ...job, payload }, ctx)
      case 'intro':
        return runIntro({ ...job, payload }, ctx)
      case 'clone':
        return runClone({ ...job, payload }, ctx)
    }
  },

  async onFinalFailure(job, _error, ctx) {
    const { payload } = job
    if (payload.kind === 'intro') failIntro(ctx.db, payload.analystId, payload.lang, payload.recordedAt, ctx.now())
    if (payload.kind === 'clone') failVoiceClone(ctx.db, payload.analystId, ctx.now())
  },
}
