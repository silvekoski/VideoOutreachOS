import { removeStorage } from './storage-env.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { getDeal } from '../../src/domain/deals.ts'
import { recoverStoppedJobs, runJob } from '../../src/jobs/runner.ts'
import { claimNext, enqueue, getJob, jobKeys, jobsForDeal } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, T0, insertAnalyst, insertDeal } from '../domain/fixtures.ts'
import { makeContext } from './helpers.ts'
import type { TestContext } from './helpers.ts'

let t: TempDb
let ctx: TestContext

afterAll(removeStorage)

beforeEach(() => {
  t = tempDb()
  ctx = makeContext(t.db, { now: T0 })
  insertAnalyst(t.db)
  insertDeal(t.db)
})

afterEach(() => t.close())

function markRunning(key: string, attempts: number): void {
  sql(t.db, `UPDATE jobs SET status = 'running', attempts = ? WHERE idempotency_key = ?`).run(attempts, key)
}

describe('job runner', () => {
  it('requeues the jobs of a stopped worker and ends a job with no attempts left as a final failure', async () => {
    enqueue(t.db, 'scrape', jobKeys.scrape(DEAL_ID), { dealId: DEAL_ID }, { now: T0 })
    markRunning(jobKeys.scrape(DEAL_ID), 3)
    enqueue(t.db, 'backup', jobKeys.backup(T0), { date: '2026-09-26' }, { now: T0 })
    markRunning(jobKeys.backup(T0), 1)

    await recoverStoppedJobs(ctx)

    const [scrape] = jobsForDeal(t.db, DEAL_ID, ['scrape'])
    expect(scrape).toMatchObject({ status: 'failed', error: 'The worker stopped while the job was running' })
    expect(getDeal(t.db, DEAL_ID)?.scrape).toMatchObject({ ok: false, reason: 'error', homeUrl: 'https://acme.test/' })
    expect(jobsForDeal(t.db, DEAL_ID, ['write-script']).map((job) => job.payload)).toEqual([
      { dealId: DEAL_ID, version: 1, slides: [2, 3, 4, 5, 6, 7, 8], lines: false },
    ])
    expect(claimNext(t.db, T0)).toMatchObject({ key: jobKeys.backup(T0), attempts: 2 })
  })

  it('fails a job at once when its deal does not exist', async () => {
    enqueue(t.db, 'scrape', jobKeys.scrape(999), { dealId: 999 }, { now: T0 })
    const job = claimNext(t.db, T0) as AnyJob
    await runJob(ctx, job)
    expect(getJob(t.db, job.id)).toMatchObject({ status: 'failed', attempts: 1, error: 'Deal 999 does not exist' })
  })
})
