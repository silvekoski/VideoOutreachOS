import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { ProviderError } from '../../src/providers/errors.ts'
import {
  MAX_ATTEMPTS,
  NonRetryableError,
  claimNext,
  completeJob,
  enqueue,
  enqueuePeriodicJobs,
  failJob,
  failedJobs,
  getJob,
  hasQueuedJob,
  jobKeys,
  resetRunningJobs,
  retryDelayMs,
  retryJob,
} from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'

const T0 = new Date('2026-09-26T12:00:00.000Z')
const seconds = (s: number) => new Date(T0.getTime() + s * 1000)

let t: TempDb

beforeEach(() => {
  t = tempDb()
})

afterEach(() => {
  t.close()
})

function insertDealRow(id: number, analystId: number): void {
  const at = T0.toISOString()
  sql(t.db, 'INSERT OR IGNORE INTO analysts (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(analystId, 'A', at, at)
  sql(
    t.db,
    `INSERT INTO deals (id, analyst_id, status, link_code, language, page_language, country, snapshot, expiry_days, created_at, updated_at)
     VALUES (?, ?, 'draft', ?, 'fi', 'fi', 'FI', '{}', 30, ?, ?)`,
  ).run(id, analystId, `code${id}`.padEnd(22, 'x'), at, at)
}

describe('enqueue', () => {
  it('ignores a second job with the same key', () => {
    const first = enqueue(t.db, 'scrape', jobKeys.scrape(5), { dealId: 5 }, { now: T0 })
    expect(first).toMatchObject({ type: 'scrape', status: 'queued', attempts: 0, dealId: 5, key: 'scrape:5', runAt: T0.toISOString() })
    expect(enqueue(t.db, 'scrape', jobKeys.scrape(5), { dealId: 5 }, { now: T0 })).toBeNull()
    expect(sql<{ n: number }>(t.db, 'SELECT COUNT(*) AS n FROM jobs').get()?.n).toBe(1)
  })

  it('takes the deal and the analyst from the payload unless the options give them', () => {
    const intro = enqueue(
      t.db,
      'audio',
      jobKeys.audioIntro(3, 'fi', '2026-09-26T10:00:00.000Z'),
      { kind: 'intro', analystId: 3, lang: 'fi', uploadFile: 'cache/uploads/x.webm', recordedAt: '2026-09-26T10:00:00.000Z' },
      { now: T0 },
    )
    expect(intro).toMatchObject({ dealId: null, analystId: 3, key: 'audio-intro:3:fi:2026-09-26T10:00:00.000Z' })
    const preview = enqueue(t.db, 'render', jobKeys.renderPreview('abc'), { kind: 'preview', sceneHash: 'abc' }, { analystId: 9 })
    expect(preview).toMatchObject({ dealId: null, analystId: 9 })
  })

  it('builds the keys of the architecture table', () => {
    expect(jobKeys.writeScript(4, 2, [7, 3, 3])).toBe('write-script:4:2:3-7')
    expect(jobKeys.audioSlides(4, 2, 1)).toBe('audio:4:2:1')
    expect(jobKeys.render(4, 2)).toBe('render:4:2')
    expect(jobKeys.brief(4, 88)).toBe('brief:4:88')
    expect(jobKeys.pipedriveWrite(4, 'stage', 'opened')).toBe('pipedrive-write:4:stage:opened')
    expect(jobKeys.pipedriveWrite(null, 'video_field', '2026-09-26T12')).toBe('pipedrive-write:all:video_field:2026-09-26T12')
    expect(jobKeys.sweep(new Date('2026-09-26T12:59:59.000Z'))).toBe('sweep:2026-09-26T12')
    expect(jobKeys.backup(T0)).toBe('backup:2026-09-26')
  })

  it('adds the sweep of each hour and the backup of each day once', () => {
    enqueuePeriodicJobs(t.db, T0)
    enqueuePeriodicJobs(t.db, seconds(30))
    enqueuePeriodicJobs(t.db, seconds(3600))
    const keys = sql<{ idempotency_key: string }>(t.db, 'SELECT idempotency_key FROM jobs ORDER BY id').all()
    expect(keys.map((row) => row.idempotency_key)).toEqual(['sweep:2026-09-26T12', 'backup:2026-09-26', 'sweep:2026-09-26T13'])
  })
})

describe('claimNext', () => {
  it('claims the oldest due job by run time and ID', () => {
    const late = enqueue(t.db, 'sweep', 'a', { hour: 'a' }, { now: T0, runAt: seconds(60) })
    const first = enqueue(t.db, 'sweep', 'b', { hour: 'b' }, { now: T0, runAt: seconds(-10) })
    const second = enqueue(t.db, 'sweep', 'c', { hour: 'c' }, { now: T0 })
    const third = enqueue(t.db, 'sweep', 'd', { hour: 'd' }, { now: T0 })
    expect(claimNext(t.db, T0)?.id).toBe(first?.id)
    expect(claimNext(t.db, T0)?.id).toBe(second?.id)
    const claimed = claimNext(t.db, T0)
    expect(claimed).toMatchObject({ id: third?.id, status: 'running', attempts: 1 })
    expect(claimNext(t.db, T0)).toBeNull()
    expect(claimNext(t.db, seconds(60))?.id).toBe(late?.id)
  })

  it('does not claim a running, done or failed job', () => {
    const job = enqueue(t.db, 'sweep', 'a', { hour: 'a' }, { now: T0 })
    claimNext(t.db, T0)
    expect(claimNext(t.db, T0)).toBeNull()
    expect(completeJob(t.db, job?.id ?? 0, T0)).toBe(true)
    expect(getJob(t.db, job?.id ?? 0)?.status).toBe('done')
    expect(claimNext(t.db, T0)).toBeNull()
  })
})

describe('failJob', () => {
  it('retries with a backoff of 30 s times 4 to the power of attempts minus 1, then fails after 3 attempts', () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([30_000, 120_000, 480_000])
    const job = enqueue(t.db, 'scrape', 'scrape:1', { dealId: 1 }, { now: T0 })
    const id = job?.id ?? 0

    claimNext(t.db, T0)
    expect(failJob(t.db, id, new Error('HTTP 503'), T0)).toEqual({
      status: 'queued',
      attempts: 1,
      runAt: seconds(30).toISOString(),
      error: 'HTTP 503',
    })
    expect(claimNext(t.db, seconds(29))).toBeNull()
    expect(claimNext(t.db, seconds(30))?.attempts).toBe(2)
    expect(failJob(t.db, id, new Error('HTTP 503 again'), seconds(30))).toMatchObject({
      status: 'queued',
      attempts: 2,
      runAt: seconds(150).toISOString(),
    })
    expect(getJob(t.db, id)).toMatchObject({ status: 'queued', error: 'HTTP 503 again' })

    expect(claimNext(t.db, seconds(150))?.attempts).toBe(MAX_ATTEMPTS)
    expect(failJob(t.db, id, 'timeout', seconds(150))).toEqual({ status: 'failed', attempts: 3, error: 'timeout' })
    expect(getJob(t.db, id)).toMatchObject({ status: 'failed', attempts: 3, error: 'timeout' })
    expect(claimNext(t.db, seconds(10_000))).toBeNull()
  })

  it('fails a NonRetryableError at once', () => {
    const job = enqueue(t.db, 'audio', 'audio:1:1:1', { kind: 'slides', dealId: 1, version: 1 }, { now: T0 })
    claimNext(t.db, T0)
    expect(failJob(t.db, job?.id ?? 0, new NonRetryableError('slide 4 failed'), T0)).toEqual({
      status: 'failed',
      attempts: 1,
      error: 'slide 4 failed',
    })
  })

  it('fails a provider error that is not retryable at once', () => {
    const job = enqueue(t.db, 'scrape', 'scrape:2', { dealId: 2 }, { now: T0 })
    claimNext(t.db, T0)
    const error = new ProviderError('HTTP 401', { provider: 'firecrawl', retryable: false, status: 401 })
    expect(failJob(t.db, job?.id ?? 0, error, T0)?.status).toBe('failed')
  })

  it('ignores a job that is not running', () => {
    const job = enqueue(t.db, 'scrape', 'scrape:3', { dealId: 3 }, { now: T0 })
    expect(failJob(t.db, job?.id ?? 0, new Error('x'), T0)).toBeNull()
    expect(failJob(t.db, 999, new Error('x'), T0)).toBeNull()
  })
})

