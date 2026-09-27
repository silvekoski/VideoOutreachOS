import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RenderInputError } from '@mergero/scene'
import { SLIDES, checkTimelineSlots, slideTimes, withPlannedTimes } from '@mergero/shared'
import type { SlideTime, Timeline } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import { getAnalyst } from '../domain/analysts.ts'
import { brand } from '../domain/config.ts'
import { isExpired, requireDeal } from '../domain/deals.ts'
import { advance, withCurrentIntro } from '../domain/pipeline.ts'
import { createVersion, getTimeline, markRenderStatus, newestTimeline, setSlideTimes, updateVersion } from '../domain/timelines.ts'
import { env } from '../env.ts'
import { log } from '../log.ts'
import { faststart, integratedLoudness, make720, posterFrame } from '../media/ffmpeg.ts'
import { paths } from '../paths.ts'
import { NonRetryableError, enqueue, jobKeys } from '../queue/index.ts'
import type { Job, RenderPayload } from '../queue/index.ts'
import { writeFileAtomic } from './storage.ts'
import type { JobContext, JobHandler } from './types.ts'

const SCENE_DIR = path.join(env.repoRoot, 'packages', 'scene')
const SCENE_HASH_FILE = path.join(paths.templatesDir, 'scene-hash')
const PROGRESS_STEP = 0.25

type RenderJob<K extends RenderPayload['kind']> = Job<'render'> & { payload: Extract<RenderPayload, { kind: K }> }

function actualTimes(planned: Timeline, frames: number): SlideTime[] {
  const times = slideTimes(planned)
  const last = times.at(-1)
  const endS = frames / planned.fps
  if (last && endS > last.startS) last.endS = endS
  return times
}

function progressLogger(fields: Record<string, unknown>): (progress: number) => void {
  let next = PROGRESS_STEP
  return (progress) => {
    if (progress < next || progress >= 1) return
    log.info('render progress', { ...fields, percent: Math.floor(progress * 100) })
    next = (Math.floor(progress / PROGRESS_STEP) + 1) * PROGRESS_STEP
  }
}

async function renderDeal(job: RenderJob<'deal'>, ctx: JobContext): Promise<void> {
  const { dealId, version } = job.payload
  const row = getTimeline(ctx.db, dealId, version)
  if (!row) throw new NonRetryableError(`Deal ${dealId} has no timeline version ${version}`)
  if (row.renderStatus === 'rendered') {
    advance(ctx.db, dealId, ctx.now())
    return
  }
  const deal = requireDeal(ctx.db, dealId)
  if (isExpired(deal, ctx.now())) {
    log.info('render skipped, the link has expired', { dealId, version })
    return
  }
  const timeline = withCurrentIntro(row.timeline, getAnalyst(ctx.db, deal.analystId))
  const tooLong = checkTimelineSlots(timeline)
  if (tooLong.length > 0) {
    transaction(ctx.db, () => {
      markRenderStatus(ctx.db, dealId, version, 'failed', ctx.now())
      if (newestTimeline(ctx.db, dealId)?.version === version) createVersion(ctx.db, dealId, timeline, ctx.now())
    })
    log.warn('render stopped, a text is too long for its slot', { dealId, version, reasons: tooLong.map((reason) => reason.detail) })
    advance(ctx.db, dealId, ctx.now())
    return
  }
  let planned: Timeline
  try {
    planned = withPlannedTimes(timeline)
  } catch (error) {
    throw new NonRetryableError(`Deal ${dealId} version ${version} cannot be rendered: ${(error as Error).message}`)
  }
  transaction(ctx.db, () => {
    updateVersion(ctx.db, dealId, version, () => timeline)
    markRenderStatus(ctx.db, dealId, version, 'rendering', ctx.now())
  })

  const fields = { dealId, version }
  const started = performance.now()
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'mergero-render-job-'))
  try {
    const result = await ctx.scene
      .renderTimeline({
        input: { timeline: planned, storageDir: paths.root, repoRoot: env.repoRoot, brand: brand() },
        outFile: path.join(tmpDir, 'render.mp4'),
        chromePath: env.chromePath,
        ffmpegPath: env.ffmpegPath,
        ffprobePath: env.ffprobePath,
        onProgress: progressLogger(fields),
      })
      .catch((error: unknown) => {
        throw error instanceof RenderInputError ? new NonRetryableError(error.message, { cause: error }) : error
      })
    const loudness = await integratedLoudness(result.file)
    if (loudness === null) throw new Error(`The rendered video of deal ${dealId} version ${version} is silent`)
    const video1080 = paths.video1080(dealId, version)
    await faststart(result.file, video1080)
    await make720(video1080, paths.video720(dealId, version))
    const slide3 = planned.segments.find((segment) => segment.slide === 3)
    await posterFrame(video1080, ((slide3?.startS ?? 0) + (slide3?.endS ?? 0)) / 2, paths.poster(dealId, version))
    transaction(ctx.db, () => {
      setSlideTimes(ctx.db, dealId, version, actualTimes(planned, result.frames))
      markRenderStatus(ctx.db, dealId, version, 'rendered', ctx.now())
    })
    log.info('video rendered', {
      ...fields,
      frames: result.frames,
      durationS: result.durationS,
      loudness,
      renderMs: Math.round(performance.now() - started),
    })
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
  advance(ctx.db, dealId, ctx.now())
}

