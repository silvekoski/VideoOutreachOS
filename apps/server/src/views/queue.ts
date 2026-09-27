import type { QueueItemDto } from '@mergero/shared'
import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { PIPELINE_JOBS } from '../domain/pipeline.ts'
import type { JobStatus, JobType } from '../queue/index.ts'

interface QueueRow {
  deal_id: number
  type: JobType
  status: JobStatus
  run_at: string
  error: string | null
  company: string | null
  analyst_name: string
}

export function renderQueue(db: Db): QueueItemDto[] {
  const rows = sql<QueueRow>(
    db,
    `SELECT j.deal_id, j.type, j.status, j.run_at, j.error, json_extract(d.snapshot, '$.company') AS company, a.name AS analyst_name
     FROM jobs j JOIN deals d ON d.id = j.deal_id JOIN analysts a ON a.id = d.analyst_id
     WHERE j.status IN ('queued', 'running') AND j.type IN (${PIPELINE_JOBS.map(() => '?').join(', ')})
     ORDER BY j.status = 'running' DESC, j.run_at, j.id`,
  ).all(...PIPELINE_JOBS)
  const items = new Map<number, QueueItemDto>()
  for (const row of rows) {
    if (items.has(row.deal_id)) continue
    items.set(row.deal_id, {
      dealId: row.deal_id,
      company: row.company ?? `Deal ${row.deal_id}`,
      analystName: row.analyst_name,
      step: row.type,
      state: row.status === 'running' ? 'running' : row.error !== null ? 'retrying' : 'queued',
      runAt: row.run_at,
    })
  }
  return [...items.values()]
}
