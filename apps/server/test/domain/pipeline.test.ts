import type { Timeline } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { completeIntro, getAnalyst, setVoiceId, startIntro } from '../../src/domain/analysts.ts'
import { requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { DomainError } from '../../src/domain/errors.ts'
import { listEvents } from '../../src/domain/events.ts'
import {
  advance,
  advanceAnalystDeals,
  applyReviewPatch,
  approveDeal,
  dealPipelineState,
  recomputeReviewReasons,
  recordReviewReasons,
  remakeDeal,
} from '../../src/domain/pipeline.ts'
import { moveStage } from '../../src/domain/stages.ts'
import {
  createVersion,
  getTimeline,
  markRenderStatus,
  newestTimeline,
  setSlideTimes,
  updateVersion,
} from '../../src/domain/timelines.ts'
import { NonRetryableError, failJob, getJob, jobsForDeal, retryJob } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import {
  BUYERS,
  DEAL_ID,
  SCRAPE_FAILED,
  SCRAPE_OK,
  SLIDE_TIMES,
  T0,
  claim,
  finish,
  insertAnalyst,
  insertDeal,
  later,
  makeTimeline,
  readyIntroFor,
  snapshot,
} from './fixtures.ts'
import type { TimelineOptions } from './fixtures.ts'

let t: TempDb
const now = later(1)

beforeEach(() => {
  t = tempDb()
})

afterEach(() => {
  t.close()
})

function pipelineJobs(): AnyJob[] {
  return jobsForDeal(t.db, DEAL_ID, ['scrape', 'write-script', 'audio', 'render'])
}

function scrapeDone(ok = true) {
  const job = claim(t.db, 'scrape', now)
  updateDeal(t.db, DEAL_ID, { scrape: ok ? SCRAPE_OK : SCRAPE_FAILED }, now)
  finish(t.db, job, now)
  return advance(t.db, DEAL_ID, now)
}

function writeScriptDone(options: TimelineOptions = {}) {
  const job = claim(t.db, 'write-script', now)
  createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, options), now)
  finish(t.db, job, now)
  return advance(t.db, DEAL_ID, now)
}

function withAudio(timeline: Timeline): Timeline {
  return {
    ...timeline,
    segments: timeline.segments.map((segment) =>
      segment.template === 'facecam' || segment.audio.status === 'ok' || segment.script === ''
        ? segment
        : {
            ...segment,
            audio: {
              file: `deals/${DEAL_ID}/audio/slide-${segment.slide}.v${timeline.version}.mp3`,
              durationS: 12,
              status: 'ok' as const,
              error: null,
            },
          },
    ),
  }
}

function audioDone() {
  const job = claim(t.db, 'audio', now)
  if (job.type !== 'audio' || job.payload.kind !== 'slides') throw new Error('not a slides audio job')
  updateVersion(t.db, DEAL_ID, job.payload.version, withAudio)
  finish(t.db, job, now)
  return advance(t.db, DEAL_ID, now)
}

function renderDone() {
  const job = claim(t.db, 'render', now)
  if (job.type !== 'render' || job.payload.kind !== 'deal') throw new Error('not a deal render job')
  setSlideTimes(t.db, DEAL_ID, job.payload.version, SLIDE_TIMES)
  markRenderStatus(t.db, DEAL_ID, job.payload.version, 'rendered', now)
  finish(t.db, job, now)
  return advance(t.db, DEAL_ID, now)
}

function toReview() {
  insertAnalyst(t.db)
  insertDeal(t.db)
  advance(t.db, DEAL_ID, now)
  scrapeDone()
  writeScriptDone()
  audioDone()
  return renderDone()
}

function codes(reasons: { code: string }[]): string[] {
  return reasons.map((reason) => reason.code)
}

function domainError(fn: () => unknown): DomainError {
  try {
    fn()
  } catch (error) {
    if (error instanceof DomainError) return error
    throw error
  }
  throw new Error('expected a DomainError')
}

