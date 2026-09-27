import type { BookBody, BookConflictDetail, SlotDto } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import type { AnalystRow } from '../db/rows.ts'
import { requireAnalyst } from '../domain/analysts.ts'
import { MEETING_MS, meetingKeepUntil, requireDeal, updateDeal } from '../domain/deals.ts'
import { DomainError } from '../domain/errors.ts'
import { closeOpenTasks, moveStage } from '../domain/stages.ts'
import { log } from '../log.ts'
import { enqueue, jobKeys } from '../queue/index.ts'
import { localDate, shiftDays, weekday, zonedTime } from './zoned-time.ts'

const SLOT_MS = MEETING_MS
const SLOT_MINUTES = SLOT_MS / 60_000
const DAY_START_MINUTE = 9 * 60
const DAY_END_MINUTE = 16 * 60
const DAYS_AHEAD = 14
const SATURDAY = 6
const SUNDAY = 0

export function slotGrid(timeZone: string, now: Date): SlotDto[] {
  const today = localDate(now, timeZone)
  const slots: SlotDto[] = []
  for (let offset = 1; offset <= DAYS_AHEAD; offset += 1) {
    const day = shiftDays(today, offset)
    const dayOfWeek = weekday(day)
    if (dayOfWeek === SATURDAY || dayOfWeek === SUNDAY) continue
    for (let minute = DAY_START_MINUTE; minute + SLOT_MINUTES <= DAY_END_MINUTE; minute += SLOT_MINUTES) {
      const start = zonedTime(day, minute, timeZone)
      slots.push({ start: nowIso(start), end: nowIso(new Date(start.getTime() + SLOT_MS)) })
    }
  }
  return slots
}

export function freeSlots(db: Db, analyst: AnalystRow, now: Date): SlotDto[] {
  const booked = sql<{ meeting_at: string }>(db, 'SELECT meeting_at FROM deals WHERE analyst_id = ? AND meeting_at IS NOT NULL')
    .all(analyst.id)
    .map((row) => Date.parse(row.meeting_at))
  return slotGrid(analyst.timeZone, now).filter((slot) => {
    const start = Date.parse(slot.start)
    return !booked.some((meeting) => start < meeting + SLOT_MS && meeting < start + SLOT_MS)
  })
}

export function dealSlots(db: Db, dealId: number, now: Date = new Date()): SlotDto[] {
  const deal = requireDeal(db, dealId)
  return deal.meetingAt === null ? freeSlots(db, requireAnalyst(db, deal.analystId), now) : []
}

export function bookMeeting(db: Db, dealId: number, body: BookBody, now: Date = new Date()): string {
  const meetingAt = transaction(db, () => {
    const deal = requireDeal(db, dealId)
    if (deal.meetingAt !== null) {
      const detail: BookConflictDetail = { meetingAt: deal.meetingAt }
      throw new DomainError(409, 'A meeting is already booked', detail)
    }
    const requested = Date.parse(body.start)
    const slot = freeSlots(db, requireAnalyst(db, deal.analystId), now).find((item) => Date.parse(item.start) === requested)
    if (!slot) throw new DomainError(409, 'This time is not free')
    const keepUntil = meetingKeepUntil(slot.start)
    updateDeal(
      db,
      dealId,
      {
        meetingAt: slot.start,
        meetingEmail: body.email,
        bookedAt: nowIso(now),
        expiresAt: deal.expiresAt !== null && deal.expiresAt < keepUntil ? keepUntil : undefined,
      },
      now,
    )
    const { event } = moveStage(db, dealId, 'meeting_booked', { data: { meetingAt: slot.start }, now })
    if (!event) throw new Error(`The meeting_booked event of deal ${dealId} was not stored`)
    if (deal.status === 'lost') {
      const stage = 'meeting_booked'
      enqueue(db, 'pipedrive-write', jobKeys.pipedriveWrite(dealId, 'stage', stage), { dealId, op: 'stage', stage }, { now })
    }
    closeOpenTasks(db, dealId, now)
    enqueue(db, 'write-brief', jobKeys.brief(dealId, event.id), { dealId, lastEventId: event.id }, { now })
    return slot.start
  })
  log.info('meeting booked', { dealId, meetingAt })
  return meetingAt
}
