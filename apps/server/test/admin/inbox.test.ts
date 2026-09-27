import { rmSync } from 'node:fs'
import type { AlertDto, AnalystDto, ApiError, InboxDto, InboxGroupKey, InboxRow, MeetingBrief, SessionEventsDto } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { sql } = await import('../../src/db/index.ts')
const { getAnalyst, failIntro, failVoiceClone, setVoiceSample, startIntro } = await import('../../src/domain/analysts.ts')
const { saveBrief } = await import('../../src/domain/brief-data.ts')
const { requireDeal, updateDeal } = await import('../../src/domain/deals.ts')
const { markLost } = await import('../../src/domain/stages.ts')
const { createTask, getTask } = await import('../../src/domain/tasks.ts')
const { publish } = await import('../../src/domain/pipeline.ts')
const { approveVersion, createVersion, markRenderStatus } = await import('../../src/domain/timelines.ts')
const { paths } = await import('../../src/paths.ts')
const { enqueue, getJob, jobKeys } = await import('../../src/queue/index.ts')
const { SCRAPE_OK, T0, insertAnalyst, insertDeal, later, makeTimeline } = await import('../domain/fixtures.ts')
const { addSession, addSessionEvent, createHarness, jsonBody, publishedDeal, stoppedAt } = await import('./harness.ts')

const DAY = 24 * 60
const RECORDED_AT = '2026-09-25T08:00:00.000Z'

function failNow(h: Harness, id: number | undefined, error: string): number {
  if (id === undefined) throw new Error('The job was not enqueued')
  sql(h.db, `UPDATE jobs SET status = 'failed', attempts = 3, error = ?, updated_at = ? WHERE id = ?`).run(error, T0.toISOString(), id)
  return id
}

function brief(interest: MeetingBrief['header']['interest'], meetingAt: string): MeetingBrief {
  return {
    version: 1,
    language: 'en',
    writtenAt: T0.toISOString(),
    header: { company: 'Acme Oy', owner: 'Matti Meikäläinen', ownerRole: 'CEO', meetingAt, timeZone: 'Europe/Helsinki', language: 'fi', interest, summary: null },
    company: { lines: [], country: 'FI', nace: null, staffCount: null },
    figures: { revenue: null, profit: null, valuation: null },
    engagement: { opens: 1, sessions: 1, totalWatchS: 60, perSlide: [], stopSlide: 8, replays: 0, channels: [] },
    signals: [],
    form: null,
    customQuestions: [],
    buyers: [],
    questions: null,
  }
}

interface Setup {
  renderJob: number
  introJob: number
  sweepJob: number
  lostWriteJob: number
  callTask: number
  secondTask: number
}

