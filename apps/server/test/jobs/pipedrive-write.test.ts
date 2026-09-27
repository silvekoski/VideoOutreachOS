import { removeStorage } from './storage-env.ts'
import type { DealAnalytics } from '@mergero/shared'
import { readFile } from 'node:fs/promises'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { buildBriefData, saveBrief } from '../../src/domain/brief-data.ts'
import { requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { completeTask, createTask, getTask } from '../../src/domain/tasks.ts'
import { env } from '../../src/env.ts'
import { runJob } from '../../src/jobs/runner.ts'
import { ProviderError } from '../../src/providers/errors.ts'
import type { FakePipedriveClient } from '../../src/providers/pipedrive-fake.ts'
import { claimNext, enqueue, getJob } from '../../src/queue/index.ts'
import type { AnyJob, PipedriveWritePayload } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, T0, insertAnalyst, insertDeal, later } from '../domain/fixtures.ts'
import { fakePipedrive, makeContext } from './helpers.ts'
import type { TestContext } from './helpers.ts'

interface StoreDeal {
  id: number
  stage: string | null
  status: string
  videoUrl: string | null
  lostReason: string | null
  fields: Record<string, unknown>
}

interface Store {
  deals: StoreDeal[]
  activities: { id: number; dealId: number; ownerId: number; type: string; subject: string; note: string | null; dueDate: string; done: boolean }[]
  notes: { id: number; dealId: number; content: string }[]
}

let t: TempDb
let ctx: TestContext
let pipedrive: FakePipedriveClient
let storeFile: string
let keys = 0

afterAll(removeStorage)

beforeEach(async () => {
  t = tempDb()
  const fake = await fakePipedrive()
  pipedrive = fake.client
  storeFile = fake.file
  ctx = makeContext(t.db, { now: T0, providers: { pipedrive } })
  insertAnalyst(t.db)
  insertDeal(t.db, { patch: { status: 'link_sent', publishedVersion: 1, publishedAt: T0.toISOString() } })
})

afterEach(() => t.close())

async function store(): Promise<Store> {
  return JSON.parse(await readFile(storeFile, 'utf8')) as Store
}

async function storeDeal(id = DEAL_ID): Promise<StoreDeal | undefined> {
  return (await store()).deals.find((deal) => deal.id === id)
}

function queue(payload: PipedriveWritePayload): void {
  enqueue(t.db, 'pipedrive-write', `test:${++keys}`, payload, { now: ctx.now() })
}

async function runAll(): Promise<AnyJob[]> {
  const jobs: AnyJob[] = []
  for (let job = claimNext(t.db, ctx.now()); job; job = claimNext(t.db, ctx.now())) {
    await runJob(ctx, job)
    jobs.push(getJob(t.db, job.id) as AnyJob)
  }
  return jobs
}