describe('advance', () => {
  it('moves a fresh deal through scrape, scripts, audio and render to review, and publishes on approval', () => {
    insertAnalyst(t.db)
    insertDeal(t.db)
    expect(advance(t.db, DEAL_ID, now)).toEqual({ action: 'scrape', status: 'draft', reasons: [] })
    expect(advance(t.db, DEAL_ID, now).action).toBe('wait')
    expect(pipelineJobs().map((job) => job.key)).toEqual(['scrape:100'])

    expect(scrapeDone()).toMatchObject({ action: 'write-script', status: 'draft' })
    const write = pipelineJobs().at(-1)
    expect(write).toMatchObject({
      key: 'write-script:100:1:2-3-4-5-6-7-8',
      payload: { dealId: DEAL_ID, version: 1, slides: [2, 3, 4, 5, 6, 7, 8], lines: true },
    })

    expect(writeScriptDone()).toMatchObject({ action: 'audio', status: 'draft', reasons: [] })
    expect(pipelineJobs().at(-1)?.key).toBe('audio:100:1:1')
    expect(dealPipelineState(t.db, DEAL_ID)).toEqual({ running: true, step: 'audio' })

    expect(audioDone()).toMatchObject({ action: 'render', status: 'draft' })
    const rendering = newestTimeline(t.db, DEAL_ID)
    expect(rendering?.renderStatus).toBe('rendering')
    expect(rendering?.timeline.segments[0]).toMatchObject({
      durationS: 31.2,
      variables: { videoFile: `analysts/10/intro-fi.mp4`, analystName: 'Aino Analyst' },
    })
    expect(pipelineJobs().at(-1)?.key).toBe('render:100:1')
    expect(advance(t.db, DEAL_ID, now).action).toBe('wait')

    expect(renderDone()).toEqual({ action: 'review', status: 'review', reasons: [] })
    expect(dealPipelineState(t.db, DEAL_ID)).toEqual({ running: false, step: null })

    const approved = approveDeal(t.db, DEAL_ID, later(10))
    expect(approved.advance.action).toBe('publish')
    expect(approved.deal).toMatchObject({
      status: 'link_sent',
      publishedVersion: 1,
      publishedAt: later(10).toISOString(),
      expiresAt: new Date(later(10).getTime() + 30 * 86_400_000).toISOString(),
    })
    expect(listEvents(t.db, DEAL_ID).map((event) => event.type)).toEqual(['link_sent'])
    expect(jobsForDeal(t.db, DEAL_ID, ['pipedrive-write']).map((job) => job.key)).toEqual([
      'pipedrive-write:100:stage:link_sent',
    ])
    expect(advance(t.db, DEAL_ID, later(11))).toMatchObject({ action: 'none', status: 'link_sent' })
    expect(approveDeal(t.db, DEAL_ID, later(12)).advance.action).toBe('none')
  })

  it('adds no second job when it runs again', () => {
    insertAnalyst(t.db)
    insertDeal(t.db)
    advance(t.db, DEAL_ID, now)
    scrapeDone()
    writeScriptDone()
    for (let n = 0; n < 3; n++) expect(advance(t.db, DEAL_ID, now).action).toBe('wait')
    expect(pipelineJobs().filter((job) => job.type === 'audio')).toHaveLength(1)
  })

  it('blocks without an intro and a voice, and goes on when both are ready', () => {
    insertAnalyst(t.db, { intros: {}, voiceId: null })
    insertDeal(t.db)
    advance(t.db, DEAL_ID, now)
    scrapeDone()
    const blocked = writeScriptDone()
    expect(blocked).toMatchObject({ action: 'blocked', status: 'review' })
    expect(codes(blocked.reasons)).toEqual(['no_intro', 'no_voice'])
    expect(blocked.reasons[0]?.detail).toBe('Aino Analyst has no Finnish face-cam intro')
    expect(pipelineJobs().some((job) => job.type === 'audio')).toBe(false)

    startIntro(t.db, 10, 'fi', { recordedAt: '2026-09-26T12:05:00.000Z', transcript: null }, now)
    setVoiceId(t.db, 10, 'voice-new', now)
    expect(advanceAnalystDeals(t.db, 10, now)).toEqual([DEAL_ID])
    expect(requireDeal(t.db, DEAL_ID).reviewReasons[0]?.detail).toBe('The Finnish face-cam intro of Aino Analyst is still processing')

    completeIntro(t.db, 10, 'fi', '2026-09-26T12:05:00.000Z', { file: 'analysts/10/intro-fi.mp4', durationS: 29 }, now)
    advanceAnalystDeals(t.db, 10, now)
    expect(requireDeal(t.db, DEAL_ID)).toMatchObject({ status: 'draft', reviewReasons: [] })
    expect(pipelineJobs().at(-1)?.key).toBe('audio:100:1:1')
  })

  it('asks the analyst for the lines when the scrape failed', () => {
    insertAnalyst(t.db)
    insertDeal(t.db)
    advance(t.db, DEAL_ID, now)
    expect(scrapeDone(false).action).toBe('write-script')
    expect(pipelineJobs().at(-1)?.payload).toMatchObject({ lines: false })
    const blocked = writeScriptDone({ lines: [], linesSource: null })
    expect(blocked).toMatchObject({ action: 'blocked', status: 'review' })
    expect(codes(blocked.reasons)).toEqual(['lines_missing'])

    const patched = applyReviewPatch(t.db, DEAL_ID, { lines: [' Acme makes parts. ', 'It sells to yards.', ''] }, now)
    expect(patched.newVersion).toBe(false)
    expect(patched.timeline?.timeline.segments[2]).toMatchObject({
      variables: { lines: ['Acme makes parts.', 'It sells to yards.'], linesSource: 'analyst' },
      script: '',
      scriptSource: null,
      audio: { status: 'missing' },
    })
    expect(patched.advance).toMatchObject({ action: 'wait', status: 'draft', reasons: [] })
    expect(pipelineJobs().at(-1)).toMatchObject({
      key: 'write-script:100:1:3:edit-2',
      status: 'queued',
      payload: { dealId: DEAL_ID, version: 1, slides: [3], lines: false },
    })
  })

  it('writes the lines once after a successful scrape retry', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_FAILED } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { lines: [], linesSource: null }), now)
    expect(advance(t.db, DEAL_ID, now).action).toBe('blocked')

    updateDeal(t.db, DEAL_ID, { scrape: SCRAPE_OK }, now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'write-script', status: 'draft' })
    expect(pipelineJobs().at(-1)).toMatchObject({ key: 'write-script:100:1:3', payload: { slides: [3], lines: true } })

    const job = claim(t.db, 'write-script', now)
    recordReviewReasons(t.db, DEAL_ID, [{ code: 'model_failed', slide: 3, slot: 'your-company.line', detail: 'Slide 3 lines: the model failed twice' }], now)
    finish(t.db, job, now)
    const result = advance(t.db, DEAL_ID, now)
    expect(result.action).toBe('blocked')
    expect(codes(result.reasons)).toEqual(['lines_missing', 'model_failed'])
    expect(pipelineJobs().filter((item) => item.type === 'write-script')).toHaveLength(1)
  })

  it('blocks on a text that is too long and refuses the approval with 409', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    const long = [{ ...BUYERS[0], focus: 'x'.repeat(120) }] as typeof BUYERS
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { buyers: long, audio: 'ok' }), now)
    const result = advance(t.db, DEAL_ID, now)
    expect(result.action).toBe('blocked')
    expect(result.reasons).toEqual([
      { code: 'text_too_long', slide: 5, slot: 'buyers.focus', detail: 'Slide 5, buyer focus: 120 of 80 characters' },
    ])
    const error = domainError(() => approveDeal(t.db, DEAL_ID, now))
    expect(error.status).toBe(409)
    expect(error.detail).toEqual(result.reasons)
    expect(getTimeline(t.db, DEAL_ID, 1)?.approvedAt).toBeNull()
  })

  it('keeps a model failure until the analyst writes the script', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { scripts: { 6: '' } }), now)
    recordReviewReasons(t.db, DEAL_ID, [{ code: 'model_failed', slide: 6, detail: 'Slide 6: wrong language twice' }], now)
    const blocked = advance(t.db, DEAL_ID, now)
    expect(codes(blocked.reasons)).toEqual(['model_failed'])
    expect(domainError(() => approveDeal(t.db, DEAL_ID, now)).status).toBe(409)

    const patched = applyReviewPatch(t.db, DEAL_ID, { scripts: { 6: 'The analyst wrote this.' } }, now)
    expect(patched.advance).toMatchObject({ action: 'audio', reasons: [] })
    const segment = patched.timeline?.timeline.segments[5]
    expect(segment).toMatchObject({ script: 'The analyst wrote this.', scriptSource: 'analyst', audio: { status: 'new' } })
  })

  it('asks the model again for a cleared script on approval, once per version', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), now)
    const cleared = applyReviewPatch(t.db, DEAL_ID, { scripts: { 7: '  ' } }, now)
    expect(cleared.advance.action).toBe('blocked')
    expect(cleared.advance.reasons).toEqual([{ code: 'script_missing', slide: 7, detail: 'Slide 7 has no script' }])

    const approved = approveDeal(t.db, DEAL_ID, now)
    expect(approved.advance).toMatchObject({ action: 'write-script', status: 'draft', reasons: [] })
    expect(requireDeal(t.db, DEAL_ID).reviewReasons).toEqual([])
    expect(approved.timeline.approvedAt).not.toBeNull()
    const job = claim(t.db, 'write-script', now)
    expect(job).toMatchObject({ key: 'write-script:100:1:7', payload: { slides: [7], lines: false } })
    finish(t.db, job, now)
    expect(advance(t.db, DEAL_ID, now).action).toBe('blocked')
    const error = domainError(() => approveDeal(t.db, DEAL_ID, now))
    expect(error.detail).toEqual([{ code: 'script_missing', slide: 7, detail: 'Slide 7 has no script' }])
  })

  it('asks the model for a script that the analyst cleared, and never renders the old audio of that slide', () => {
    toReview()
    approveDeal(t.db, DEAL_ID, now)
    expect(requireDeal(t.db, DEAL_ID).publishedVersion).toBe(1)

    const cleared = applyReviewPatch(t.db, DEAL_ID, { scripts: { 5: '' } }, now)
    expect(cleared.newVersion).toBe(true)
    expect(cleared.timeline?.timeline.segments[4]).toMatchObject({
      script: '',
      scriptSource: null,
      audio: { status: 'missing', file: 'deals/100/audio/slide-5.v1.mp3' },
    })
    expect(cleared.advance).toMatchObject({ action: 'blocked', reasons: [{ code: 'script_missing', slide: 5 }] })

    expect(approveDeal(t.db, DEAL_ID, now).advance).toMatchObject({ action: 'write-script', reasons: [] })
    expect(requireDeal(t.db, DEAL_ID).reviewReasons).toEqual([])
    const job = claim(t.db, 'write-script', now)
    expect(job.payload).toMatchObject({ version: 2, slides: [5] })
    const skipped = advance(t.db, DEAL_ID, now, { finishedJobId: job.id })
    expect(skipped).toMatchObject({ action: 'blocked', reasons: [{ code: 'script_missing', slide: 5 }] })
    expect(pipelineJobs().filter((item) => item.type === 'render')).toHaveLength(1)

    updateVersion(t.db, DEAL_ID, 2, (timeline) => {
      Object.assign(timeline.segments[4] ?? {}, { script: 'These buyers want firms like yours.', scriptSource: 'model' })
      return timeline
    })
    finish(t.db, job, now)
    expect(advance(t.db, DEAL_ID, now).action).toBe('audio')
    expect(audioDone().action).toBe('render')
    expect(renderDone()).toMatchObject({ action: 'publish' })
    expect(requireDeal(t.db, DEAL_ID).publishedVersion).toBe(2)
  })

  it('waits for a running write-script job, and makes the audio of each slide that is not ok before the render', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, withAudio(makeTimeline(DEAL_ID, { scripts: { 6: '' } })), now)
    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      Object.assign(timeline.segments[5] ?? {}, { audio: { file: 'deals/100/audio/slide-6.v1.mp3', durationS: 12, status: 'missing', error: null } })
      return timeline
    })
    approveDeal(t.db, DEAL_ID, now)
    const job = claim(t.db, 'write-script', now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'wait', reasons: [] })

    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      Object.assign(timeline.segments[5] ?? {}, { script: 'A new script of slide 6.', scriptSource: 'model' })
      return timeline
    })
    expect(advance(t.db, DEAL_ID, now, { finishedJobId: job.id }).action).toBe('audio')
    finish(t.db, job, now)
    expect(pipelineJobs().some((item) => item.type === 'render')).toBe(false)
  })

  it('approves a version with pending edits and publishes it after audio and render', () => {
    toReview()
    const patched = applyReviewPatch(t.db, DEAL_ID, { scripts: { 4: 'A new script for the figures.' } }, now)
    expect(patched.newVersion).toBe(true)
    expect(patched.advance).toMatchObject({ action: 'audio', status: 'draft' })
    expect(pipelineJobs().at(-1)?.key).toBe('audio:100:2:1')

    const approved = approveDeal(t.db, DEAL_ID, now)
    expect(approved.timeline).toMatchObject({ version: 2, renderStatus: 'pending' })
    expect(approved.advance.action).toBe('wait')
    expect(audioDone().action).toBe('render')
    const published = renderDone()
    expect(published).toMatchObject({ action: 'publish', status: 'link_sent' })
    expect(requireDeal(t.db, DEAL_ID).publishedVersion).toBe(2)
  })

  it('sets failed when the first write-script fails, and recovers after a retry', () => {
    insertAnalyst(t.db)
    insertDeal(t.db)
    advance(t.db, DEAL_ID, now)
    scrapeDone()
    const job = claim(t.db, 'write-script', now)
    failJob(t.db, job.id, new NonRetryableError('model down'), now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'failed', status: 'failed' })

    sql(t.db, `UPDATE jobs SET status = 'queued', attempts = 0, error = NULL WHERE id = ?`).run(job.id)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'wait', status: 'draft' })
    expect(writeScriptDone().action).toBe('audio')
  })

  it('sets failed when the render fails, and an edit makes a new version', () => {
    insertAnalyst(t.db)
    insertDeal(t.db)
    advance(t.db, DEAL_ID, now)
    scrapeDone()
    writeScriptDone()
    audioDone()
    const job = claim(t.db, 'render', now)
    failJob(t.db, job.id, new NonRetryableError('chrome crashed'), now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'failed', status: 'failed' })
    markRenderStatus(t.db, DEAL_ID, 1, 'failed', now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'failed', status: 'failed' })
    retryJob(t.db, job.id, now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'wait', status: 'draft' })
    failJob(t.db, claim(t.db, 'render', now).id, new NonRetryableError('chrome crashed again'), now)

    const patched = applyReviewPatch(t.db, DEAL_ID, { scripts: { 2: 'A shorter welcome.' } }, now)
    expect(patched.newVersion).toBe(true)
    expect(patched.advance).toMatchObject({ action: 'audio', status: 'draft' })
  })

  it('blocks on a failed audio job until an edit retries it', () => {
    insertAnalyst(t.db)
    insertDeal(t.db)
    advance(t.db, DEAL_ID, now)
    scrapeDone()
    writeScriptDone()
    const job = claim(t.db, 'audio', now)
    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      const done = withAudio(timeline)
      return {
        ...done,
        segments: done.segments.map((segment) =>
          segment.template !== 'facecam' && segment.slide === 4
            ? { ...segment, audio: { ...segment.audio, status: 'failed', error: 'HTTP 422 from ElevenLabs' } }
            : segment,
        ),
      }
    })
    failJob(t.db, job.id, new NonRetryableError('slide 4 failed 3 times'), now)
    const blocked = advance(t.db, DEAL_ID, now)
    expect(blocked).toMatchObject({ action: 'blocked', status: 'review' })
    expect(blocked.reasons).toEqual([{ code: 'audio_failed', slide: 4, detail: 'Slide 4: HTTP 422 from ElevenLabs' }])

    const patched = applyReviewPatch(t.db, DEAL_ID, { scripts: { 4: 'Plain words.' } }, now)
    expect(patched.advance).toMatchObject({ action: 'wait', status: 'draft', reasons: [] })
    expect(getJob(t.db, job.id)).toMatchObject({ status: 'queued', attempts: 0 })
    expect(pipelineJobs().filter((item) => item.type === 'audio')).toHaveLength(1)
  })

  it('does not change the status after publication', () => {
    toReview()
    approveDeal(t.db, DEAL_ID, now)
    moveStage(t.db, DEAL_ID, 'opened', { now })
    const patched = applyReviewPatch(t.db, DEAL_ID, { scripts: { 8: 'Book a time that suits you.' } }, now)
    expect(patched.advance).toMatchObject({ action: 'audio', status: 'opened' })
    const job = claim(t.db, 'audio', now)
    failJob(t.db, job.id, new NonRetryableError('quota'), now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'blocked', status: 'opened' })
    expect(requireDeal(t.db, DEAL_ID).publishedVersion).toBe(1)
  })

  it('does nothing for a lost or expired deal', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { status: 'lost' } })
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'none', status: 'lost' })
    updateDeal(t.db, DEAL_ID, { status: 'draft', expiresAt: T0.toISOString() }, now)
    expect(advance(t.db, DEAL_ID, now).action).toBe('none')
    expect(pipelineJobs()).toEqual([])
  })
})

