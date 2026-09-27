import { slideTimes, t } from '@mergero/shared'
import type { SessionEventsDto, SessionRowDto, SlideTime, Timeline } from '@mergero/shared'
import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { toSessionRow, toStoredEvent } from '../db/rows.ts'
import type { EventColumns, SessionColumns, SessionRow } from '../db/rows.ts'
import { requireDeal } from '../domain/deals.ts'
import { DomainError } from '../domain/errors.ts'
import { getTimeline } from '../domain/timelines.ts'

const CHANNEL_NAMES = t('en').channels

export function sessionRowDto(session: SessionRow): SessionRowDto {
  return {
    id: session.id,
    startedAt: session.startedAt,
    channel: session.channel,
    device: session.device,
    browser: session.browser,
    os: session.os,
    screen: session.screen,
    analytics: session.analytics,
  }
}

export function latestSession(db: Db, dealId: number): SessionRow | null {
  const row = sql<SessionColumns>(
    db,
    'SELECT * FROM sessions WHERE deal_id = ? ORDER BY started_at DESC, id DESC LIMIT 1',
  ).get(dealId)
  return row ? toSessionRow(row) : null
}

export function sessionSummary(session: SessionRow): string {
  const opened =
    session.channel === 'direct' ? 'Opened from a direct link' : `Opened on ${CHANNEL_NAMES[session.channel]}`
  const analytics = session.analytics
  if (!analytics) return opened
  if (analytics.completed) return `${opened}, watched to the end`
  if (!analytics.played) return `${opened}, did not play the video`
  return analytics.stopSlide === null ? opened : `${opened}, stopped at slide ${analytics.stopSlide}`
}

export function actualSlideTimes(timeline: Timeline | null | undefined): SlideTime[] {
  if (!timeline) return []
  try {
    return slideTimes(timeline)
  } catch {
    return []
  }
}

export function sessionEventsDto(db: Db, sessionId: string): SessionEventsDto {
  const row = sql<SessionColumns>(db, 'SELECT * FROM sessions WHERE id = ?').get(sessionId)
  if (!row) throw new DomainError(404, 'The session does not exist')
  const session = toSessionRow(row)
  const deal = requireDeal(db, session.dealId)
  const slides = actualSlideTimes(getTimeline(db, deal.id, session.version)?.timeline)
  const events = sql<EventColumns>(db, 'SELECT * FROM events WHERE session_id = ? ORDER BY seq, id')
    .all(sessionId)
    .map(toStoredEvent)
  return {
    session: sessionRowDto(session),
    durationS: slides.reduce((end, slide) => Math.max(end, slide.endS), 0),
    slides,
    events,
  }
}
