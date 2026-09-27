import type { AlertDto, DealEventType, SessionChannel, SessionInfo, StoredEvent } from '@mergero/shared'
import { nowIso, sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { toSessionRow, toStoredEvent } from '../db/rows.ts'
import type { EventColumns, SessionColumns, SessionRow } from '../db/rows.ts'
import { localDateTime } from '../views/dates.ts'
import { getAnalyst } from './analysts.ts'

const BRIEF_READ_WINDOW_MS = 10 * 60_000
const DEFAULT_ALERT_LIMIT = 50

const CHANNEL_NAMES: Record<SessionChannel, string> = {
  email: 'email',
  linkedin: 'LinkedIn',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  direct: 'direct',
}

const DEVICE_NAMES: Record<SessionInfo['device'], string> = {
  mobile: 'a phone',
  tablet: 'a tablet',
  desktop: 'a computer',
}

export function addDealEvent(
  db: Db,
  dealId: number,
  type: DealEventType,
  data: Record<string, unknown> = {},
  now: Date = new Date(),
): StoredEvent {
  const row = sql<EventColumns>(db, 'INSERT INTO events (deal_id, type, at, data) VALUES (?, ?, ?, ?) RETURNING *').get(
    dealId,
    type,
    nowIso(now),
    JSON.stringify(data),
  )
  if (!row) throw new Error(`The ${type} event of deal ${dealId} was not stored`)
  return toStoredEvent(row)
}

export function listEvents(
  db: Db,
  dealId: number,
  options: { afterId?: number; types?: readonly StoredEvent['type'][] } = {},
): StoredEvent[] {
  const events = sql<EventColumns>(db, 'SELECT * FROM events WHERE deal_id = ? AND id > ? ORDER BY id')
    .all(dealId, options.afterId ?? 0)
    .map(toStoredEvent)
  return options.types ? events.filter((event) => options.types?.includes(event.type)) : events
}

export function listSessions(db: Db, dealId: number): SessionRow[] {
  return sql<SessionColumns>(db, 'SELECT * FROM sessions WHERE deal_id = ? ORDER BY started_at, id')
    .all(dealId)
    .map(toSessionRow)
}

export function recordBriefRead(db: Db, dealId: number, briefVersion: number, now: Date = new Date()): StoredEvent | null {
  const since = nowIso(new Date(now.getTime() - BRIEF_READ_WINDOW_MS))
  const recent = sql<{ id: number }>(
    db,
    `SELECT id FROM events WHERE deal_id = ? AND type = 'brief_read' AND at > ? AND json_extract(data, '$.version') = ? LIMIT 1`,
  ).get(dealId, since, briefVersion)
  return recent ? null : addDealEvent(db, dealId, 'brief_read', { version: briefVersion }, now)
}

interface AlertColumns extends EventColumns {
  company: string | null
  session_channel: string | null
  session_device: string | null
  deal_meeting_at: string | null
  deal_meeting_email: string | null
}

function alertText(row: AlertColumns, data: Record<string, unknown>, timeZone: string): string {
  switch (row.type) {
    case 'open': {
      const channel = (row.session_channel ?? 'direct') as SessionChannel
      const from = channel === 'direct' ? '' : ` from the ${CHANNEL_NAMES[channel] ?? channel} link`
      const device = row.session_device ? DEVICE_NAMES[row.session_device as SessionInfo['device']] : undefined
      return `Opened the video${from}${device ? ` on ${device}` : ''}`
    }
    case 'form_sent':
      return 'Sent the form'
    case 'meeting_booked': {
      const meetingAt = typeof data.meetingAt === 'string' ? data.meetingAt : row.deal_meeting_at
      const booked = meetingAt ? `Booked a meeting for ${localDateTime(meetingAt, timeZone)}` : 'Booked a meeting'
      return row.deal_meeting_email ? `${booked}. Send the invitation to ${row.deal_meeting_email}` : booked
    }
    case 'brief_written':
      return 'The meeting brief is ready'
    case 'lost':
      return typeof data.reason === 'string' && data.reason.trim() !== '' ? `Marked as lost: ${data.reason.trim()}` : 'Marked as lost'
    case 'won':
      return 'Marked as won in Pipedrive'
    case 'reopened':
      return 'Opened again in Pipedrive'
    default:
      return row.type
  }
}

export function alertsFor(db: Db, analystId: number, since: Date, limit: number = DEFAULT_ALERT_LIMIT): AlertDto[] {
  const analyst = getAnalyst(db, analystId)
  if (!analyst) return []
  const rows = sql<AlertColumns>(
    db,
    `SELECT e.*, json_extract(d.snapshot, '$.company') AS company, s.channel AS session_channel,
       s.device AS session_device, d.meeting_at AS deal_meeting_at, d.meeting_email AS deal_meeting_email
     FROM events e
     JOIN deals d ON d.id = e.deal_id
     LEFT JOIN sessions s ON s.id = e.session_id
     WHERE d.analyst_id = ? AND e.at >= ?
       AND (
         (e.session_id IS NULL AND e.type IN ('form_sent', 'meeting_booked', 'brief_written', 'lost', 'won', 'reopened'))
         OR (e.type = 'open' AND e.session_id IS NOT NULL
           AND e.id = (SELECT MIN(o.id) FROM events o WHERE o.session_id = e.session_id AND o.type = 'open'))
       )
     ORDER BY e.at DESC, e.id DESC
     LIMIT ?`,
  ).all(analystId, nowIso(since), limit)
  return rows.map((row) => ({
    id: row.id,
    dealId: row.deal_id,
    company: row.company ?? '',
    type: row.type,
    text: alertText(row, JSON.parse(row.data) as Record<string, unknown>, analyst.timeZone),
    at: row.at,
    unread: analyst.alertsSeenAt === null || row.at > analyst.alertsSeenAt,
  }))
}
