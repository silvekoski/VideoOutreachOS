import { computeDealAnalytics, computeSessionAnalytics, countryTimeZone } from '@mergero/shared'
import type { EventBatch, StoredEvent } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { toStoredEvent } from '../db/rows.ts'
import type { DealRow, EventColumns } from '../db/rows.ts'
import { storedSessions } from '../domain/analytics.ts'
import { requireDeal, updateDeal } from '../domain/deals.ts'
import { DomainError } from '../domain/errors.ts'
import { enqueuePipedriveAnalytics, moveStage } from '../domain/stages.ts'
import { getTimeline } from '../domain/timelines.ts'
import { localDay } from './zoned-time.ts'

export interface IngestResult {
  stored: number
  firstOpen: boolean
}

function assertShownVersion(db: Db, deal: DealRow, version: number): void {
  const row = deal.publishedVersion !== null && version <= deal.publishedVersion ? getTimeline(db, deal.id, version) : null
  if (row?.renderStatus !== 'rendered') throw new DomainError(400, `Video version ${version} was never published`)
}

function upsertSession(db: Db, deal: DealRow, batch: EventBatch, now: Date): void {
  const at = nowIso(now)
  const { channel, device, browser, os, screen, version } = batch.session
  const owner = sql<{ deal_id: number; version: number }>(db, 'SELECT deal_id, version FROM sessions WHERE id = ?').get(
    batch.sessionId,
  )
  if (owner && owner.deal_id !== deal.id) throw new DomainError(400, 'The session belongs to another link')
  if (owner && owner.version !== version) throw new DomainError(400, 'The session belongs to another video version')
  if (owner) {
    sql(db, 'UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(at, batch.sessionId)
    return
  }
  assertShownVersion(db, deal, version)
  sql(
    db,
    `INSERT INTO sessions (id, deal_id, version, started_at, last_seen_at, local_day, channel, device, browser, os, screen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(batch.sessionId, deal.id, version, at, at, localDay(now, countryTimeZone(deal.country)), channel, device, browser, os, screen)
}

function recomputeAnalytics(db: Db, dealId: number, sessionId: string, publishedVersion: number, now: Date): void {
  const { sessions, slidesOf } = storedSessions(db, dealId)
  const current = sessions.find((item) => item.id === sessionId)
  if (current) {
    const analytics = computeSessionAnalytics(current.events, current.slides)
    sql(db, 'UPDATE sessions SET analytics = ? WHERE id = ?').run(JSON.stringify(analytics), sessionId)
  }
  updateDeal(db, dealId, { analytics: computeDealAnalytics(sessions, slidesOf(publishedVersion)) }, now)
}

export function ingestBatch(db: Db, dealId: number, batch: EventBatch, now: Date = new Date()): IngestResult {
  if (batch.events.length === 0) return { stored: 0, firstOpen: false }
  return transaction(db, () => {
    const deal = requireDeal(db, dealId)
    if (deal.publishedVersion === null) throw new DomainError(409, 'The video link is not published')
    upsertSession(db, deal, batch, now)
    const insert = sql<EventColumns>(
      db,
      `INSERT INTO events (deal_id, session_id, seq, type, slide, video_time, channel, client_at, at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (session_id, seq) DO NOTHING
       RETURNING *`,
    )
    const stored: StoredEvent[] = []
    for (const event of batch.events) {
      const row = insert.get(
        dealId,
        batch.sessionId,
        event.seq,
        event.type,
        event.slide,
        event.vt,
        batch.session.channel,
        event.at,
        nowIso(now),
        JSON.stringify(event.data ?? {}),
      )
      if (row) stored.push(toStoredEvent(row))
    }
    if (stored.length === 0) return { stored: 0, firstOpen: false }
    recomputeAnalytics(db, dealId, batch.sessionId, deal.publishedVersion, now)
    const firstOpen = deal.firstOpenAt === null && stored.some((event) => event.type === 'open')
    if (firstOpen) {
      updateDeal(db, dealId, { firstOpenAt: nowIso(now) }, now)
      moveStage(db, dealId, 'opened', { now })
    }
    enqueuePipedriveAnalytics(db, dealId, now)
    return { stored: stored.length, firstOpen }
  })
}
