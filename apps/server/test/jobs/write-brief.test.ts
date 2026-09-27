import { removeStorage } from './storage-env.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { lastOwnerEventId, newestBrief } from '../../src/domain/brief-data.ts'
import { updateDeal } from '../../src/domain/deals.ts'
import { addDealEvent, listEvents } from '../../src/domain/events.ts'
import { publish } from '../../src/domain/pipeline.ts'
import { createVersion, markRenderStatus, setApproval, setSlideTimes } from '../../src/domain/timelines.ts'
import { runJob } from '../../src/jobs/runner.ts'
import { ModelError } from '../../src/providers/featherless.ts'
import { enqueue, getJob, jobKeys, jobsForDeal, retryJob } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, SCRAPE_OK, SLIDE_TIMES, T0, claim, insertAnalyst, insertDeal, later, makeTimeline } from '../domain/fixtures.ts'
import { ScriptedModel, makeContext } from './helpers.ts'
import type { TestContext } from './helpers.ts'

const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e'
const MEETING_AT = later(24 * 60).toISOString()

let t: TempDb
let ctx: TestContext
let model: ScriptedModel

afterAll(removeStorage)

beforeEach(() => {
  t = tempDb()
  model = new ScriptedModel()
  ctx = makeContext(t.db, { now: later(60), providers: { model } })
  insertAnalyst(t.db)
  insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
  createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), T0)
  setSlideTimes(t.db, DEAL_ID, 1, SLIDE_TIMES)
  markRenderStatus(t.db, DEAL_ID, 1, 'rendered', T0)
  setApproval(t.db, DEAL_ID, 1, true, T0)
  publish(t.db, DEAL_ID, 1, T0)
  sql(
    t.db,
    `INSERT INTO sessions (id, deal_id, version, started_at, last_seen_at, local_day, channel, device, browser, os, screen)
     VALUES (?, ?, 1, ?, ?, '2026-09-26', 'whatsapp', 'mobile', 'Safari', 'iOS', '390x844')`,
  ).run(SESSION, DEAL_ID, later(30).toISOString(), later(35).toISOString())
  const event = sql(
    t.db,
    `INSERT INTO events (deal_id, session_id, seq, type, slide, video_time, channel, client_at, at, data)
     VALUES (?, ?, ?, ?, ?, ?, 'whatsapp', ?, ?, '{}')`,
  )
  const at = later(31).toISOString()
  event.run(DEAL_ID, SESSION, 0, 'open', null, null, at, at)
  event.run(DEAL_ID, SESSION, 1, 'play', 1, 0, at, at)
  event.run(DEAL_ID, SESSION, 2, 'complete', 8, 118, at, at)
  updateDeal(t.db, DEAL_ID, { status: 'meeting_booked', meetingAt: MEETING_AT, bookedAt: later(40).toISOString() }, later(40))
  addDealEvent(t.db, DEAL_ID, 'meeting_booked', { meetingAt: MEETING_AT }, later(40))
})

afterEach(() => t.close())

function queueBrief(lastEventId = lastOwnerEventId(t.db, DEAL_ID) ?? 0): void {
  enqueue(t.db, 'write-brief', jobKeys.brief(DEAL_ID, lastEventId), { dealId: DEAL_ID, lastEventId }, { now: ctx.now() })
}

async function runNext(): Promise<AnyJob> {
  const job = claim(t.db, 'write-brief', ctx.now())
  await runJob(ctx, job)
  return getJob(t.db, job.id) as AnyJob
}