describe('applyReviewPatch', () => {
  it('edits a pending version in place and removes the approval', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok', scripts: { 3: 'Old text.' } }), now)
    approveDeal(t.db, DEAL_ID, now)
    sql(t.db, 'DELETE FROM jobs').run()
    markRenderStatus(t.db, DEAL_ID, 1, 'pending', now)

    const result = applyReviewPatch(t.db, DEAL_ID, { scripts: { 3: 'New text.', 4: 'Script of slide 4.' } }, now)
    expect(result.newVersion).toBe(false)
    expect(result.timeline).toMatchObject({ version: 1, approvedAt: null })
    const segments = result.timeline?.timeline.segments ?? []
    expect(segments[2]).toMatchObject({ script: 'New text.', scriptSource: 'analyst', audio: { status: 'new', file: 'deals/100/audio/slide-3.v1.mp3' } })
    expect(segments[3]).toMatchObject({ scriptSource: 'model', audio: { status: 'ok' } })
    expect(result.advance.action).toBe('audio')
  })

  it('copies a rendered version and keeps the audio files of the unchanged slides', () => {
    toReview()
    const before = getTimeline(t.db, DEAL_ID, 1)
    const result = applyReviewPatch(t.db, DEAL_ID, { scripts: { 5: 'These buyers want firms like yours.' } }, now)
    expect(result.newVersion).toBe(true)
    expect(getTimeline(t.db, DEAL_ID, 1)).toEqual(before)
    const v2 = result.timeline
    expect(v2).toMatchObject({ version: 2, renderStatus: 'pending', approvedAt: null, timeline: { version: 2 } })
    const segments = v2?.timeline.segments ?? []
    expect(segments.every((segment) => segment.startS === null && segment.endS === null)).toBe(true)
    expect(segments[1]).toMatchObject({ audio: { status: 'ok', file: 'deals/100/audio/slide-2.v1.mp3' } })
    expect(segments[4]).toMatchObject({ audio: { status: 'new' } })
    expect(requireDeal(t.db, DEAL_ID).status).toBe('draft')
  })

  it('removes and restores buyers on slide 5', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), now)
    const removed = applyReviewPatch(t.db, DEAL_ID, { removedBuyers: ['b2', 'b2'] }, now)
    expect(removed.deal.removedBuyers).toEqual(['b2'])
    const buyers = (timeline: Timeline | undefined) => {
      const variables = timeline?.segments[4]?.variables
      return variables?.template === 'buyers' ? variables.buyers.map((buyer) => buyer.id) : []
    }
    expect(buyers(removed.timeline?.timeline)).toEqual(['b1', 'b3'])
    expect(removed.timeline?.timeline.segments[4]).toMatchObject({ script: '', scriptSource: null, audio: { status: 'missing' } })
    expect(removed.advance).toMatchObject({ action: 'wait', reasons: [] })
    expect(pipelineJobs().map((job) => job.key)).toEqual(['write-script:100:1:5:edit-1'])

    markRenderStatus(t.db, DEAL_ID, 1, 'rendered', now)
    const restored = applyReviewPatch(t.db, DEAL_ID, { removedBuyers: [] }, now)
    expect(restored.newVersion).toBe(true)
    expect(buyers(restored.timeline?.timeline)).toEqual(['b1', 'b2', 'b3'])
    expect(pipelineJobs().at(-1)).toMatchObject({ key: 'write-script:100:2:5:edit-1', payload: { version: 2, slides: [5], lines: false } })
    const same = applyReviewPatch(t.db, DEAL_ID, { removedBuyers: [] }, now)
    expect(same.newVersion).toBe(false)
    expect(pipelineJobs()).toHaveLength(2)
  })

  it('asks the model for a new script after each edit of the buyers or the lines', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), now)
    applyReviewPatch(t.db, DEAL_ID, { removedBuyers: ['b1'] }, now)
    finish(t.db, claim(t.db, 'write-script', now), now)
    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      Object.assign(timeline.segments[4] ?? {}, { script: 'Script without b1.', scriptSource: 'fallback' })
      return timeline
    })
    const second = applyReviewPatch(t.db, DEAL_ID, { removedBuyers: ['b1', 'b2'], lines: ['Acme makes parts.', 'It sells to yards.'] }, now)
    expect(second.timeline?.timeline.segments[2]).toMatchObject({ script: '', scriptSource: null })
    expect(second.timeline?.timeline.segments[4]).toMatchObject({ script: '', scriptSource: null })
    expect(pipelineJobs().at(-1)).toMatchObject({ key: 'write-script:100:1:3-5:edit-2', status: 'queued', payload: { slides: [3, 5] } })
  })

  it('asks the analyst to check a script of the analyst after an edit of the buyers or the lines', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), now)
    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      for (const index of [2, 4]) Object.assign(timeline.segments[index] ?? {}, { script: `Analyst script ${index}.`, scriptSource: 'analyst' })
      return timeline
    })
    const edited = applyReviewPatch(t.db, DEAL_ID, { removedBuyers: ['b1'], lines: ['Acme makes parts.', 'It sells to yards.'] }, now)
    expect(edited.timeline?.timeline.segments[4]).toMatchObject({ script: 'Analyst script 4.', scriptSource: 'analyst', scriptCheck: true })
    expect(edited.advance.action).toBe('blocked')
    expect(edited.advance.reasons).toEqual([
      {
        code: 'script_check',
        slide: 3,
        detail: 'Slide 3: the company name, the website or the lines changed after you wrote the script. Check that the script matches the slide. Then edit it, or click "Script is correct".',
      },
      {
        code: 'script_check',
        slide: 5,
        detail: 'Slide 5: the buyer list changed after you wrote the script. Check that the script matches the slide. Then edit it, or click "Script is correct".',
      },
    ])
    expect(pipelineJobs()).toEqual([])
    expect(domainError(() => approveDeal(t.db, DEAL_ID, now)).status).toBe(409)

    const confirmed = applyReviewPatch(t.db, DEAL_ID, { scripts: { 3: 'Analyst script 2.' } }, now)
    expect(confirmed.timeline?.timeline.segments[2]).toMatchObject({ script: 'Analyst script 2.', scriptSource: 'analyst' })
    expect(confirmed.timeline?.timeline.segments[2]).not.toHaveProperty('scriptCheck')
    expect(confirmed.advance.reasons.map((reason) => reason.slide)).toEqual([5])

    const checked = applyReviewPatch(t.db, DEAL_ID, { scripts: { 3: 'Analyst script 2.', 5: 'A new analyst script.' } }, now)
    expect(checked.timeline?.timeline.segments[2]).not.toHaveProperty('scriptCheck')
    expect(checked.timeline?.timeline.segments[4]).toMatchObject({ script: 'A new analyst script.', audio: { status: 'new' } })
    expect(checked.timeline?.timeline.segments[4]).not.toHaveProperty('scriptCheck')
    expect(checked.advance).toMatchObject({ action: 'audio', reasons: [] })
  })

  it('renders a buyer slide that MGX left empty, with the empty panel and no review reason', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { buyers: [] }), now)
    expect(advance(t.db, DEAL_ID, now)).toEqual({ action: 'audio', status: 'draft', reasons: [] })
    expect(audioDone().action).toBe('render')
    expect(renderDone()).toEqual({ action: 'review', status: 'review', reasons: [] })
    expect(approveDeal(t.db, DEAL_ID, now).advance.action).toBe('publish')
    expect(requireDeal(t.db, DEAL_ID).publishedVersion).toBe(1)
  })

  it('blocks a buyer slide when the analyst removed every buyer, until one is restored', () => {
    insertAnalyst(t.db)
    insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), now)
    const removed = applyReviewPatch(t.db, DEAL_ID, { removedBuyers: ['b1', 'b2', 'b3'] }, now)
    expect(removed.advance.reasons).toContainEqual({ code: 'slide_empty', slide: 5, detail: 'Slide 5 has no buyers. Restore at least one buyer in the list.' })
    expect(domainError(() => approveDeal(t.db, DEAL_ID, now)).status).toBe(409)
    const restored = applyReviewPatch(t.db, DEAL_ID, { removedBuyers: ['b1', 'b2'] }, now)
    expect(codes(restored.advance.reasons)).not.toContain('slide_empty')
  })

  it('changes only the deal row for questions, expiry and page language', () => {
    toReview()
    approveDeal(t.db, DEAL_ID, now)
    const result = applyReviewPatch(
      t.db,
      DEAL_ID,
      { customQuestions: [{ id: 'q1', text: ' Who owns the building? ' }], expiryDays: 14, pageLanguage: 'sv' },
      later(60),
    )
    expect(result.newVersion).toBe(false)
    expect(result.timeline?.version).toBe(1)
    expect(result.deal).toMatchObject({
      customQuestions: [{ id: 'q1', text: 'Who owns the building?' }],
      expiryDays: 14,
      pageLanguage: 'sv',
      language: 'fi',
      expiresAt: new Date(later(60).getTime() + 14 * 86_400_000).toISOString(),
    })
  })

  it('refuses slide 1, edits before a script exists, and edits of a lost deal', () => {
    insertAnalyst(t.db)
    insertDeal(t.db)
    expect(domainError(() => applyReviewPatch(t.db, DEAL_ID, { scripts: { 2: 'Hello.' } }, now)).status).toBe(409)
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID), now)
    expect(domainError(() => applyReviewPatch(t.db, DEAL_ID, { scripts: { 1: 'Hello.' } }, now)).status).toBe(400)
    updateDeal(t.db, DEAL_ID, { status: 'lost' }, now)
    expect(domainError(() => applyReviewPatch(t.db, DEAL_ID, { pageLanguage: 'en' }, now)).message).toBe('The deal is lost')
  })
})