export async function sceneHash(): Promise<string> {
  const entries = await readdir(path.join(SCENE_DIR, 'src'), { recursive: true, withFileTypes: true })
  const files = [
    ...entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)),
    path.join(SCENE_DIR, 'render', 'previews.ts'),
  ].sort()
  const hash = createHash('sha256')
  for (const file of files) hash.update(path.relative(SCENE_DIR, file)).update('\0').update(await readFile(file)).update('\0')
  hash.update(JSON.stringify(brand()))
  return hash.digest('hex').slice(0, 16)
}

async function previewsComplete(hash: string): Promise<boolean> {
  const marker = await readFile(SCENE_HASH_FILE, 'utf8').catch(() => null)
  if (marker?.trim() !== hash) return false
  const files = await Promise.all(SLIDES.map((slide) => stat(paths.templatePreview(slide)).catch(() => null)))
  return files.every((info) => info?.isFile())
}

export async function ensureTemplatePreviews(ctx: JobContext): Promise<boolean> {
  const hash = await sceneHash()
  if (await previewsComplete(hash)) return false
  const key = jobKeys.renderPreview(hash)
  const now = ctx.now()
  const queued =
    enqueue(ctx.db, 'render', key, { kind: 'preview', sceneHash: hash }, { now }) !== null ||
    sql(
      ctx.db,
      `UPDATE jobs SET status = 'queued', attempts = 0, run_at = ?, error = NULL, updated_at = ? WHERE idempotency_key = ? AND status = 'done'`,
    ).run(nowIso(now), nowIso(now), key).changes > 0
  if (queued) log.info('template preview render queued', { sceneHash: hash })
  return queued
}

async function renderPreviews(job: RenderJob<'preview'>, ctx: JobContext): Promise<void> {
  const files = await ctx.scene.renderTemplatePreviews({
    outDir: paths.templatesDir,
    chromePath: env.chromePath,
    ffmpegPath: env.ffmpegPath,
    ffprobePath: env.ffprobePath,
    brand: brand(),
    repoRoot: env.repoRoot,
  })
  await writeFileAtomic(SCENE_HASH_FILE, `${job.payload.sceneHash}\n`)
  log.info('template previews rendered', { sceneHash: job.payload.sceneHash, files: files.length })
}

export const renderHandler: JobHandler<'render'> = {
  async run(job, ctx) {
    const { payload } = job
    if (payload.kind === 'deal') return renderDeal({ ...job, payload }, ctx)
    return renderPreviews({ ...job, payload }, ctx)
  },

  async onFinalFailure(job, _error, ctx) {
    const { payload } = job
    if (payload.kind !== 'deal') return
    const row = getTimeline(ctx.db, payload.dealId, payload.version)
    if (row && row.renderStatus !== 'rendered') markRenderStatus(ctx.db, payload.dealId, payload.version, 'failed', ctx.now())
  },
}
