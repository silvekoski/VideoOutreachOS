import { countryTimeZone, pipedriveAmountText, pipedriveValuationText, t } from '@mergero/shared'
import type { Channel, SlideAnalytics } from '@mergero/shared'
import type { BriefRow, DealRow, TaskRow } from '../db/rows.ts'
import { getAnalyst } from '../domain/analysts.ts'
import { newestBrief } from '../domain/brief-data.ts'
import { getDeal, updateDeal } from '../domain/deals.ts'
import { reachedStage, stageRank } from '../domain/stages.ts'
import { getTask, setTaskActivityId } from '../domain/tasks.ts'
import { env } from '../env.ts'
import { log } from '../log.ts'
import { ProviderError } from '../providers/errors.ts'
import { errorText } from '../queue/index.ts'
import type { PipedriveWritePayload } from '../queue/index.ts'
import { localDate, localDateTime } from '../views/dates.ts'
import type { JobContext, JobHandler } from './types.ts'

type DealPayload = Exclude<PipedriveWritePayload, { op: 'video_field' }>

const CHANNEL_NAMES = t('en').channels

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
}

function dealPageUrl(dealId: number): string {
  return `${env.adminBaseUrl}/deals/${dealId}`
}

function watchPerSlideText(perSlide: readonly SlideAnalytics[]): string | null {
  if (perSlide.length === 0) return null
  return perSlide
    .toSorted((a, b) => a.slide - b.slide)
    .map((item) => `${item.slide}: ${Math.round(item.watchS)} s`)
    .join(', ')
}

function ownerLabel(deal: DealRow): string {
  const { ownerName, company } = deal.snapshot
  return ownerName ? `${ownerName}, ${company}` : company
}

function activityText(deal: DealRow, task: TaskRow): { subject: string; note: string } {
  const page = `<a href="${escapeHtml(dealPageUrl(deal.id))}">${escapeHtml(dealPageUrl(deal.id))}</a>`
  if (task.type === 'call') {
    return {
      subject: `Call ${ownerLabel(deal)}`,
      note: `<p>The owner has not opened the video link in 48 hours.</p><p>Deal page: ${page}</p>`,
    }
  }
  const channel: Channel = task.channel ?? 'email'
  const link = `${env.publicBaseUrl}/v/${deal.linkCode}?c=${channel}`
  return {
    subject: `Send the video link on ${CHANNEL_NAMES[channel]}: ${ownerLabel(deal)}`,
    note: [
      `<p>The owner opened the video but has not booked a meeting in 48 hours. Send the link on ${escapeHtml(CHANNEL_NAMES[channel])}.</p>`,
      `<p>Link: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
      `<p>Deal page: ${page}</p>`,
    ].join(''),
  }
}

function noteHtml(deal: DealRow, brief: BriefRow): string {
  const s = t(brief.language)
  const { meetingAt, timeZone } = brief.brief.header
  const url = dealPageUrl(deal.id)
  return [
    `<p><b>${escapeHtml(s.brief.title)}</b></p>`,
    `<p>${escapeHtml(s.brief.fields.meetingAt)}: ${escapeHtml(localDateTime(meetingAt, timeZone))}<br>`,
    `${escapeHtml(s.brief.fields.interest)}: ${escapeHtml(s.interest[brief.brief.header.interest])}</p>`,
    `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
  ].join('')
}

function skip(payload: PipedriveWritePayload, reason: string): void {
  log.info('pipedrive write skipped', { ...payload, reason })
}

async function writeDealOp(ctx: JobContext, payload: DealPayload): Promise<void> {
  const { pipedrive } = ctx.providers
  const deal = getDeal(ctx.db, payload.dealId)
  if (!deal) return skip(payload, 'the deal is not in the tool')
  switch (payload.op) {
    case 'stage': {
      const reached = reachedStage(deal)
      if (stageRank(payload.stage) < stageRank(reached)) return skip(payload, `the deal is already ${reached}`)
      return pipedrive.moveStage(deal.id, payload.stage)
    }
    case 'fields':
      if (!deal.form) return skip(payload, 'the deal has no form answers')
      return pipedrive.setDealFields(deal.id, {
        revenueRange: pipedriveAmountText(deal.form.revenue),
        profitRange: pipedriveAmountText(deal.form.profit),
        staffRange: deal.form.staff,
        valuationRange: pipedriveValuationText(deal.valuation),
      })
    case 'analytics': {
      if (!deal.analytics) return skip(payload, 'the deal has no analytics')
      const { channel } = deal.analytics
      return pipedrive.setDealFields(deal.id, {
        watchTimeS: Math.round(deal.analytics.totalWatchS),
        stopSlide: deal.analytics.stopSlide,
        replayCount: deal.analytics.replays,
        watchPerSlide: watchPerSlideText(deal.analytics.perSlide),
        linkChannel: channel ? CHANNEL_NAMES[channel] : undefined,
      })
    }
    case 'lost':
      return pipedrive.setLost(deal.id, payload.reason)
    case 'activity': {
      const task = getTask(ctx.db, payload.taskId)
      if (!task) return skip(payload, 'the task does not exist')
      if (task.pipedriveActivityId !== null) return skip(payload, 'the activity exists')
      if (task.status === 'done') return skip(payload, 'the task is done')
      const timeZone = getAnalyst(ctx.db, deal.analystId)?.timeZone ?? countryTimeZone(deal.country)
      const activityId = await pipedrive.addActivity({
        dealId: deal.id,
        ownerId: deal.analystId,
        type: task.type === 'call' ? 'call' : 'task',
        ...activityText(deal, task),
        dueDate: localDate(ctx.now(), timeZone),
      })
      setTaskActivityId(ctx.db, task.id, activityId)
      return
    }
    case 'activity_done': {
      const activityId = getTask(ctx.db, payload.taskId)?.pipedriveActivityId ?? null
      if (activityId === null) return skip(payload, 'the task has no activity')
      return pipedrive.markActivityDone(activityId)
    }
    case 'note': {
      const brief = newestBrief(ctx.db, deal.id)
      if (!brief) return skip(payload, 'the deal has no meeting brief')
      const noteId = await pipedrive.upsertNote(deal.id, deal.pipedriveNoteId, noteHtml(deal, brief))
      if (noteId !== deal.pipedriveNoteId) updateDeal(ctx.db, deal.id, { pipedriveNoteId: noteId }, ctx.now())
      return
    }
  }
}

async function writeVideoFields(ctx: JobContext, dealIds: readonly number[]): Promise<void> {
  const failures: string[] = []
  for (const dealId of dealIds) {
    try {
      await ctx.providers.pipedrive.setVideoField(dealId, dealPageUrl(dealId))
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) {
        log.warn('video field skipped', { dealId, error: errorText(error) })
        continue
      }
      failures.push(`deal ${dealId}: ${errorText(error)}`)
    }
  }
  if (failures.length > 0) throw new Error(`The Video field could not be written for ${failures.join('; ')}`)
  log.info('video fields written', { deals: dealIds.length })
}

export const pipedriveWriteHandler: JobHandler<'pipedrive-write'> = {
  async run(job, ctx) {
    const { payload } = job
    if (payload.op === 'video_field') return writeVideoFields(ctx, payload.dealIds)
    await writeDealOp(ctx, payload)
  },
}
