import { removeStorage } from './storage-env.ts'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import type { DealPatch } from '../../src/db/rows.ts'
import { buildBriefData, lastOwnerEventId, saveBrief } from '../../src/domain/brief-data.ts'
import { requireDeal } from '../../src/domain/deals.ts'
import { addDealEvent, listEvents } from '../../src/domain/events.ts'
import { listOpenTasks } from '../../src/domain/tasks.ts'
import { runJob } from '../../src/jobs/runner.ts'
import { paths } from '../../src/paths.ts'
import type { PipedriveClient } from '../../src/providers/types.ts'
import { enqueue, getJob, jobKeys, sweepHour } from '../../src/queue/index.ts'
import type { AnyJob, Job } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { T0, insertAnalyst, insertDeal, later } from '../domain/fixtures.ts'
import { fakePipedrive, makeContext } from './helpers.ts'
import type { TestContext } from './helpers.ts'

const NOW = later(49 * 60)
const FAR = later(60 * 24 * 30).toISOString()

let t: TempDb
let ctx: TestContext
let sweeps = 0

afterAll(removeStorage)

beforeEach(async () => {
  t = tempDb()
  ctx = makeContext(t.db, { now: NOW, providers: { pipedrive: (await fakePipedrive()).client } })
  insertAnalyst(t.db)
})

afterEach(() => t.close())

function published(id: number, patch: DealPatch = {}): void {
  insertDeal(t.db, { id, patch: { status: 'link_sent', publishedVersion: 1, publishedAt: T0.toISOString(), expiresAt: FAR, ...patch } })
}

function addSession(dealId: number, channel: string, startedAt: Date): void {
  sql(
    t.db,
    `INSERT INTO sessions (id, deal_id, version, started_at, last_seen_at, local_day, channel, device, browser, os, screen)
     VALUES (?, ?, 1, ?, ?, '2026-09-26', ?, 'mobile', 'Safari', 'iOS', '390x844')`,
  ).run(`session-${dealId}-${channel}`, dealId, startedAt.toISOString(), startedAt.toISOString(), channel)
}

async function sweep(now: Date = NOW): Promise<AnyJob> {
  ctx.clock.now = now
  const job = enqueue(t.db, 'sweep', `${jobKeys.sweep(now)}:${++sweeps}`, { hour: sweepHour(now) }, { now })
  if (!job) throw new Error('The sweep job was not queued')
  sql(t.db, `UPDATE jobs SET status = 'running', attempts = 1 WHERE id = ?`).run(job.id)
  await runJob(ctx, { ...job, status: 'running', attempts: 1 })
  return getJob(t.db, job.id) as AnyJob
}

function queued<T extends AnyJob['type']>(type: T): Job<T>[] {
  return sql<{ id: number }>(t.db, `SELECT id FROM jobs WHERE type = ? AND status = 'queued' ORDER BY id`)
    .all(type)
    .map((row) => getJob(t.db, row.id) as Job<T>)
}

describe('sweep job', () => {
  it('makes a call task only for a published deal with no open after 48 hours, and only once', async () => {
    published(100)
    published(101, { publishedAt: later(2 * 60).toISOString() })
    published(102, { status: 'opened', firstOpenAt: later(60).toISOString() })
    published(103, { status: 'meeting_booked', meetingAt: FAR })

    expect((await sweep()).status).toBe('done')
    expect(listOpenTasks(t.db).map((task) => [task.dealId, task.type])).toEqual([
      [100, 'call'],
      [102, 'second_channel'],
    ])
    expect(queued('pipedrive-write').map((job) => job.payload)).toEqual(
      expect.arrayContaining([expect.objectContaining({ dealId: 100, op: 'activity' })]),
    )

    await sweep(later(49 * 60 + 60 - 1))
    expect(listOpenTasks(t.db)).toHaveLength(2)
    expect(listEvents(t.db, 100, { types: ['task_created'] })).toHaveLength(1)
  })

  it('picks the next second channel when the default channel is the channel of the first session', async () => {
    published(100, { status: 'opened', firstOpenAt: later(30).toISOString() })
    addSession(100, 'linkedin', later(30))
    addSession(100, 'email', later(40))
    published(101, { status: 'opened', firstOpenAt: later(30).toISOString() })
    addSession(101, 'sms', later(30))
    published(102, { status: 'opened', firstOpenAt: later(3 * 60).toISOString() })

    await sweep()

    expect(listOpenTasks(t.db).map((task) => [task.dealId, task.type, task.channel]).sort()).toEqual([
      [100, 'second_channel', 'whatsapp'],
      [101, 'second_channel', 'linkedin'],
    ])
  })

  it('purges an expired link and makes no task for it', async () => {
    published(100, { expiresAt: later(48 * 60).toISOString() })
    published(101)
    addSession(100, 'email', later(10))
    addDealEvent(t.db, 100, 'form_sent', {}, later(20))
    const file = path.join(paths.dealDir(100), 'video-720.v1.mp4')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'video')

    await sweep()

    const deal = requireDeal(t.db, 100)
    expect(deal.expiredAt).toBe(NOW.toISOString())
    expect(listEvents(t.db, 100)).toEqual([])
    await expect(stat(paths.dealDir(100))).rejects.toThrow()
    expect(listOpenTasks(t.db).map((task) => task.dealId)).toEqual([101])
  })

  it('queues the Video field write for the Pipedrive deals without the field', async () => {
    await sweep()

    expect(queued('pipedrive-write').map((job) => [job.key, job.payload])).toEqual([
      [jobKeys.pipedriveWrite(null, 'video_field', `${sweepHour(NOW)}-0`), { op: 'video_field', dealIds: [100, 101] }],
    ])
  })

  it('queues a meeting brief for a meeting in the next 3 hours with owner events after the newest brief', async () => {
    published(100, { status: 'meeting_booked', meetingAt: later(49 * 60 + 150).toISOString() })
    published(101, { status: 'meeting_booked', meetingAt: later(49 * 60 + 300).toISOString() })
    published(102, { status: 'meeting_booked', meetingAt: later(49 * 60 + 120).toISOString() })
    for (const id of [100, 101, 102]) addDealEvent(t.db, id, 'meeting_booked', {}, later(60))
    saveBrief(t.db, 102, { ...buildBriefData(t.db, 102, later(61)), questions: null }, lastOwnerEventId(t.db, 102) ?? 0, later(61))

    await sweep()

    const lastEventId = lastOwnerEventId(t.db, 100) ?? 0
    expect(queued('write-brief').map((job) => [job.key, job.payload])).toEqual([
      [jobKeys.brief(100, lastEventId), { dealId: 100, lastEventId }],
    ])

    addDealEvent(t.db, 102, 'form_sent', {}, later(49 * 60 + 30))
    await sweep(later(50 * 60))
    expect(queued('write-brief').map((job) => job.dealId)).toEqual([100, 102])
  })

  it('runs every check even when one fails, and lets the queue retry the sweep', async () => {
    published(100)
    ctx.providers.pipedrive = Object.assign(Object.create(ctx.providers.pipedrive) as PipedriveClient, {
      listOpenDeals: async () => {
        throw new Error('Pipedrive HTTP 503')
      },
    })

    const job = await sweep()

    expect(job).toMatchObject({ status: 'queued', attempts: 1 })
    expect(job.error).toContain('videoFields: Pipedrive HTTP 503')
    expect(listOpenTasks(t.db).map((task) => task.dealId)).toEqual([100])
  })
})
