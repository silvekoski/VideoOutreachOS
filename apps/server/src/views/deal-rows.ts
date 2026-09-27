import { t } from '@mergero/shared'
import type { DealRowDto, DealStatus } from '@mergero/shared'
import type { Db } from '../db/index.ts'
import type { DealRow, TaskRow } from '../db/rows.ts'
import { listAnalysts } from '../domain/analysts.ts'
import { dealInterest, figures, newestBrief } from '../domain/brief-data.ts'
import { listDeals } from '../domain/deals.ts'
import { reachedStage } from '../domain/stages.ts'
import { listTimelines } from '../domain/timelines.ts'
import { listOpenTasks } from '../domain/tasks.ts'
import { normalizeWebsite } from '../jobs/scrape.ts'
import { failedJobs } from '../queue/index.ts'
import { countsAsFailure, dealDone, meetingUpcoming, pendingVersion } from './inbox.ts'
import { actualSlideTimes, latestSession, sessionSummary } from './sessions.ts'
import { dealFileUrl } from './urls.ts'

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

function video(db: Db, deal: DealRow): DealRowDto['video'] {
  const rendered = listTimelines(db, deal.id).filter((row) => row.renderStatus === 'rendered')
  const row = rendered.find((item) => item.version === deal.publishedVersion) ?? rendered.at(-1)
  if (!row) return null
  const durationS = actualSlideTimes(row.timeline).reduce((end, slide) => Math.max(end, slide.endS), 0)
  return { posterUrl: dealFileUrl(deal.id, `poster.v${row.version}.jpg`), durationS }
}

function logoUrl(deal: DealRow): string | null {
  const home = deal.scrape?.homeUrl ?? (deal.snapshot.website ? normalizeWebsite(deal.snapshot.website) : null)
  return home ? `https://icons.duckduckgo.com/ip3/${new URL(home).hostname}.ico` : null
}

function lastActivity(db: Db, deal: DealRow): DealRowDto['lastActivity'] {
  const session = latestSession(db, deal.id)
  return session ? { text: sessionSummary(session), at: session.startedAt } : null
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
    logoUrl: logoUrl(deal),
    country: deal.country,
    analystId: deal.analystId,
    analystName: analysts.get(deal.analystId) ?? `Analyst ${deal.analystId}`,
    status: deal.status,
    reached: reachedStage(deal),
    ownerName: deal.snapshot.ownerName,
    ownerRole: deal.snapshot.ownerRole,
    language: deal.language,
    staffCount: deal.snapshot.staffCount,
    revenue: figures(deal).revenue,
    askInForm: deal.financials?.source === 'ask_in_form',
    buyers:
      deal.mgx === null
        ? null
        : deal.mgx.buyers
            .filter((buyer) => !deal.removedBuyers.includes(buyer.id))
            .map(({ id, name, focus, logoUrl }) => ({ id, name, focus, logoUrl })),
    interest: dealInterest(db, deal),
    watchS: deal.analytics?.totalWatchS ?? 0,
    stopSlide: deal.analytics?.stopSlide ?? null,
    completed: deal.analytics?.completed ?? false,
    video: video(db, deal),
    lastActivity: lastActivity(db, deal),
    nextAction: nextAction(db, deal, failed.has(deal.id), tasks.get(deal.id), now),
    updatedAt: deal.updatedAt,
  }))
}