function seed(h: Harness): Setup {
  const { db } = h
  insertAnalyst(db)
  insertAnalyst(db, { id: 11, name: 'Jonas Weber' })

  insertDeal(db, {
    id: 100,
    patch: {
      status: 'review',
      reviewReasons: [
        { code: 'lines_missing', slide: 3, detail: 'Slide 3 needs two or three lines about the company' },
        { code: 'script_missing', slide: 6, detail: 'Slide 6 has no script' },
      ],
    },
  })

  insertDeal(db, { id: 101, patch: { status: 'failed', scrape: SCRAPE_OK } })
  createVersion(db, 101, makeTimeline(101, { audio: 'ok' }), T0)
  markRenderStatus(db, 101, 1, 'failed', T0)
  const render = enqueue(db, 'render', jobKeys.render(101, 1), { kind: 'deal', dealId: 101, version: 1 }, { now: T0 })
  const renderJob = failNow(h, render?.id, 'Render timed out after 300 s\nstderr tail')

  publishedDeal(db, { id: 102, patch: { meetingAt: later(180).toISOString(), bookedAt: T0.toISOString() } })
  saveBrief(db, 102, brief('high', later(180).toISOString()), 1, T0)
  publishedDeal(db, { id: 103, patch: { meetingAt: later(30 * 60).toISOString() } })
  publishedDeal(db, { id: 109, patch: { meetingAt: later(-10).toISOString() } })

  publishedDeal(db, { id: 104, at: later(-3 * DAY) })
  const callTask = createTask(db, 104, 'call', null, T0)?.id ?? 0

  publishedDeal(db, { id: 105, at: later(-3 * DAY), patch: { firstOpenAt: later(-2 * DAY).toISOString() } })
  addSession(db, 105, { id: 's-105', startedAt: later(-2 * DAY), channel: 'whatsapp', analytics: stoppedAt(5) })
  addSessionEvent(db, 105, 's-105', { seq: 0, type: 'open', at: later(-2 * DAY) })
  addSessionEvent(db, 105, 's-105', { seq: 2, type: 'pause', at: later(-2 * DAY + 1), slide: 5, videoTime: 70 })
  addSessionEvent(db, 105, 's-105', { seq: 1, type: 'play', at: later(-2 * DAY + 1), slide: 1, videoTime: 0 })
  const secondTask = createTask(db, 105, 'second_channel', 'email', T0)?.id ?? 0

  insertDeal(db, { id: 106, analystId: 11, patch: { status: 'review' } })

  publishedDeal(db, { id: 107 })
  markLost(db, 107, 'Not selling', T0)
  const lostWrite = sql<{ id: number }>(db, `SELECT id FROM jobs WHERE deal_id = 107 AND idempotency_key LIKE 'pipedrive-write:107:lost:%'`).get()
  const lostWriteJob = failNow(h, lostWrite?.id, 'Pipedrive PUT /deals/107: HTTP 500')
  failNow(h, enqueue(db, 'audio', jobKeys.audioSlides(107, 1, 1), { kind: 'slides', dealId: 107, version: 1 }, { now: T0 })?.id, 'x')

  publishedDeal(db, { id: 108, patch: { meetingAt: later(-120).toISOString() } })
  failNow(h, enqueue(db, 'write-brief', jobKeys.brief(108, 9), { dealId: 108, lastEventId: 9 }, { now: T0 })?.id, 'model down')

  const sweepJob = failNow(h, enqueue(db, 'sweep', jobKeys.sweep(T0), { hour: '2026-09-26T11' }, { now: T0 })?.id, 'disk full')

  startIntro(db, 10, 'fi', { recordedAt: RECORDED_AT, transcript: 'Hei' }, T0)
  failIntro(db, 10, 'fi', RECORDED_AT, T0)
  const intro = enqueue(
    db,
    'audio',
    jobKeys.audioIntro(10, 'fi', RECORDED_AT),
    { kind: 'intro', analystId: 10, lang: 'fi', uploadFile: 'cache/uploads/intro.mp4', recordedAt: RECORDED_AT },
    { now: T0 },
  )
  const introJob = failNow(h, intro?.id, 'ffmpeg failed: Invalid data found when processing input')

  startIntro(db, 11, 'de', { recordedAt: RECORDED_AT, transcript: null }, T0)
  failIntro(db, 11, 'de', RECORDED_AT, T0)
  const other = enqueue(db, 'audio', jobKeys.audioIntro(11, 'de', RECORDED_AT), { kind: 'intro', analystId: 11, lang: 'de', uploadFile: 'x', recordedAt: RECORDED_AT }, { now: T0 })
  failNow(h, other?.id, 'other analyst')

  return { renderJob, introJob, sweepJob, lostWriteJob, callTask, secondTask }
}

let h: Harness
let setup: Setup

beforeEach(() => {
  h = createHarness()
  setup = seed(h)
})

afterEach(() => h.close())

afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

async function inbox(analyst = 10): Promise<Record<InboxGroupKey, InboxRow[]>> {
  const { status, body } = await h.json<InboxDto>(`/api/inbox?analyst=${analyst}`)
  expect(status).toBe(200)
  expect(body.groups.map((group) => group.key)).toEqual(['review', 'meeting_today', 'call', 'second_channel'])
  return Object.fromEntries(body.groups.map((group) => [group.key, group.rows])) as Record<InboxGroupKey, InboxRow[]>
}

