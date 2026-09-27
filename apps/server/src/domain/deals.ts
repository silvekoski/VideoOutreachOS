import { randomBytes } from 'node:crypto'
import type { DealStatus } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { DEAL_COLUMNS, toDealRow, toJson } from '../db/rows.ts'
import type { DealColumns, DealPatch, DealRow } from '../db/rows.ts'
import { DomainError } from './errors.ts'

export const LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/u
export const MIN_EXPIRY_DAYS = 1
export const MAX_EXPIRY_DAYS = 365
const DAY_MS = 86_400_000

export function newLinkCode(): string {
  return randomBytes(16).toString('base64url')
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

export function getDeal(db: Db, id: number): DealRow | null {
  const row = sql<DealColumns>(db, 'SELECT * FROM deals WHERE id = ?').get(id)
  return row ? toDealRow(row) : null
}

export function requireDeal(db: Db, id: number): DealRow {
  const deal = getDeal(db, id)
  if (!deal) throw new DomainError(404, `Deal ${id} does not exist`)
  return deal
}

export function getDealByCode(db: Db, code: string): DealRow | null {
  if (!LINK_CODE_PATTERN.test(code)) return null
  const row = sql<DealColumns>(db, 'SELECT * FROM deals WHERE link_code = ?').get(code)
  return row ? toDealRow(row) : null
}

export interface DealFilter {
  analystId?: number
  country?: string
  status?: DealStatus | readonly DealStatus[]
}

export function listDeals(db: Db, filter: DealFilter = {}): DealRow[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.analystId !== undefined) {
    where.push('analyst_id = ?')
    params.push(filter.analystId)
  }
  if (filter.country !== undefined) {
    where.push('country = ?')
    params.push(filter.country.toUpperCase())
  }
  if (filter.status !== undefined) {
    const statuses = typeof filter.status === 'string' ? [filter.status] : filter.status
    if (statuses.length === 0) return []
    where.push(`status IN (${statuses.map(() => '?').join(', ')})`)
    params.push(...statuses)
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  return sql<DealColumns>(db, `SELECT * FROM deals ${clause} ORDER BY updated_at DESC, id DESC`)
    .all(...params)
    .map(toDealRow)
}

export function updateDeal(db: Db, id: number, patch: DealPatch, now: Date = new Date()): DealRow {
  const keys = (Object.keys(patch) as (keyof DealPatch)[]).filter((key) => patch[key] !== undefined)
  const sets = keys.map((key) => `${DEAL_COLUMNS[key].column} = ?`)
  const values = keys.map((key) => (DEAL_COLUMNS[key].json ? toJson(patch[key]) : patch[key]))
  const changes = sql(db, `UPDATE deals SET ${[...sets, 'updated_at = ?'].join(', ')} WHERE id = ?`).run(
    ...values,
    nowIso(now),
    id,
  ).changes
  if (changes === 0) throw new DomainError(404, `Deal ${id} does not exist`)
  return requireDeal(db, id)
}

export function isExpired(deal: Pick<DealRow, 'expiresAt' | 'expiredAt'>, now: Date = new Date()): boolean {
  return deal.expiredAt !== null || (deal.expiresAt !== null && deal.expiresAt <= nowIso(now))
}

export const MEETING_MS = 30 * 60_000
const KEEP_AFTER_MEETING_MS = 24 * 60 * 60_000

export function meetingKeepUntil(meetingAt: string): string {
  return nowIso(new Date(Date.parse(meetingAt) + MEETING_MS + KEEP_AFTER_MEETING_MS))
}

export function linkExpiresAt(deal: Pick<DealRow, 'meetingAt'>, from: Date, days: number): string {
  const expiresAt = nowIso(addDays(from, days))
  if (deal.meetingAt === null) return expiresAt
  const keepUntil = meetingKeepUntil(deal.meetingAt)
  return expiresAt < keepUntil ? keepUntil : expiresAt
}

export function setExpiry(db: Db, id: number, days: number, now: Date = new Date()): DealRow {
  if (!Number.isInteger(days) || days < MIN_EXPIRY_DAYS || days > MAX_EXPIRY_DAYS) {
    throw new DomainError(400, `The link expiry must be ${MIN_EXPIRY_DAYS} to ${MAX_EXPIRY_DAYS} days`)
  }
  return transaction(db, () => {
    const deal = requireDeal(db, id)
    if (isExpired(deal, now)) throw new DomainError(409, 'The link has expired')
    const expiresAt = deal.publishedVersion === null ? null : linkExpiresAt(deal, now, days)
    return updateDeal(db, id, { expiryDays: days, ...(expiresAt ? { expiresAt } : {}) }, now)
  })
}
