import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { parseJson } from '../db/rows.ts'
import { ProviderError } from '../providers/errors.ts'
import { backupDate, jobKeys, sweepHour } from './keys.ts'
import type { AnyJob, Job, JobPayloads, JobStatus, JobType } from './types.ts'

export const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 30_000
const MAX_ERROR_LENGTH = 2000
const WORKER_STOPPED = 'The worker stopped while the job was running'
const SUPERSEDABLE: readonly JobType[] = ['audio', 'render', 'write-brief']

export class NonRetryableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'NonRetryableError'
  }
}

interface JobColumns {
  id: number
  type: JobType
  payload: string
  status: JobStatus
  run_at: string
  attempts: number
  error: string | null
  idempotency_key: string
  deal_id: number | null
  analyst_id: number | null
  created_at: string
  updated_at: string
}

function toJob(c: JobColumns): AnyJob {
  return {
    id: c.id,
    type: c.type,
    payload: parseJson<JobPayloads[JobType]>(c.payload),
    status: c.status,
    runAt: c.run_at,
    attempts: c.attempts,
    error: c.error,
    key: c.idempotency_key,
    dealId: c.deal_id,
    analystId: c.analyst_id,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  } as AnyJob
}

function numberField(payload: object, field: 'dealId' | 'analystId'): number | null {
  const value = (payload as Record<string, unknown>)[field]
  return typeof value === 'number' ? value : null
}

export function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message || error.name : String(error)
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 3)}...` : text
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof NonRetryableError) return false
  if (error instanceof ProviderError) return error.retryable
  return true
}

export function retryDelayMs(attempts: number): number {
  return BASE_DELAY_MS * 4 ** Math.max(0, attempts - 1)
}

export interface EnqueueOptions {
  runAt?: Date
  dealId?: number | null
  analystId?: number | null
  now?: Date
}

export function enqueue<T extends JobType>(
  db: Db,
  type: T,
  key: string,
  payload: JobPayloads[T],
  options: EnqueueOptions = {},
): Job<T> | null {
  const now = nowIso(options.now)
  const row = sql<JobColumns>(
    db,
    `INSERT INTO jobs (type, payload, status, run_at, attempts, idempotency_key, deal_id, analyst_id, created_at, updated_at)
     VALUES (?, ?, 'queued', ?, 0, ?, ?, ?, ?, ?)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
  ).get(
    type,
    JSON.stringify(payload),
    options.runAt ? nowIso(options.runAt) : now,
    key,
    options.dealId !== undefined ? options.dealId : numberField(payload, 'dealId'),
    options.analystId !== undefined ? options.analystId : numberField(payload, 'analystId'),
    now,
    now,
  )
  return row ? (toJob(row) as Job<T>) : null
}

export function enqueuePeriodicJobs(db: Db, now: Date = new Date()): void {
  enqueue(db, 'sweep', jobKeys.sweep(now), { hour: sweepHour(now) }, { now })
  enqueue(db, 'backup', jobKeys.backup(now), { date: backupDate(now) }, { now })
}

export function getJob(db: Db, id: number): AnyJob | null {
  const row = sql<JobColumns>(db, 'SELECT * FROM jobs WHERE id = ?').get(id)
  return row ? toJob(row) : null
}

export function jobsForDeal(db: Db, dealId: number, types?: readonly JobType[]): AnyJob[] {
  return sql<JobColumns>(db, 'SELECT * FROM jobs WHERE deal_id = ? ORDER BY id')
    .all(dealId)
    .filter((row) => !types || types.includes(row.type))
    .map(toJob)
}