describe('GET /api/inbox', () => {
  it('builds the four groups for the deals of the analyst', async () => {
    const groups = await inbox()
    const review = Object.fromEntries(groups.review.map((row) => [row.key, row]))
    expect(Object.keys(review).sort()).toEqual(
      ['deal:100', `job:${setup.renderJob}`, `job:${setup.lostWriteJob}`, `job:${setup.sweepJob}`, `job:${setup.introJob}`].sort(),
    )
    expect(review['deal:100']).toMatchObject({
      dealId: 100,
      company: 'Acme Oy',
      context: 'Slide 3 needs two or three lines about the company (1 more)',
      action: { kind: 'review', label: 'Review video' },
      lastSession: null,
    })
    expect(review[`job:${setup.renderJob}`]).toMatchObject({
      dealId: 101,
      context: 'Render failed: Render timed out after 300 s',
      action: { kind: 'retry', label: 'Retry', jobId: setup.renderJob },
    })
    expect(review[`job:${setup.lostWriteJob}`]?.context).toBe('Pipedrive update (lost status) failed: Pipedrive PUT /deals/107: HTTP 500')
    expect(review[`job:${setup.sweepJob}`]).toMatchObject({ dealId: null, company: 'System', context: 'Hourly sweep failed: disk full' })
    expect(review[`job:${setup.introJob}`]).toMatchObject({
      dealId: null,
      company: 'Your profile',
      context: 'Face-cam intro (Finnish) failed: ffmpeg failed: Invalid data found when processing input',
    })

    expect(groups.meeting_today.map((row) => row.dealId)).toEqual([109, 102])
    expect(groups.meeting_today[1]).toMatchObject({
      key: 'meeting:102',
      context: 'Meeting with Matti Meikäläinen, CEO',
      action: { kind: 'brief', label: 'Read meeting brief' },
      meetingAt: later(180).toISOString(),
      interest: 'high',
    })
    expect(groups.meeting_today[0]).toMatchObject({
      interest: null,
      context: 'Meeting with Matti Meikäläinen, CEO. The meeting brief is not written yet',
    })

    expect(groups.call).toEqual([
      {
        key: `task:${setup.callTask}`,
        dealId: 104,
        company: 'Acme Oy',
        context: 'Link sent on 2026-09-23, not opened',
        action: { kind: 'call', label: 'Call Matti', taskId: setup.callTask },
        lastSession: null,
      },
    ])
    expect(groups.second_channel).toEqual([
      {
        key: `task:${setup.secondTask}`,
        dealId: 105,
        company: 'Acme Oy',
        context: 'Opened on 2026-09-24, no meeting booked',
        action: { kind: 'second_channel', label: 'Send on Email', taskId: setup.secondTask, channel: 'email' },
        lastSession: 'Opened on WhatsApp, stopped at slide 5',
      },
    ])
  })

  it('shows only the deals of the other analyst for that analyst', async () => {
    const groups = await inbox(11)
    expect(groups.review.map((row) => row.key)).toContain('deal:106')
    expect(groups.review.map((row) => row.dealId)).not.toContain(100)
    expect(groups.review.some((row) => row.context.startsWith('Face-cam intro (German)'))).toBe(true)
    expect(groups.call).toEqual([])
  })

  it('hides failed jobs without a deal when a later run or a new recording resolved them', async () => {
    const { db } = h
    const sweep = enqueue(db, 'sweep', jobKeys.sweep(later(60)), { hour: '2026-09-26T12' }, { now: T0 })
    sql(db, `UPDATE jobs SET status = 'done' WHERE id = ?`).run(sweep?.id)
    const backup = (date: Date, error: string) =>
      failNow(h, enqueue(db, 'backup', jobKeys.backup(date), { date: date.toISOString().slice(0, 10) }, { now: T0 })?.id, error)
    backup(later(-DAY), 'older backup failure')
    const newestBackup = backup(later(-2 * DAY), 'newest backup failure')
    sql(db, 'UPDATE jobs SET updated_at = ? WHERE id = ?').run(later(1).toISOString(), newestBackup)
    startIntro(db, 10, 'fi', { recordedAt: later(5).toISOString(), transcript: null }, later(5))

    const keys = (await inbox()).review.map((row) => row.key)
    expect(keys).not.toContain(`job:${setup.sweepJob}`)
    expect(keys).not.toContain(`job:${setup.introJob}`)
    expect(keys.filter((key) => key.startsWith('job:') && key !== `job:${setup.renderJob}` && key !== `job:${setup.lostWriteJob}`)).toEqual([
      `job:${newestBackup}`,
    ])
  })

  it('shows a new version of a published video that waits for the analyst', async () => {
    const { db } = h
    publishedDeal(db, { id: 110 })
    const reviewRow = async () => (await inbox()).review.find((row) => row.key === 'deal:110')

    createVersion(db, 110, makeTimeline(110, { audio: 'ok' }), later(5))
    expect(await reviewRow()).toBeUndefined()

    updateDeal(db, 110, { reviewReasons: [{ code: 'script_missing', slide: 4, detail: 'Slide 4 has no script' }] }, later(6))
    expect(await reviewRow()).toMatchObject({ dealId: 110, context: 'Version 2: Slide 4 has no script', action: { kind: 'review', label: 'Review video' } })

    updateDeal(db, 110, { reviewReasons: [] }, later(7))
    markRenderStatus(db, 110, 2, 'rendered', later(8))
    expect(await reviewRow()).toMatchObject({
      dealId: 110,
      context: 'Version 2 is ready for review. The link still shows version 1',
      action: { kind: 'review', label: 'Review video' },
    })

    approveVersion(db, 110, 2, later(9))
    publish(db, 110, 2, later(9))
    expect(await reviewRow()).toBeUndefined()
  })

  it('needs a known analyst', async () => {
    expect((await h.request('/api/inbox')).status).toBe(400)
    expect((await h.request('/api/inbox?analyst=77')).status).toBe(404)
  })
})

