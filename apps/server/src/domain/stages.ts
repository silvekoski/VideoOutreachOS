import type { DealEventType, DealStatus, Stage, StoredEvent } from '@mergero/shared'
import { nowIso, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import type { DealRow } from '../db/rows.ts'
import { enqueue, hasQueuedJob, jobKeys } from '../queue/index.ts'
import type { Job } from '../queue/index.ts'
import { requireDeal, updateDeal } from './deals.ts'
import { DomainError } from './errors.ts'
import { addDealEvent } from './events.ts'
import { completeTask, listOpenTasks } from './tasks.ts'

const ANALYTICS_DELAY_MS = 60_000

const STATUS_RANK: Record<DealStatus, number> = {
  draft: -1,
  review: -1,
  failed: -1,
  link_sent: 0,
  opened: 1,
  form_sent: 2,
  meeting_booked: 3,
  lost: 4,
}

const STAGE_EVENTS: Partial<Record<Stage, DealEventType>> = {
  form_sent: 'form_sent',
  meeting_booked: 'meeting_booked',
}

export function stageRank(status: DealStatus): number {
  return STATUS_RANK[status]
}

export function reachedStage(deal: DealRow): DealStatus {
  if (deal.status !== 'lost') return deal.status
  if (deal.meetingAt !== null) return 'meeting_booked'
  if (deal.formSentAt !== null) return 'form_sent'
  if (deal.firstOpenAt !== null) return 'opened'
  return 'link_sent'
}

export function isPublishedStatus(status: DealStatus): boolean {
  return stageRank(status) >= 0
}

export interface StageMove {
  moved: boolean
  event: StoredEvent | null
}

export function moveStage(
  db: Db,
  dealId: number,
  stage: Stage,
  options: { data?: Record<string, unknown>; now?: Date } = {},
): StageMove {
  const now = options.now ?? new Date()
  return transaction(db, () => {
    const deal = requireDeal(db, dealId)
    if (deal.publishedVersion === null) throw new DomainError(409, 'The video link is not published')
    const action = STAGE_EVENTS[stage]
    const event = action ? addDealEvent(db, dealId, action, options.data ?? {}, now) : null
    if (deal.status === 'lost' || stageRank(stage) <= stageRank(deal.status)) return { moved: false, event }
    updateDeal(db, dealId, { status: stage }, now)
    const linkSent = stage === 'link_sent' ? addDealEvent(db, dealId, 'link_sent', options.data ?? {}, now) : null
    enqueue(db, 'pipedrive-write', jobKeys.pipedriveWrite(dealId, 'stage', stage), { dealId, op: 'stage', stage }, { now })
    if (stage === 'meeting_booked') closeOpenTasks(db, dealId, now)
    return { moved: true, event: event ?? linkSent }
  })
}

export function markLost(db: Db, dealId: number, reason: string, now: Date = new Date()): StageMove {
  const text = reason.trim()
  return transaction(db, () => {
    const deal = requireDeal(db, dealId)
    if (deal.status === 'lost') return { moved: false, event: null }
    closeOpenTasks(db, dealId, now)
    updateDeal(db, dealId, { status: 'lost', lostAt: nowIso(now), lostReason: text || null }, now)
    const event = addDealEvent(db, dealId, 'lost', { reason: text }, now)
    enqueue(
      db,
      'pipedrive-write',
      jobKeys.pipedriveWrite(dealId, 'lost', event.id),
      { dealId, op: 'lost', reason: text },
      { now },
    )
    return { moved: true, event }
  })
}

export function closeOpenTasks(db: Db, dealId: number, now: Date = new Date()): number {
  return transaction(db, () => {
    const tasks = listOpenTasks(db, { dealId })
    for (const task of tasks) completeTask(db, task.id, now)
    return tasks.length
  })
}

export function enqueuePipedriveAnalytics(db: Db, dealId: number, now: Date = new Date()): Job<'pipedrive-write'> | null {
  return transaction(db, () => {
    if (hasQueuedJob(db, 'pipedrive-write', dealId, (payload) => payload.op === 'analytics')) return null
    return enqueue(
      db,
      'pipedrive-write',
      jobKeys.pipedriveWrite(dealId, 'analytics', now.getTime()),
      { dealId, op: 'analytics' },
      { now, runAt: new Date(now.getTime() + ANALYTICS_DELAY_MS) },
    )
  })
}
