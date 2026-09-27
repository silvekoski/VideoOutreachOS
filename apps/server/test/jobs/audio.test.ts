import { removeStorage } from './storage-env.ts'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SlideSegment, Timeline } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { requireAnalyst, setVoiceSample, startIntro } from '../../src/domain/analysts.ts'
import { requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { advance, refreshFromPipedrive } from '../../src/domain/pipeline.ts'
import { createVersion, getTimeline, updateVersion } from '../../src/domain/timelines.ts'
import { runJob } from '../../src/jobs/runner.ts'
import { paths } from '../../src/paths.ts'
import { ProviderError } from '../../src/providers/errors.ts'
import type { SpeechClient, SpeechRequest } from '../../src/providers/types.ts'
import { claimNext, enqueue, getJob, jobKeys, jobsForDeal } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { ANALYST_ID, DEAL_ID, SCRAPE_OK, T0, insertAnalyst, insertDeal, makeTimeline } from '../domain/fixtures.ts'
import { ToneSpeech, makeContext, testVideo } from './helpers.ts'
import type { TestContext } from './helpers.ts'

let t: TempDb
let ctx: TestContext
let sleeps: number[]

afterAll(removeStorage)

beforeEach(() => {
  t = tempDb()
  ctx = makeContext(t.db, { now: T0 })
  sleeps = []
  ctx.sleep = async (ms) => {
    sleeps.push(ms)
  }
  insertAnalyst(t.db)
  insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
})

afterEach(() => t.close())

function slide(timeline: Timeline, n: number): SlideSegment {
  const segment = timeline.segments.find((item) => item.slide === n)
  if (!segment || segment.template === 'facecam') throw new Error(`No slide ${n}`)
  return segment
}

async function runNext(): Promise<AnyJob> {
  const job = claimNext(t.db, ctx.now())
  if (!job) throw new Error('No due job')
  await runJob(ctx, job)
  return getJob(t.db, job.id) as AnyJob
}

function enqueueSlides(run = 1): void {
  enqueue(t.db, 'audio', jobKeys.audioSlides(DEAL_ID, 1, run), { kind: 'slides', dealId: DEAL_ID, version: 1 }, { now: T0 })
}

function speech(synthesize: (request: SpeechRequest, tone: ToneSpeech) => Promise<Buffer>): SpeechClient {
  const tone = new ToneSpeech()
  return { mode: 'fake', synthesize: (request) => synthesize(request, tone), cloneVoice: (name) => tone.cloneVoice(name) }
}

describe('audio job, slides', { timeout: 30_000 }, () => {
  beforeEach(() => {
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID), T0)
  })

  it('makes one normalized clip per slide, sets the durations and queues the render', async () => {
    enqueueSlides()
    const job = await runNext()

    expect(job.status).toBe('done')
    const row = getTimeline(t.db, DEAL_ID, 1)
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const segment = slide(row?.timeline as Timeline, n)
      expect(segment.audio).toMatchObject({ file: `deals/${DEAL_ID}/audio/slide-${n}.v1.mp3`, status: 'ok', error: null })
      expect(segment.audio.durationS).toBeCloseTo(0.8, 1)
      expect(segment.durationS).toBeCloseTo(Math.ceil(((segment.audio.durationS ?? 0) + 0.4) * 30 - 1e-9) / 30, 6)
      expect((await stat(paths.slideAudio(DEAL_ID, n, 1))).size).toBeGreaterThan(0)
    }
    expect((ctx.providers.speech as ToneSpeech).requests[0]).toEqual({ voiceId: 'voice-aino', text: 'Script of slide 2.', language: 'fi' })
    expect(row?.renderStatus).toBe('rendering')
    expect(jobsForDeal(t.db, DEAL_ID, ['render'])).toHaveLength(1)
  })

  it('writes no clip for a deal whose link has expired', async () => {
    updateDeal(t.db, DEAL_ID, { expiresAt: T0.toISOString(), expiredAt: T0.toISOString() }, T0)
    enqueueSlides()

    const job = await runNext()

    expect(job.status).toBe('done')
    expect((ctx.providers.speech as ToneSpeech).requests).toEqual([])
    expect(slide(getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline, 2).audio.status).toBe('missing')
  })

  it('retries a clip three times, finishes the other clips and then fails the job for review', async () => {
    const attempts = new Map<string, number>()
    ctx.providers.speech = speech(async (request, tone) => {
      const count = (attempts.get(request.text) ?? 0) + 1
      attempts.set(request.text, count)
      if (request.text === 'Script of slide 3.') {
        throw new ProviderError('ElevenLabs HTTP 400: text rejected', { provider: 'elevenlabs', status: 400, retryable: false })
      }
      if (request.text === 'Script of slide 4.' && count === 1) {
        throw new ProviderError('ElevenLabs HTTP 503', { provider: 'elevenlabs', status: 503, retryable: true })
      }
      if (request.text === 'Script of slide 5.') {
        throw new ProviderError('ElevenLabs HTTP 429', { provider: 'elevenlabs', status: 429, retryable: true })
      }
      return tone.synthesize(request)
    })
    enqueueSlides()

    const job = await runNext()

    expect(job.status).toBe('failed')
    expect(job.error).toContain('slide 3: ElevenLabs HTTP 400')
    expect(job.error).toContain('slide 5: ElevenLabs HTTP 429')
    expect(attempts.get('Script of slide 3.')).toBe(1)
    expect(attempts.get('Script of slide 4.')).toBe(2)
    expect(attempts.get('Script of slide 5.')).toBe(4)
    expect(sleeps).toEqual([1000, 1000, 2000, 4000])
    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(slide(timeline, 3).audio).toMatchObject({ status: 'failed', error: 'ElevenLabs HTTP 400: text rejected' })
    expect(slide(timeline, 4).audio.status).toBe('ok')
    expect(slide(timeline, 8).audio.status).toBe('ok')
    const deal = requireDeal(t.db, DEAL_ID)
    expect(deal.status).toBe('review')
    expect(deal.reviewReasons.filter((reason) => reason.code === 'audio_failed').map((reason) => reason.slide)).toEqual([3, 5])
  })

  it('drops a clip whose script changed during the job and queues a new audio run', async () => {
    ctx.providers.speech = speech(async (request, tone) => {
      if (request.text === 'Script of slide 2.') {
        updateVersion(t.db, DEAL_ID, 1, (timeline) => {
          slide(timeline, 2).script = 'An edited script of slide 2.'
          slide(timeline, 2).audio.status = 'new'
          return timeline
        })
      }
      return tone.synthesize(request)
    })
    enqueueSlides()

    await runNext()

    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(slide(timeline, 2).audio).toMatchObject({ file: null, status: 'new' })
    expect(slide(timeline, 3).audio.status).toBe('ok')
    expect(jobsForDeal(t.db, DEAL_ID, ['audio']).map((job) => [job.key, job.status])).toEqual([
      [jobKeys.audioSlides(DEAL_ID, 1, 1), 'done'],
      [jobKeys.audioSlides(DEAL_ID, 1, 2), 'queued'],
    ])
  })
})