describe('write-brief job', () => {
  it('writes the brief with a summary and questions, the event and the Pipedrive note job', async () => {
    queueBrief()
    expect((await runNext()).status).toBe('done')

    const brief = newestBrief(t.db, DEAL_ID)
    expect(brief).toMatchObject({ version: 1, lastEventId: lastOwnerEventId(t.db, DEAL_ID), language: 'en' })
    expect(brief?.brief.header).toMatchObject({ company: 'Acme Oy', meetingAt: MEETING_AT })
    expect(brief?.brief.header.summary).toEqual(expect.any(String))
    expect(brief?.brief.questions?.length).toBeGreaterThanOrEqual(3)
    expect(brief?.brief.engagement.sessions).toBe(1)
    expect(model.requests).toHaveLength(1)
    expect(JSON.parse(model.requests[0]?.user ?? '{}')).toMatchObject({ task: 'brief-text', lang: 'en', brief: { version: 1 } })
    expect(listEvents(t.db, DEAL_ID, { types: ['brief_written'] })).toHaveLength(1)
    expect(jobsForDeal(t.db, DEAL_ID, ['pipedrive-write']).map((job) => job.payload)).toContainEqual({
      dealId: DEAL_ID,
      op: 'note',
      briefId: brief?.id,
    })
  })

  it('asks the model once more after a rejected answer', async () => {
    model.answers.push(() => ({ summary: 'The owner watched the video.', questions: ['What are your goals?'] }))
    queueBrief()
    await runNext()

    expect(model.requests).toHaveLength(2)
    expect(model.requests[1]?.system).toContain('questions: Too small')
    expect(newestBrief(t.db, DEAL_ID)?.brief.header.summary).toEqual(expect.any(String))
  })

  it('keeps the data sections and writes no summary after two failed answers', async () => {
    model.answers.push(
      () => ({ summary: 'The owner has 999 staff.', questions: ['A?', 'B?', 'C?'] }),
      () => ({ questions: [] }),
    )
    queueBrief()
    expect((await runNext()).status).toBe('done')

    const brief = newestBrief(t.db, DEAL_ID)?.brief
    expect(brief?.header.summary).toBeNull()
    expect(brief?.questions).toBeNull()
    expect(brief?.signals.map((signal) => signal.key)).toContain('watched_to_end')
  })

  it('writes the data sections with No summary after a model outage, and a retry writes the text', async () => {
    const outage = () => {
      throw new ModelError('Featherless HTTP 503', { status: 503, code: 'http_503', retryable: true })
    }
    model.answers.push(outage, outage, outage)
    queueBrief()
    expect((await runNext()).status).toBe('queued')
    expect(newestBrief(t.db, DEAL_ID)).toBeNull()
    ctx.clock.now = later(61)
    expect((await runNext()).status).toBe('queued')
    ctx.clock.now = later(64)
    const failed = await runNext()
    expect(failed.status).toBe('failed')

    const dataOnly = newestBrief(t.db, DEAL_ID)
    expect(dataOnly).toMatchObject({ version: 1, lastEventId: lastOwnerEventId(t.db, DEAL_ID) })
    expect(dataOnly?.brief.header.summary).toBeNull()
    expect(dataOnly?.brief.questions).toBeNull()
    expect(dataOnly?.brief.signals.map((signal) => signal.key)).toContain('watched_to_end')
    expect(jobsForDeal(t.db, DEAL_ID, ['pipedrive-write']).map((job) => job.payload)).toContainEqual({
      dealId: DEAL_ID,
      op: 'note',
      briefId: dataOnly?.id,
    })

    retryJob(t.db, failed.id, ctx.now())
    expect((await runNext()).status).toBe('done')
    const written = newestBrief(t.db, DEAL_ID)
    expect(written?.version).toBe(2)
    expect(written?.brief.header.summary).toEqual(expect.any(String))
    expect(written?.brief.questions?.length).toBeGreaterThanOrEqual(3)
  })

  it('writes nothing when a brief already covers the events or the link has expired', async () => {
    queueBrief()
    await runNext()
    const last = lastOwnerEventId(t.db, DEAL_ID) ?? 0
    enqueue(t.db, 'write-brief', jobKeys.brief(DEAL_ID, last - 1), { dealId: DEAL_ID, lastEventId: last - 1 }, { now: ctx.now() })
    await runNext()
    expect(newestBrief(t.db, DEAL_ID)?.version).toBe(1)

    updateDeal(t.db, DEAL_ID, { expiresAt: later(59).toISOString() }, ctx.now())
    enqueue(t.db, 'write-brief', jobKeys.brief(DEAL_ID, last + 1), { dealId: DEAL_ID, lastEventId: last + 1 }, { now: ctx.now() })
    expect((await runNext()).status).toBe('done')
    expect(newestBrief(t.db, DEAL_ID)?.version).toBe(1)
  })
})
