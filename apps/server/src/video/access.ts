import type { Db } from '../db/index.ts'
import type { DealRow, TimelineRow } from '../db/rows.ts'
import { getDealByCode, isExpired } from '../domain/deals.ts'
import { DomainError } from '../domain/errors.ts'
import { getTimeline, listTimelines } from '../domain/timelines.ts'

export type LinkState = { kind: 'missing' } | { kind: 'expired'; deal: DealRow } | { kind: 'live'; deal: DealRow }

export function findLink(db: Db, code: string, now: Date): LinkState {
  const deal = getDealByCode(db, code)
  if (!deal) return { kind: 'missing' }
  return isExpired(deal, now) ? { kind: 'expired', deal } : { kind: 'live', deal }
}

export function pageVersion(db: Db, deal: DealRow, preview: boolean): TimelineRow | null {
  const row =
    deal.publishedVersion !== null
      ? getTimeline(db, deal.id, deal.publishedVersion)
      : preview
        ? (listTimelines(db, deal.id).findLast((item) => item.renderStatus === 'rendered') ?? null)
        : null
  return row?.renderStatus === 'rendered' ? row : null
}

export function requireLiveLink(db: Db, code: string, now: Date): DealRow {
  const link = findLink(db, code, now)
  if (link.kind === 'missing') throw new DomainError(404, 'The link does not exist')
  if (link.kind === 'expired') throw new DomainError(410, 'The link has expired')
  return link.deal
}

export function requirePublishedLink(db: Db, code: string, now: Date): DealRow {
  const deal = requireLiveLink(db, code, now)
  if (deal.publishedVersion === null) throw new DomainError(404, 'The link does not exist')
  return deal
}