describe('audio job, new deal owner', { timeout: 30_000 }, () => {
  it('writes no clip of the old voice after the deal gets a new owner, and the next run uses the new voice', async () => {
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID), T0)
    const bo = insertAnalyst(t.db, { id: 11, name: 'Bo Berg', voiceId: 'voice-bo' })
    const tone = new ToneSpeech()
    ctx.providers.speech = speech(async (request) => {
      if (request.text === 'Script of slide 3.' && request.voiceId === 'voice-aino') {
        updateDeal(t.db, DEAL_ID, { analystId: bo.id }, T0)
        refreshFromPipedrive(t.db, DEAL_ID, { company: 'Acme Oy', analyst: bo, ownerChanged: true, ownerFirstName: { from: 'Matti', to: 'Matti' } }, T0)
      }
      return tone.synthesize(request)
    })
    enqueueSlides()

    expect((await runNext()).status).toBe('done')

    expect(tone.requests.map((request) => [request.voiceId, request.text])).toEqual([
      ['voice-aino', 'Script of slide 2.'],
      ['voice-aino', 'Script of slide 3.'],
    ])
    const timeline = getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline
    expect(timeline.segments.flatMap((segment) => (segment.template === 'facecam' ? [] : [segment.audio.status]))).toEqual(Array(7).fill('new'))
    expect(timeline.segments[0]?.variables).toMatchObject({ analystName: 'Bo Berg' })
    expect(jobsForDeal(t.db, DEAL_ID, ['audio']).map((job) => [job.key, job.status])).toEqual([
      [jobKeys.audioSlides(DEAL_ID, 1, 1), 'done'],
      [jobKeys.audioSlides(DEAL_ID, 1, 2), 'queued'],
    ])

    expect((await runNext()).status).toBe('done')
    expect(new Set(tone.requests.slice(2).map((request) => request.voiceId))).toEqual(new Set(['voice-bo']))
    expect(slide(getTimeline(t.db, DEAL_ID, 1)?.timeline as Timeline, 8).audio.status).toBe('ok')
  })
})