describe('remakeDeal', () => {
  const basis = { website: 'https://acme.test/', businessId: '1234567-8', nace: '25.62' }

  function withBasis(version: number) {
    updateVersion(t.db, DEAL_ID, version, (timeline) => ({ ...timeline, basis }))
  }

  it('blocks a video whose website, business ID or NACE code changed in Pipedrive, and makes the video again from the new data', () => {
    toReview()
    withBasis(1)
    expect(advance(t.db, DEAL_ID, now).reasons).toEqual([])

    updateDeal(t.db, DEAL_ID, { snapshot: { ...snapshot(), website: 'https://acme-group.test/', nace: '28.12' } }, now)
    const stale = advance(t.db, DEAL_ID, now)
    expect(stale).toMatchObject({ action: 'review', status: 'review' })
    expect(stale.reasons).toEqual([
      {
        code: 'remake_needed',
        detail:
          'The website and NACE code changed in Pipedrive after the tool made the video. The video still uses the old data. Click "Make the video again": the tool reads the website, the figures and the buyers again and writes new scripts.',
      },
    ])
    expect(domainError(() => approveDeal(t.db, DEAL_ID, now)).detail).toEqual(stale.reasons)

    const remade = remakeDeal(t.db, DEAL_ID, now)
    expect(remade.deal).toMatchObject({ scrape: null, reviewReasons: [], status: 'draft' })
    expect(remade.advance).toMatchObject({ action: 'wait', reasons: [] })
    expect(pipelineJobs().at(-1)).toMatchObject({ key: 'scrape:100:remake-2', status: 'queued' })
    expect(dealPipelineState(t.db, DEAL_ID)).toEqual({ running: true, step: 'scrape' })
    expect(domainError(() => remakeDeal(t.db, DEAL_ID, now)).message).toBe('The tool is making the video again. Wait until the new version is ready.')
    expect(domainError(() => approveDeal(t.db, DEAL_ID, now)).status).toBe(409)
    expect(domainError(() => applyReviewPatch(t.db, DEAL_ID, { lines: ['One.', 'Two.'] }, now)).status).toBe(409)

    expect(scrapeDone()).toMatchObject({ action: 'write-script', reasons: [] })
    const build = claim(t.db, 'write-script', now)
    expect(build).toMatchObject({ key: 'write-script:100:2:2-3-4-5-6-7-8', payload: { version: 2, lines: true } })
    createVersion(t.db, DEAL_ID, { ...makeTimeline(DEAL_ID, { version: 2 }), basis: { ...basis, website: 'https://acme-group.test/', nace: '28.12' } }, now)
    finish(t.db, build, now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'audio', reasons: [] })
    expect(newestTimeline(t.db, DEAL_ID)).toMatchObject({ version: 2, approvedAt: null })
  })

  it('names the new video language when the new contact person speaks another language', () => {
    toReview()
    withBasis(1)
    updateDeal(t.db, DEAL_ID, { snapshot: { ...snapshot(), ownerFirstName: 'Nils', linkedinLanguages: ['sv'] } }, now)
    expect(advance(t.db, DEAL_ID, now).reasons).toEqual([
      expect.objectContaining({
        code: 'remake_needed',
        detail: expect.stringContaining('The contact person changed in Pipedrive. The video must now be in Swedish, not in Finnish.'),
      }),
    ])
  })

  it('does not publish an approved render with old data, and refuses a published deal', () => {
    toReview()
    withBasis(1)
    sql(t.db, 'UPDATE timelines SET approved_at = ? WHERE deal_id = ?').run(now.toISOString(), DEAL_ID)
    updateDeal(t.db, DEAL_ID, { snapshot: { ...snapshot(), businessId: '7654321-0' } }, now)
    expect(advance(t.db, DEAL_ID, now)).toMatchObject({ action: 'blocked', reasons: [{ code: 'remake_needed' }] })
    expect(requireDeal(t.db, DEAL_ID).publishedVersion).toBeNull()

    updateDeal(t.db, DEAL_ID, { snapshot: snapshot() }, now)
    expect(advance(t.db, DEAL_ID, now).action).toBe('publish')
    expect(domainError(() => remakeDeal(t.db, DEAL_ID, now)).message).toBe('The link is published. The video stays as it is.')
  })

  it('ignores the business ID outside Finland, where the video does not use it', () => {
    toReview()
    updateDeal(t.db, DEAL_ID, { country: 'DE' }, now)
    updateVersion(t.db, DEAL_ID, 1, (timeline) => ({ ...timeline, language: 'de', basis: { ...basis, businessId: null } }))
    updateDeal(t.db, DEAL_ID, { snapshot: { ...snapshot(), businessId: 'HRB 1234' } }, now)
    expect(codes(advance(t.db, DEAL_ID, now).reasons)).not.toContain('remake_needed')
  })
})

