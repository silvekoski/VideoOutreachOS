import { isClosedStatus, t } from '@mergero/shared'
import type { InboxDto, InboxGroupKey, InboxRow } from '@mergero/shared'
import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import type { AnalystRow, DealRow, TaskRow } from '../db/rows.ts'
import { introUpload } from '../domain/analysts.ts'
import { newestBrief } from '../domain/brief-data.ts'
import { isExpired, listDeals } from '../domain/deals.ts'
import { listOpenTasks } from '../domain/tasks.ts'
import { newestTimeline } from '../domain/timelines.ts'
import { failedJobs } from '../queue/index.ts'
import type { AnyJob } from '../queue/index.ts'
import { localDate } from './dates.ts'
import { errorLine, jobName } from './jobs.ts'
import { latestSession, sessionSummary } from './sessions.ts'

export const MEETING_GRACE_MS = 30 * 60_000
const MEETING_WINDOW_MS = 24 * 3_600_000
const CHANNEL_NAMES = t('en').channels

export function meetingUpcoming(deal: DealRow, now: Date): boolean {
  return deal.meetingAt !== null && Date.parse(deal.meetingAt) + MEETING_GRACE_MS > now.getTime()
}

export function dealDone(deal: DealRow, now: Date): boolean {
  return isClosedStatus(deal.status) || isExpired(deal, now) || (deal.meetingAt !== null && !meetingUpcoming(deal, now))
}

export function countsAsFailure(job: AnyJob, deal: DealRow, now: Date): boolean {
  return job.type === 'pipedrive-write' || !dealDone(deal, now)
}

export function pendingVersion(db: Db, deal: DealRow, now: Date): number | null {
  if (deal.publishedVersion === null || dealDone(deal, now)) return null
  const row = newestTimeline(db, deal.id)
  if (!row || row.version <= deal.publishedVersion) return null
  return deal.reviewReasons.length > 0 || (row.renderStatus === 'rendered' && row.approvedAt === null) ? row.version : null
}

interface Entry {
  sortKey: string
  row: InboxRow
}

function owner(deal: DealRow): string {
  const { ownerName, ownerRole } = deal.snapshot
  const name = ownerName || 'the owner'
  return ownerRole ? `${name}, ${ownerRole}` : name
}

function reviewContext(deal: DealRow, pending: number | null): string {
  if (deal.status === 'failed') return 'The video could not be made'
  const [first, ...more] = deal.reviewReasons
  const reason = first ? (more.length > 0 ? `${first.detail} (${more.length} more)` : first.detail) : null
  if (pending === null) return reason ?? 'The video is ready for review'
  return reason
    ? `Version ${pending}: ${reason}`
    : `Version ${pending} is ready for review. The link still shows version ${deal.publishedVersion}`
}

function lastDoneSystemJobs(db: Db): Map<string, number> {
  const rows = sql<{ type: string; id: number }>(
    db,
    `SELECT type, MAX(id) AS id FROM jobs WHERE deal_id IS NULL AND analyst_id IS NULL AND status = 'done' GROUP BY type`,
  ).all()
  return new Map(rows.map((row) => [row.type, row.id]))
}

function resolvedWithoutDeal(job: AnyJob, analyst: AnalystRow, lastDone: ReadonlyMap<string, number>): boolean {
  if (job.type === 'audio' && job.payload.kind === 'intro') {
    const intro = introUpload(analyst.intros[job.payload.lang])
    return intro?.recordedAt !== job.payload.recordedAt || intro.status === 'ready'
  }
  if (job.type === 'audio' && job.payload.kind === 'clone') return analyst.cloneStatus === 'ready'
  return job.id < (lastDone.get(job.type) ?? 0)
}

function jobRow(job: AnyJob, deal: DealRow | null, lastSession: string | null): InboxRow {
  return {
    key: `job:${job.id}`,
    dealId: deal?.id ?? null,
    company: deal?.snapshot.company ?? (job.analystId !== null ? 'Your profile' : 'System'),
    context: `${jobName(job)} failed: ${errorLine(job.error)}`,
    action: { kind: 'retry', label: 'Retry', jobId: job.id },
    lastSession,
  }
}

