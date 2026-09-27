import type { Db } from '../db/index.ts'
import { getAnalyst } from '../domain/analysts.ts'
import { lastOwnerEventId, newestBrief } from '../domain/brief-data.ts'
import { isExpired, listDeals } from '../domain/deals.ts'
import { listSessions } from '../domain/events.ts'
import { purgeExpired } from '../domain/retention.ts'
import { createTask, nextSecondChannel } from '../domain/tasks.ts'
import { log } from '../log.ts'
import { enqueue, errorText, jobKeys } from '../queue/index.ts'
import type { JobContext, JobHandler } from './types.ts'

const HOUR_MS = 3_600_000
const TASK_AFTER_MS = 48 * HOUR_MS
const BRIEF_WINDOW_MS = 3 * HOUR_MS
const VIDEO_FIELD_BATCH = 50

function before(iso: string | null, limit: number): boolean {
  return iso !== null && Date.parse(iso) <= limit
}

function callTasks(db: Db, now: Date): number {
  const cutoff = now.getTime() - TASK_AFTER_MS
  let created = 0
  for (const deal of listDeals(db, { status: 'link_sent' })) {
    if (isExpired(deal, now) || deal.firstOpenAt !== null || !before(deal.publishedAt, cutoff)) continue
    if (createTask(db, deal.id, 'call', null, now)) created++
  }
  return created
}

function secondChannelTasks(db: Db, now: Date): number {
  const cutoff = now.getTime() - TASK_AFTER_MS
  let created = 0
  for (const deal of listDeals(db, { status: 'opened' })) {
    if (isExpired(deal, now) || deal.meetingAt !== null || !before(deal.firstOpenAt, cutoff)) continue
    const preferred = getAnalyst(db, deal.analystId)?.defaultSecondChannel ?? 'linkedin'
    const channel = nextSecondChannel(preferred, listSessions(db, deal.id)[0]?.channel ?? null)
    if (createTask(db, deal.id, 'second_channel', channel, now)) created++
  }
  return created
}

async function videoFields(ctx: JobContext, hour: string, now: Date): Promise<number> {
  const deals = (await ctx.providers.pipedrive.listOpenDeals()).filter((deal) => !deal.videoUrl)
  for (let start = 0; start < deals.length; start += VIDEO_FIELD_BATCH) {
    const dealIds = deals.slice(start, start + VIDEO_FIELD_BATCH).map((deal) => deal.id)
    const key = jobKeys.pipedriveWrite(null, 'video_field', `${hour}-${start / VIDEO_FIELD_BATCH}`)
    enqueue(ctx.db, 'pipedrive-write', key, { op: 'video_field', dealIds }, { now })
  }
  return deals.length
}

function meetingBriefs(db: Db, now: Date): number {
  const from = now.getTime()
  let queued = 0
  for (const deal of listDeals(db, { status: 'meeting_booked' })) {
    const meetingAt = deal.meetingAt === null ? Number.NaN : Date.parse(deal.meetingAt)
    if (isExpired(deal, now) || !(meetingAt > from && meetingAt <= from + BRIEF_WINDOW_MS)) continue
    const lastEventId = lastOwnerEventId(db, deal.id)
    const covered = newestBrief(db, deal.id)?.lastEventId ?? 0
    if (lastEventId === null || lastEventId <= covered) continue
    if (enqueue(db, 'write-brief', jobKeys.brief(deal.id, lastEventId), { dealId: deal.id, lastEventId }, { now })) queued++
  }
  return queued
}

export const sweepHandler: JobHandler<'sweep'> = {
  async run(job, ctx) {
    const now = ctx.now()
    const counts: Record<string, number> = {}
    const failures: string[] = []
    const step = async (name: string, check: () => number | Promise<number>) => {
      try {
        counts[name] = await check()
      } catch (error) {
        failures.push(`${name}: ${errorText(error)}`)
        log.error('sweep step failed', { step: name, error })
      }
    }
    await step('expired', async () => (await purgeExpired(ctx.db, now)).length)
    await step('callTasks', () => callTasks(ctx.db, now))
    await step('secondChannelTasks', () => secondChannelTasks(ctx.db, now))
    await step('videoFields', () => videoFields(ctx, job.payload.hour, now))
    await step('meetingBriefs', () => meetingBriefs(ctx.db, now))
    log.info('sweep done', { hour: job.payload.hour, ...counts })
    if (failures.length > 0) throw new Error(`Sweep steps failed: ${failures.join('; ')}`)
  },
}