describe('POST /api/jobs/:id/retry', () => {
  it('queues a failed render again and moves the deal back to draft', async () => {
    expect((await h.request(`/api/jobs/${setup.renderJob}/retry`, { method: 'POST' })).status).toBe(204)
    expect(getJob(h.db, setup.renderJob)).toMatchObject({ status: 'queued', attempts: 0, error: null })
    expect(requireDeal(h.db, 101).status).toBe('draft')
    expect((await inbox()).review.map((row) => row.key)).not.toContain(`job:${setup.renderJob}`)
    const again = await h.json<ApiError>(`/api/jobs/${setup.renderJob}/retry`, { method: 'POST' })
    expect(again).toEqual({ status: 409, body: { error: 'Only a failed job can be retried. This job is queued.' } })
    expect((await h.request('/api/jobs/99999/retry', { method: 'POST' })).status).toBe(404)
  })

  it('refuses to retry a pipeline job of a deal whose link has expired', async () => {
    updateDeal(h.db, 101, { expiresAt: later(-60).toISOString(), expiredAt: later(-30).toISOString() }, T0)
    expect(await h.json<ApiError>(`/api/jobs/${setup.renderJob}/retry`, { method: 'POST' })).toEqual({
      status: 409,
      body: { error: 'The link has expired' },
    })
    expect(getJob(h.db, setup.renderJob)?.status).toBe('failed')
  })

  it('sets a failed voice clone back to pending', async () => {
    setVoiceSample(h.db, 10, 'analysts/10/voice-sample.mp3', T0)
    failVoiceClone(h.db, 10, T0)
    const clone = enqueue(h.db, 'audio', jobKeys.audioClone(10, RECORDED_AT), { kind: 'clone', analystId: 10 }, { now: T0 })
    const cloneJob = failNow(h, clone?.id, 'ElevenLabs HTTP 500')
    expect((await h.request(`/api/jobs/${cloneJob}/retry`, { method: 'POST' })).status).toBe(204)
    expect(getJob(h.db, cloneJob)?.status).toBe('queued')
    const { body } = await h.json<AnalystDto[]>('/api/analysts')
    expect(body.find((analyst) => analyst.id === 10)?.voice.cloneStatus).toBe('pending')
  })

  it('sets a failed intro back to processing', async () => {
    expect((await h.request(`/api/jobs/${setup.introJob}/retry`, { method: 'POST' })).status).toBe(204)
    expect(getAnalyst(h.db, 10)?.intros.fi).toMatchObject({ status: 'ready', pending: { status: 'processing', recordedAt: RECORDED_AT, transcript: 'Hei' } })
  })
})

describe('POST /api/tasks/:id/done', () => {
  it('closes the task and the deal leaves the Call group', async () => {
    expect((await h.request(`/api/tasks/${setup.callTask}/done`, { method: 'POST' })).status).toBe(204)
    expect(getTask(h.db, setup.callTask)?.status).toBe('done')
    expect((await inbox()).call).toEqual([])
    expect((await h.request(`/api/tasks/${setup.callTask}/done`, { method: 'POST' })).status).toBe(204)
    expect((await h.request('/api/tasks/4242/done', { method: 'POST' })).status).toBe(404)
  })
})

describe('alerts', () => {
  it('lists the alerts of the last 14 days and marks them seen', async () => {
    const { body } = await h.json<AlertDto[]>('/api/alerts?analyst=10')
    expect(body.map((alert) => [alert.dealId, alert.type, alert.unread])).toEqual([
      [107, 'lost', true],
      [102, 'brief_written', true],
      [105, 'open', true],
    ])
    expect(body[2]?.text).toBe('Opened the video from the WhatsApp link on a phone')
    expect((await h.request('/api/alerts/seen', jsonBody('POST', { analyst: 10 }))).status).toBe(204)
    expect((await h.json<AlertDto[]>('/api/alerts?analyst=10')).body.every((alert) => !alert.unread)).toBe(true)
    expect((await h.request('/api/alerts/seen', jsonBody('POST', { analyst: 'ten' }))).status).toBe(400)
    expect((await h.request('/api/alerts/seen', jsonBody('POST', { analyst: 77 }))).status).toBe(404)
    expect((await h.request('/api/alerts?analyst=77')).status).toBe(404)
  })
})

describe('GET /api/sessions/:id/events', () => {
  it('returns the session, the slide times and the events in sequence order', async () => {
    const { status, body } = await h.json<SessionEventsDto>('/api/sessions/s-105/events')
    expect(status).toBe(200)
    expect(body.session).toMatchObject({ id: 's-105', channel: 'whatsapp', device: 'mobile', analytics: { stopSlide: 5 } })
    expect(body.durationS).toBe(118)
    expect(body.slides).toHaveLength(8)
    expect(body.events.map((event) => [event.seq, event.type])).toEqual([
      [0, 'open'],
      [1, 'play'],
      [2, 'pause'],
    ])
    expect((await h.request('/api/sessions/unknown/events')).status).toBe(404)
    expect((await h.request('/api/sessions/a%20b/events')).status).toBe(400)
  })
})