function taskRow(task: TaskRow, deal: DealRow, timeZone: string, lastSession: string | null): InboxRow {
  const base = { key: `task:${task.id}`, dealId: deal.id, company: deal.snapshot.company, lastSession }
  const opened = deal.firstOpenAt ? `Opened on ${localDate(deal.firstOpenAt, timeZone)}` : null
  if (task.type === 'second_channel' && task.channel !== null) {
    return {
      ...base,
      context: `${opened ?? 'Opened'}, no meeting booked`,
      action: { kind: 'second_channel', label: `Send on ${CHANNEL_NAMES[task.channel]}`, taskId: task.id, channel: task.channel },
    }
  }
  const sent = deal.publishedAt ? `Link sent on ${localDate(deal.publishedAt, timeZone)}` : 'Link sent'
  return {
    ...base,
    context: opened ? `${sent}. ${opened}, no meeting booked` : `${sent}, not opened`,
    action: { kind: 'call', label: deal.snapshot.ownerFirstName ? `Call ${deal.snapshot.ownerFirstName}` : 'Call', taskId: task.id },
  }
}

export function inboxDto(db: Db, analyst: AnalystRow, now: Date): InboxDto {
  const deals = listDeals(db, { analystId: analyst.id })
  const byId = new Map(deals.map((deal) => [deal.id, deal]))
  const sessions = new Map<number, string | null>()
  const lastSession = (deal: DealRow): string | null => {
    if (!sessions.has(deal.id)) {
      const session = latestSession(db, deal.id)
      sessions.set(deal.id, session ? sessionSummary(session) : null)
    }
    return sessions.get(deal.id) ?? null
  }

  const review: Entry[] = []
  const failedDeals = new Set<number>()
  const lastDone = lastDoneSystemJobs(db)
  const shownWithoutDeal = new Set<string>()
  for (const job of failedJobs(db, { analystId: analyst.id, includeGlobal: true })) {
    const deal = job.dealId === null ? null : byId.get(job.dealId)
    if (deal === undefined || (deal && !countsAsFailure(job, deal, now))) continue
    if (deal === null) {
      const subject = jobName(job)
      if (shownWithoutDeal.has(subject) || resolvedWithoutDeal(job, analyst, lastDone)) continue
      shownWithoutDeal.add(subject)
    }
    if (deal) failedDeals.add(deal.id)
    review.push({ sortKey: job.updatedAt, row: jobRow(job, deal, deal ? lastSession(deal) : null) })
  }
  for (const deal of deals) {
    if (dealDone(deal, now)) continue
    const pending = pendingVersion(db, deal, now)
    if (deal.status !== 'review' && !(deal.status === 'failed' && !failedDeals.has(deal.id)) && pending === null) continue
    review.push({
      sortKey: deal.updatedAt,
      row: {
        key: `deal:${deal.id}`,
        dealId: deal.id,
        company: deal.snapshot.company,
        context: reviewContext(deal, pending),
        action: { kind: 'review', label: deal.status === 'failed' ? 'Open review' : 'Review video' },
        lastSession: lastSession(deal),
      },
    })
  }
  review.sort((a, b) => b.sortKey.localeCompare(a.sortKey))

  const meetings: Entry[] = deals
    .filter(
      (deal) =>
        !isExpired(deal, now) &&
        meetingUpcoming(deal, now) &&
        Date.parse(deal.meetingAt ?? '') <= now.getTime() + MEETING_WINDOW_MS,
    )
    .map((deal) => {
      const brief = newestBrief(db, deal.id)
      const meetingAt = deal.meetingAt ?? ''
      return {
        sortKey: meetingAt,
        row: {
          key: `meeting:${deal.id}`,
          dealId: deal.id,
          company: deal.snapshot.company,
          context: brief ? `Meeting with ${owner(deal)}` : `Meeting with ${owner(deal)}. The meeting brief is not written yet`,
          action: { kind: 'brief', label: 'Read meeting brief' },
          meetingAt,
          meetingEmail: deal.meetingEmail,
          interest: brief?.brief.header.interest ?? null,
          lastSession: lastSession(deal),
        },
      }
    })
  meetings.sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  const tasks: Record<'call' | 'second_channel', Entry[]> = { call: [], second_channel: [] }
  for (const task of listOpenTasks(db, { analystId: analyst.id })) {
    const deal = byId.get(task.dealId)
    if (!deal || dealDone(deal, now)) continue
    tasks[task.type].push({ sortKey: task.createdAt, row: taskRow(task, deal, analyst.timeZone, lastSession(deal)) })
  }

  const groups: [InboxGroupKey, Entry[]][] = [
    ['review', review],
    ['meeting_today', meetings],
    ['call', tasks.call],
    ['second_channel', tasks.second_channel],
  ]
  return { groups: groups.map(([key, entries]) => ({ key, rows: entries.map((entry) => entry.row) })) }
}