describe('recovery and retry', () => {
  it('puts running jobs back in the queue and fails the jobs that used all attempts', () => {
    const a = enqueue(t.db, 'sweep', 'a', { hour: 'a' }, { now: T0 })
    const b = enqueue(t.db, 'sweep', 'b', { hour: 'b' }, { now: T0 })
    claimNext(t.db, T0)
    claimNext(t.db, T0)
    sql(t.db, 'UPDATE jobs SET attempts = 3 WHERE id = ?').run(b?.id)
    const result = resetRunningJobs(t.db, seconds(5))
    expect(result.requeued).toBe(1)
    expect(result.failed.map((job) => job.id)).toEqual([b?.id])
    expect(getJob(t.db, a?.id ?? 0)).toMatchObject({ status: 'queued', runAt: seconds(5).toISOString() })
    expect(getJob(t.db, b?.id ?? 0)).toMatchObject({ status: 'failed', error: 'The worker stopped while the job was running' })
  })

  it('retries a failed job from the Inbox with a new attempt count', () => {
    const job = enqueue(t.db, 'render', 'render:1:1', { kind: 'deal', dealId: 1, version: 1 }, { now: T0 })
    const id = job?.id ?? 0
    claimNext(t.db, T0)
    failJob(t.db, id, new NonRetryableError('chrome crashed'), T0)
    expect(retryJob(t.db, id, seconds(60))).toMatchObject({ status: 'queued', attempts: 0, error: null, runAt: seconds(60).toISOString() })
    expect(retryJob(t.db, id, seconds(60))).toBeNull()
  })

  it('lists failed jobs per deal and analyst and hides a job that a later job of the same kind replaced', () => {
    insertDealRow(1, 10)
    insertDealRow(2, 20)
    const fail = (type: 'render' | 'scrape' | 'backup', key: string, payload: never, options = {}) => {
      const job = enqueue(t.db, type, key, payload, { now: T0, ...options })
      claimNext(t.db, T0)
      failJob(t.db, job?.id ?? 0, new NonRetryableError(`${key} failed`), T0)
      return job?.id ?? 0
    }
    const oldRender = fail('render', 'render:1:1', { kind: 'deal', dealId: 1, version: 1 } as never)
    const scrape = fail('scrape', 'scrape:2', { dealId: 2 } as never)
    const backup = fail('backup', 'backup:x', { date: 'x' } as never)
    expect(failedJobs(t.db).map((job) => job.id)).toEqual([backup, scrape, oldRender])
    expect(failedJobs(t.db, { analystId: 10 }).map((job) => job.id)).toEqual([oldRender])
    expect(failedJobs(t.db, { analystId: 20, includeGlobal: true }).map((job) => job.id)).toEqual([backup, scrape])
    expect(failedJobs(t.db, { dealId: 2, type: 'scrape' }).map((job) => job.id)).toEqual([scrape])

    const newRender = enqueue(t.db, 'render', 'render:1:2', { kind: 'deal', dealId: 1, version: 2 }, { now: T0 })
    claimNext(t.db, T0)
    completeJob(t.db, newRender?.id ?? 0, T0)
    expect(failedJobs(t.db, { analystId: 10 })).toEqual([])
  })

  it('finds a queued job of a deal by its payload', () => {
    enqueue(t.db, 'pipedrive-write', 'pipedrive-write:1:analytics:1', { dealId: 1, op: 'analytics' }, { now: T0 })
    enqueue(t.db, 'pipedrive-write', 'pipedrive-write:1:stage:opened', { dealId: 1, op: 'stage', stage: 'opened' }, { now: T0 })
    expect(hasQueuedJob(t.db, 'pipedrive-write', 1, (payload) => payload.op === 'analytics')).toBe(true)
    expect(hasQueuedJob(t.db, 'pipedrive-write', 1, (payload) => payload.op === 'lost')).toBe(false)
    expect(hasQueuedJob(t.db, 'pipedrive-write', 2)).toBe(false)
    const claimed = claimNext(t.db, T0)
    expect(claimed?.key).toBe('pipedrive-write:1:analytics:1')
    expect(hasQueuedJob(t.db, 'pipedrive-write', 1, (payload) => payload.op === 'analytics')).toBe(false)
  })
})
