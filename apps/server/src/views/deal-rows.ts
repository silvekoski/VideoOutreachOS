import { t } from '@mergero/shared'
import type { DealRowDto, DealStatus } from '@mergero/shared'
import type { Db } from '../db/index.ts'
import type { DealRow, TaskRow } from '../db/rows.ts'
import { listAnalysts } from '../domain/analysts.ts'
import { newestBrief } from '../domain/brief-data.ts'
import { listDeals } from '../domain/deals.ts'
import { listOpenTasks } from '../domain/tasks.ts'
import { failedJobs } from '../queue/index.ts'
import { countsAsFailure, dealDone, meetingUpcoming, pendingVersion } from './inbox.ts'

const CHANNEL_NAMES = t('en').channels

export interface DealListFilter {
  analystId?: number
  country?: string
  status?: DealStatus
  q?: string
}

function searchText(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('en-US')
}

function matches(deal: DealRow, query: string): boolean {
  const { company, ownerName, title } = deal.snapshot
  return [company, ownerName, title, String(deal.id)].some((field) => searchText(field).includes(query))
}

function nextAction(db: Db, deal: DealRow, failed: boolean, task: TaskRow | undefined, now: Date): string | null {
  if (failed) return 'Retry the failed job'
  if (dealDone(deal, now)) return null
  if (deal.status === 'review') return 'Review the video'
  if (deal.status === 'failed') return 'Check the failed video'
  if (pendingVersion(db, deal, now) !== null) return 'Review the new version'
  if (meetingUpcoming(deal, now)) return newestBrief(db, deal.id) ? 'Read the meeting brief' : 'Prepare the meeting'
  if (task?.type === 'call') return 'Call the owner'
  if (task?.type === 'second_channel' && task.channel !== null) return `Send the link on ${CHANNEL_NAMES[task.channel]}`
  return null
}

export function dealRowDtos(db: Db, filter: DealListFilter, now: Date): DealRowDto[] {
  const query = filter.q ? searchText(filter.q.trim()) : ''
  const deals = listDeals(db, { analystId: filter.analystId, country: filter.country, status: filter.status }).filter(
    (deal) => query === '' || matches(deal, query),
  )
  if (deals.length === 0) return []
  const byId = new Map(deals.map((deal) => [deal.id, deal]))
  const failed = new Set<number>()
  for (const job of failedJobs(db, filter.analystId === undefined ? {} : { analystId: filter.analystId })) {
    const deal = job.dealId === null ? undefined : byId.get(job.dealId)
    if (deal && countsAsFailure(job, deal, now)) failed.add(deal.id)
  }
  const tasks = new Map<number, TaskRow>()
  for (const task of listOpenTasks(db, { analystId: filter.analystId })) if (!tasks.has(task.dealId)) tasks.set(task.dealId, task)
  const analysts = new Map(listAnalysts(db).map((analyst) => [analyst.id, analyst.name]))
  return deals.map((deal) => ({
    id: deal.id,
    company: deal.snapshot.company,
    country: deal.country,
    analystId: deal.analystId,
    analystName: analysts.get(deal.analystId) ?? `Analyst ${deal.analystId}`,
    status: deal.status,
    watchS: deal.analytics?.totalWatchS ?? 0,
    nextAction: nextAction(db, deal, failed.has(deal.id), tasks.get(deal.id), now),
    updatedAt: deal.updatedAt,
  }))
}