export function claimNext(db: Db, now: Date = new Date()): AnyJob | null {
  const at = nowIso(now)
  return transaction(db, () => {
    const row = sql<JobColumns>(
      db,
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ?
       WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY run_at, id LIMIT 1)
       RETURNING *`,
    ).get(at, at)
    return row ? toJob(row) : null
  })
}

export function completeJob(db: Db, id: number, now: Date = new Date()): boolean {
  return (
    sql(db, `UPDATE jobs SET status = 'done', error = NULL, updated_at = ? WHERE id = ? AND status = 'running'`).run(
      nowIso(now),
      id,
    ).changes > 0
  )
}

export type FailOutcome =
  | { status: 'queued'; attempts: number; runAt: string; error: string }
  | { status: 'failed'; attempts: number; error: string }

export function failJob(db: Db, id: number, error: unknown, now: Date = new Date()): FailOutcome | null {
  const text = errorText(error)
  return transaction(db, () => {
    const job = getJob(db, id)
    if (!job || job.status !== 'running') return null
    if (!isRetryable(error) || job.attempts >= MAX_ATTEMPTS) {
      sql(db, `UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`).run(text, nowIso(now), id)
      return { status: 'failed', attempts: job.attempts, error: text }
    }
    const runAt = nowIso(new Date(now.getTime() + retryDelayMs(job.attempts)))
    sql(db, `UPDATE jobs SET status = 'queued', run_at = ?, error = ?, updated_at = ? WHERE id = ?`).run(
      runAt,
      text,
      nowIso(now),
      id,
    )
    return { status: 'queued', attempts: job.attempts, runAt, error: text }
  })
}

export function resetRunningJobs(db: Db, now: Date = new Date()): { requeued: number; failed: AnyJob[] } {
  const at = nowIso(now)
  return transaction(db, () => {
    const failed = sql<JobColumns>(
      db,
      `UPDATE jobs SET status = 'failed', error = ?, updated_at = ? WHERE status = 'running' AND attempts >= ? RETURNING *`,
    )
      .all(WORKER_STOPPED, at, MAX_ATTEMPTS)
      .map(toJob)
    const requeued = sql(db, `UPDATE jobs SET status = 'queued', run_at = ?, updated_at = ? WHERE status = 'running'`).run(
      at,
      at,
    ).changes
    return { requeued, failed }
  })
}

export function retryJob(db: Db, id: number, now: Date = new Date()): AnyJob | null {
  const at = nowIso(now)
  const row = sql<JobColumns>(
    db,
    `UPDATE jobs SET status = 'queued', attempts = 0, run_at = ?, error = NULL, updated_at = ?
     WHERE id = ? AND status = 'failed' RETURNING *`,
  ).get(at, at, id)
  return row ? toJob(row) : null
}

export interface FailedJobFilter {
  dealId?: number
  analystId?: number
  type?: JobType
  includeGlobal?: boolean
}

export function failedJobs(db: Db, filter: FailedJobFilter = {}): AnyJob[] {
  const where = [
    `j.status = 'failed'`,
    `NOT (j.deal_id IS NOT NULL AND j.type IN (${SUPERSEDABLE.map(() => '?').join(', ')}) AND EXISTS (
      SELECT 1 FROM jobs later WHERE later.deal_id = j.deal_id AND later.type = j.type AND later.id > j.id AND later.status = 'done'))`,
  ]
  const params: unknown[] = [...SUPERSEDABLE]
  if (filter.dealId !== undefined) {
    where.push('j.deal_id = ?')
    params.push(filter.dealId)
  }
  if (filter.type !== undefined) {
    where.push('j.type = ?')
    params.push(filter.type)
  }
  if (filter.analystId !== undefined) {
    const global = filter.includeGlobal ? ' OR (j.deal_id IS NULL AND j.analyst_id IS NULL)' : ''
    where.push(`(j.analyst_id = ? OR d.analyst_id = ?${global})`)
    params.push(filter.analystId, filter.analystId)
  }
  return sql<JobColumns>(
    db,
    `SELECT j.* FROM jobs j LEFT JOIN deals d ON d.id = j.deal_id WHERE ${where.join(' AND ')} ORDER BY j.updated_at DESC, j.id DESC`,
  )
    .all(...params)
    .map(toJob)
}

export function hasQueuedJob<T extends JobType>(
  db: Db,
  type: T,
  dealId: number,
  predicate: (payload: JobPayloads[T]) => boolean = () => true,
): boolean {
  return sql<{ payload: string }>(db, `SELECT payload FROM jobs WHERE type = ? AND deal_id = ? AND status = 'queued'`)
    .all(type, dealId)
    .some((row) => predicate(parseJson<JobPayloads[T]>(row.payload)))
}
