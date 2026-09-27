import type { SlideTime, Timeline } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { toTimelineRow } from '../db/rows.ts'
import type { RenderStatus, TimelineColumns, TimelineRow } from '../db/rows.ts'
import { DomainError } from './errors.ts'

export function getTimeline(db: Db, dealId: number, version?: number | null): TimelineRow | null {
  if (version === undefined) return newestTimeline(db, dealId)
  if (version === null) return null
  const row = sql<TimelineColumns>(db, 'SELECT * FROM timelines WHERE deal_id = ? AND version = ?').get(dealId, version)
  return row ? toTimelineRow(row) : null
}

export function newestTimeline(db: Db, dealId: number): TimelineRow | null {
  const row = sql<TimelineColumns>(db, 'SELECT * FROM timelines WHERE deal_id = ? ORDER BY version DESC LIMIT 1').get(dealId)
  return row ? toTimelineRow(row) : null
}

export function listTimelines(db: Db, dealId: number): TimelineRow[] {
  return sql<TimelineColumns>(db, 'SELECT * FROM timelines WHERE deal_id = ? ORDER BY version').all(dealId).map(toTimelineRow)
}

function requireTimeline(db: Db, dealId: number, version: number): TimelineRow {
  const row = getTimeline(db, dealId, version)
  if (!row) throw new DomainError(404, `Deal ${dealId} has no timeline version ${version}`)
  return row
}

export function createVersion(db: Db, dealId: number, timeline: Timeline, now: Date = new Date()): TimelineRow {
  return transaction(db, () => {
    const version = (newestTimeline(db, dealId)?.version ?? 0) + 1
    sql(db, 'INSERT INTO timelines (deal_id, version, json, created_at) VALUES (?, ?, ?, ?)').run(
      dealId,
      version,
      JSON.stringify({ ...timeline, dealId, version }),
      nowIso(now),
    )
    return requireTimeline(db, dealId, version)
  })
}

export function updateVersion(
  db: Db,
  dealId: number,
  version: number,
  update: (timeline: Timeline) => Timeline,
): TimelineRow {
  return transaction(db, () => {
    const row = requireTimeline(db, dealId, version)
    const next = update(structuredClone(row.timeline))
    sql(db, 'UPDATE timelines SET json = ? WHERE id = ?').run(JSON.stringify({ ...next, dealId, version }), row.id)
    return requireTimeline(db, dealId, version)
  })
}

export function markRenderStatus(
  db: Db,
  dealId: number,
  version: number,
  status: RenderStatus,
  now: Date = new Date(),
): TimelineRow {
  return transaction(db, () => {
    const row = requireTimeline(db, dealId, version)
    sql(db, 'UPDATE timelines SET render_status = ?, rendered_at = ? WHERE id = ?').run(
      status,
      status === 'rendered' ? nowIso(now) : row.renderedAt,
      row.id,
    )
    return requireTimeline(db, dealId, version)
  })
}

export function setSlideTimes(db: Db, dealId: number, version: number, times: readonly SlideTime[]): TimelineRow {
  const bySlide = new Map(times.map((time) => [time.slide, time]))
  return updateVersion(db, dealId, version, (timeline) => ({
    ...timeline,
    segments: timeline.segments.map((segment) => {
      const time = bySlide.get(segment.slide)
      if (!time || !(time.endS >= time.startS)) throw new Error(`No valid time for slide ${segment.slide}`)
      return { ...segment, startS: time.startS, endS: time.endS }
    }),
  }))
}

export function setApproval(db: Db, dealId: number, version: number, approved: boolean, now: Date = new Date()): TimelineRow {
  return transaction(db, () => {
    const row = requireTimeline(db, dealId, version)
    const approvedAt = approved ? (row.approvedAt ?? nowIso(now)) : null
    sql(db, 'UPDATE timelines SET approved_at = ? WHERE id = ?').run(approvedAt, row.id)
    return requireTimeline(db, dealId, version)
  })
}

export function approveVersion(db: Db, dealId: number, version: number, now: Date = new Date()): TimelineRow {
  return setApproval(db, dealId, version, true, now)
}