describe('recomputeReviewReasons', () => {
  it('lists each blocking reason in a fixed order', () => {
    const timeline = makeTimeline(DEAL_ID, { lines: ['One line only.'], scripts: { 2: '', 6: '' } })
    const segment = timeline.segments[7]
    if (segment && segment.template !== 'facecam') segment.audio = { ...segment.audio, status: 'failed', error: 'timeout' }
    const analyst = {
      ...insertAnalyst(t.db, { intros: { fi: { ...readyIntroFor('fi'), status: 'failed' } }, voiceId: null }),
      cloneStatus: 'pending' as const,
    }
    const reasons = recomputeReviewReasons(
      { reviewReasons: [{ code: 'model_failed', slide: 6, detail: 'Slide 6: the model failed twice' }] },
      timeline,
      analyst,
    )
    expect(reasons).toEqual([
      { code: 'lines_missing', slide: 3, detail: 'Slide 3 needs two or three lines about the company' },
      { code: 'script_missing', slide: 2, detail: 'Slide 2 has no script' },
      { code: 'model_failed', slide: 6, detail: 'Slide 6: the model failed twice' },
      { code: 'audio_failed', slide: 8, detail: 'Slide 8: timeout' },
      { code: 'no_intro', slide: 1, detail: 'The Finnish face-cam intro of Aino Analyst could not be processed. Record it again.' },
      { code: 'no_voice', detail: 'The voice clone of Aino Analyst is not ready yet' },
    ])
    expect(getAnalyst(t.db, 10)?.cloneStatus).toBe('none')
  })
})