describe('pipedrive-write job', () => {
  it('moves the stage and skips a stage write that arrives after a later stage', async () => {
    updateDeal(t.db, DEAL_ID, { status: 'opened' }, T0)
    queue({ dealId: DEAL_ID, op: 'stage', stage: 'opened' })
    await runAll()
    expect((await storeDeal())?.stage).toBe('opened')

    updateDeal(t.db, DEAL_ID, { status: 'form_sent' }, T0)
    queue({ dealId: DEAL_ID, op: 'stage', stage: 'link_sent' })
    expect((await runAll())[0]?.status).toBe('done')
    expect((await storeDeal())?.stage).toBe('opened')
  })

  it('moves a deal that the owner lost in the form to Form sent before the lost write', async () => {
    updateDeal(
      t.db,
      DEAL_ID,
      { status: 'lost', firstOpenAt: T0.toISOString(), formSentAt: T0.toISOString(), lostAt: T0.toISOString() },
      T0,
    )
    queue({ dealId: DEAL_ID, op: 'stage', stage: 'opened' })
    queue({ dealId: DEAL_ID, op: 'stage', stage: 'form_sent' })
    queue({ dealId: DEAL_ID, op: 'lost', reason: 'Not selling' })
    await runAll()
    expect(await storeDeal()).toMatchObject({ stage: 'form_sent', status: 'lost', lostReason: 'Not selling' })
  })

  it('writes the form ranges, the valuation and the analytics numbers', async () => {
    updateDeal(
      t.db,
      DEAL_ID,
      {
        form: {
          revenue: { kind: 'range', min: 1_000_000, max: 3_000_000 },
          profit: { kind: 'exact', value: 450_000 },
          staff: '20-49',
          timing: 'in_1_3_years',
          notInterestedReason: null,
          custom: [],
          message: null,
          submittedAt: T0.toISOString(),
        },
        valuation: { available: true, low: 1_800_000, high: 2_950_000, p25: 4, p75: 6.5, dealCount: 5, nace2: '25' },
        analytics: {
          opens: 2,
          sessions: 2,
          totalWatchS: 95.6,
          perSlide: [
            { slide: 2, watchS: 18.4, replays: 0 },
            { slide: 1, watchS: 30.6, replays: 1 },
            { slide: 8, watchS: 14.5, replays: 0 },
          ],
          stopSlide: 6,
          replays: 2,
          completed: false,
          days: 1,
          lastEventId: 9,
          channel: 'whatsapp',
        },
      },
      T0,
    )
    queue({ dealId: DEAL_ID, op: 'fields' })
    queue({ dealId: DEAL_ID, op: 'analytics' })
    await runAll()

    expect((await storeDeal())?.fields).toEqual({
      revenueRange: '1000000-3000000 EUR',
      profitRange: '450000 EUR',
      staffRange: '20-49',
      valuationRange: '1800000-2950000 EUR',
      watchTimeS: 96,
      stopSlide: 6,
      replayCount: 2,
      watchPerSlide: '1: 31 s, 2: 18 s, 8: 15 s',
      linkChannel: 'WhatsApp',
    })
  })

  it('keeps the link channel of the stored analytics after the sweep deleted the sessions', async () => {
    const analytics: Omit<DealAnalytics, 'channel'> = { opens: 1, sessions: 1, totalWatchS: 40, perSlide: [], stopSlide: 3, replays: 0, completed: false, days: 1, lastEventId: 4 }
    updateDeal(t.db, DEAL_ID, { analytics: { ...analytics, channel: 'linkedin' } }, T0)
    queue({ dealId: DEAL_ID, op: 'analytics' })
    await runAll()
    expect(sql<{ n: number }>(t.db, 'SELECT COUNT(*) AS n FROM sessions').get()?.n).toBe(0)
    expect((await storeDeal())?.fields).toMatchObject({ watchTimeS: 40, linkChannel: 'LinkedIn' })

    updateDeal(t.db, DEAL_ID, { analytics: { ...analytics, totalWatchS: 55, channel: null } }, T0)
    queue({ dealId: DEAL_ID, op: 'analytics' })
    await runAll()
    expect((await storeDeal())?.fields).toMatchObject({ watchTimeS: 55, linkChannel: 'LinkedIn' })
  })

  it('sets the deal lost with the reason', async () => {
    queue({ dealId: DEAL_ID, op: 'lost', reason: 'Not selling this decade' })
    await runAll()
    expect(await storeDeal()).toMatchObject({ status: 'lost', lostReason: 'Not selling this decade' })
  })

  it('adds the task activities due today, stores the activity ID and marks the activity done', async () => {
    const call = createTask(t.db, DEAL_ID, 'call', null, T0)
    const second = createTask(t.db, DEAL_ID, 'second_channel', 'whatsapp', T0)
    await runAll()

    const activities = (await store()).activities
    expect(activities).toHaveLength(2)
    expect(activities[0]).toMatchObject({ dealId: DEAL_ID, ownerId: 10, type: 'call', subject: 'Call Matti Meikäläinen, Acme Oy', dueDate: '2026-09-26', done: false })
    expect(activities[1]?.subject).toBe('Send the video link on WhatsApp: Matti Meikäläinen, Acme Oy')
    expect(activities[1]?.note).toContain(`/v/${requireDeal(t.db, DEAL_ID).linkCode}?c=whatsapp`)
    expect(getTask(t.db, call?.id ?? 0)?.pipedriveActivityId).toBe(activities[0]?.id)

    completeTask(t.db, second?.id ?? 0, T0)
    await runAll()
    expect((await store()).activities.map((activity) => activity.done)).toEqual([false, true])
  })

  it('writes one note per deal and updates it for each new brief', async () => {
    updateDeal(t.db, DEAL_ID, { status: 'meeting_booked', meetingAt: later(24 * 60).toISOString() }, T0)
    const data = buildBriefData(t.db, DEAL_ID, T0)
    saveBrief(t.db, DEAL_ID, { ...data, questions: null }, 5, T0)
    await runAll()
    const noteId = requireDeal(t.db, DEAL_ID).pipedriveNoteId
    expect(noteId).not.toBeNull()

    saveBrief(t.db, DEAL_ID, { ...buildBriefData(t.db, DEAL_ID, T0), questions: null }, 6, T0)
    await runAll()
    const notes = (await store()).notes
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toBe(noteId)
    expect(notes[0]?.content).toContain('Meeting brief')
    expect(notes[0]?.content).toContain('Meeting: 2026-09-27 15:00 (Europe/Helsinki)')
    expect(notes[0]?.content).toContain(`/deals/${DEAL_ID}`)
  })

  it('writes the Video field and skips a deal that Pipedrive does not have', async () => {
    queue({ op: 'video_field', dealIds: [DEAL_ID, 101, 999] })
    const [job] = await runAll()
    expect(job?.status).toBe('done')
    const deals = (await store()).deals
    expect(deals.map((deal) => deal.videoUrl)).toEqual([`${env.adminBaseUrl}/deals/${DEAL_ID}`, `${env.adminBaseUrl}/deals/101`])
  })

  it('lets the queue retry a Pipedrive error', async () => {
    ctx.providers.pipedrive = Object.assign(Object.create(pipedrive) as FakePipedriveClient, {
      moveStage: async () => {
        throw new ProviderError('Pipedrive HTTP 503', { provider: 'pipedrive', status: 503, retryable: true })
      },
    })
    queue({ dealId: DEAL_ID, op: 'stage', stage: 'link_sent' })
    const [job] = await runAll()
    expect(job).toMatchObject({ status: 'queued', attempts: 1, error: 'Pipedrive HTTP 503' })
  })
})
