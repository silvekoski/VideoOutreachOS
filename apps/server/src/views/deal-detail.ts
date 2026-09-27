import { CHANNELS, SLIDE_NAMES_EN, countryTimeZone } from '@mergero/shared'
import type { Channel, DealDetailDto, DealTaskDto, StoredEvent } from '@mergero/shared'
import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { toStoredEvent } from '../db/rows.ts'
import type { DealRow, EventColumns, TaskRow } from '../db/rows.ts'
import { getAnalyst } from '../domain/analysts.ts'
import { newestBrief } from '../domain/brief-data.ts'
import { isExpired } from '../domain/deals.ts'
import { listSessions } from '../domain/events.ts'
import { dealPipelineState } from '../domain/pipeline.ts'
import { listOpenTasks } from '../domain/tasks.ts'
import { paths } from '../paths.ts'
import { failedJobs } from '../queue/index.ts'
import { pendingVersion } from './inbox.ts'
import { failedJobDto } from './jobs.ts'
import { sessionRowDto } from './sessions.ts'
import { dealFileUrl, isFile, videoLink } from './urls.ts'

function timelineEvents(db: Db, dealId: number): StoredEvent[] {
  return sql<EventColumns>(
    db,
    `SELECT * FROM events WHERE deal_id = ?
       AND (session_id IS NULL OR type IN ('open', 'buyer_link_tap', 'forward', 'calculator_result'))
     ORDER BY id`,
  )
    .all(dealId)
    .map(toStoredEvent)
}

function taskDto(task: TaskRow, deal: DealRow): DealTaskDto {
  return {
    id: task.id,
    type: task.type,
    channel: task.channel,
    status: task.status,
    createdAt: task.createdAt,
    ownerPhone: deal.snapshot.ownerPhone,
    ownerEmail: deal.snapshot.ownerEmail,
  }
}

async function download720(deal: DealRow): Promise<string | null> {
  const version = deal.publishedVersion
  if (version === null || !(await isFile(paths.video720(deal.id, version)))) return null
  return dealFileUrl(deal.id, `video-720.v${version}.mp4`, { download: '1' })
}

export interface DealDetailContext {
  now: Date
  pipedriveUrl: (dealId: number) => string
}

export async function dealDetailDto(db: Db, deal: DealRow, context: DealDetailContext): Promise<DealDetailDto> {
  const published = deal.publishedVersion !== null
  const analyst = getAnalyst(db, deal.analystId)
  return {
    id: deal.id,
    status: deal.status,
    reviewReasons: deal.reviewReasons,
    company: deal.snapshot.company,
    website: deal.snapshot.website,
    ownerName: deal.snapshot.ownerName,
    ownerRole: deal.snapshot.ownerRole,
    language: deal.language,
    pageLanguage: deal.pageLanguage,
    country: deal.country,
    analyst: {
      id: deal.analystId,
      name: analyst?.name ?? `Analyst ${deal.analystId}`,
      timeZone: analyst?.timeZone ?? countryTimeZone(deal.country),
    },
    pipedriveUrl: context.pipedriveUrl(deal.id),
    link: published ? videoLink(deal.linkCode) : null,
    links: published
      ? (Object.fromEntries(CHANNELS.map((channel) => [channel, videoLink(deal.linkCode, channel)])) as Record<Channel, string>)
      : null,
    expiresAt: deal.expiresAt,
    expiryDays: deal.expiryDays,
    expired: isExpired(deal, context.now),
    publishedVersion: deal.publishedVersion,
    pendingVersion: pendingVersion(db, deal, context.now),
    download720: await download720(deal),
    previewUrl: published ? `${videoLink(deal.linkCode)}?preview=1` : null,
    meetingAt: deal.meetingAt,
    meetingEmail: deal.meetingEmail,
    events: timelineEvents(db, deal.id),
    analytics: deal.analytics,
    slideNames: SLIDE_NAMES_EN,
    sessions: listSessions(db, deal.id).reverse().map(sessionRowDto),
    form: deal.form,
    valuation: deal.valuation,
    openTasks: listOpenTasks(db, { dealId: deal.id }).map((task) => taskDto(task, deal)),
    brief: newestBrief(db, deal.id)?.brief ?? null,
    failedJobs: failedJobs(db, { dealId: deal.id }).map(failedJobDto),
    pipeline: dealPipelineState(db, deal.id),
  }
}