describe('audio job, intro and clone', { timeout: 30_000 }, () => {
  const recordedAt = '2026-09-26T11:00:00.000Z'

  function enqueueIntro(uploadFile: string, at = recordedAt): void {
    enqueue(t.db, 'audio', jobKeys.audioIntro(ANALYST_ID, 'sv', at), { kind: 'intro', analystId: ANALYST_ID, lang: 'sv', uploadFile, recordedAt: at }, { now: T0 })
  }

  it('transcodes the intro upload, marks the intro ready and deletes the upload', async () => {
    const upload = path.join(paths.uploadsDir, 'intro-upload.mp4')
    await testVideo(upload, 1.5, { size: '1280x720' })
    startIntro(t.db, ANALYST_ID, 'sv', { recordedAt, transcript: 'Hej!' }, T0)
    enqueueIntro('cache/uploads/intro-upload.mp4')

    const job = await runNext()

    expect(job.status).toBe('done')
    const intro = requireAnalyst(t.db, ANALYST_ID).intros.sv
    expect(intro).toMatchObject({ status: 'ready', file: `analysts/${ANALYST_ID}/intro-sv.mp4`, transcript: 'Hej!' })
    expect(intro?.durationS).toBeCloseTo(1.5, 1)
    await expect(stat(upload)).rejects.toThrow()
  })

  it('skips an upload that a newer recording replaced, and fails a missing upload', async () => {
    const upload = path.join(paths.uploadsDir, 'old-upload.mp4')
    await writeFile(upload, 'old')
    startIntro(t.db, ANALYST_ID, 'sv', { recordedAt, transcript: null }, T0)
    enqueueIntro('cache/uploads/old-upload.mp4', '2026-09-26T10:00:00.000Z')
    expect((await runNext()).status).toBe('done')
    await expect(stat(upload)).rejects.toThrow()
    expect(requireAnalyst(t.db, ANALYST_ID).intros.sv?.status).toBe('processing')

    enqueueIntro('cache/uploads/gone.mp4')
    const job = await runNext()
    expect(job.status).toBe('failed')
    expect(requireAnalyst(t.db, ANALYST_ID).intros.sv?.status).toBe('failed')
  })

  it('keeps the ready intro in use when a new recording cannot be processed', async () => {
    const at = '2026-09-26T11:30:00.000Z'
    startIntro(t.db, ANALYST_ID, 'fi', { recordedAt: at, transcript: 'Uusi intro.' }, T0)
    enqueue(t.db, 'audio', jobKeys.audioIntro(ANALYST_ID, 'fi', at), { kind: 'intro', analystId: ANALYST_ID, lang: 'fi', uploadFile: 'cache/uploads/gone.mp4', recordedAt: at }, { now: T0 })

    expect((await runNext()).status).toBe('failed')

    expect(requireAnalyst(t.db, ANALYST_ID).intros.fi).toMatchObject({
      status: 'ready',
      file: `analysts/${ANALYST_ID}/intro-fi.mp4`,
      transcript: 'Hei, olen Aino Mergerosta.',
      pending: { recordedAt: at, transcript: 'Uusi intro.', status: 'failed' },
    })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), T0)
    const result = advance(t.db, DEAL_ID, T0)
    expect(result.reasons).toEqual([])
    expect(result.action).toBe('render')
  })

  it('clones the voice from the sample, and marks the clone failed when the sample is missing', async () => {
    const sample = paths.voiceSample(ANALYST_ID)
    await mkdir(path.dirname(sample), { recursive: true })
    await writeFile(sample, 'sample bytes')
    setVoiceSample(t.db, ANALYST_ID, `analysts/${ANALYST_ID}/voice-sample.mp3`, T0)
    enqueue(t.db, 'audio', jobKeys.audioClone(ANALYST_ID, 'a'), { kind: 'clone', analystId: ANALYST_ID }, { now: T0 })

    expect((await runNext()).status).toBe('done')
    expect(requireAnalyst(t.db, ANALYST_ID)).toMatchObject({ voiceId: 'voice-aino-analyst', cloneStatus: 'ready' })

    setVoiceSample(t.db, ANALYST_ID, `analysts/${ANALYST_ID}/missing.mp3`, T0)
    enqueue(t.db, 'audio', jobKeys.audioClone(ANALYST_ID, 'b'), { kind: 'clone', analystId: ANALYST_ID }, { now: T0 })
    const job = await runNext()
    expect(job.status).toBe('failed')
    expect(requireAnalyst(t.db, ANALYST_ID).cloneStatus).toBe('failed')
  })
})
