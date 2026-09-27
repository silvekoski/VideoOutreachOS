import { DACH, computeValuation, multiplesFor } from '@mergero/shared'
import type { Amount, SectorSummary, ValuationResult, VideoPageData } from '@mergero/shared'
import type { DealRow } from '../db/rows.ts'

function loadedNace(deal: DealRow): string | null {
  return deal.mgx?.nace === undefined ? deal.snapshot.nace : deal.mgx.nace
}

function sectorMultiples(deal: DealRow): number[] {
  if (!deal.mgx) return []
  const deals = new Map([...deal.mgx.sectorDeals, ...deal.mgx.recentDeals].map((item) => [item.id, item]))
  return multiplesFor([...deals.values()], loadedNace(deal))
}

export function calculatorEnabled(deal: DealRow): boolean {
  return DACH.includes(deal.country)
}

export function dealValuation(deal: DealRow, profit: Amount | null): ValuationResult | null {
  return calculatorEnabled(deal) ? computeValuation(profit, sectorMultiples(deal), loadedNace(deal)) : null
}

export function sectorSummary(deal: DealRow): SectorSummary | null {
  const valuation = computeValuation(null, sectorMultiples(deal), loadedNace(deal))
  if (valuation.p25 === null || valuation.p75 === null) return null
  return { dealCount: valuation.dealCount, p25: valuation.p25, p75: valuation.p75 }
}

export function calculatorFor(deal: DealRow): VideoPageData['calculator'] {
  return calculatorEnabled(deal) ? sectorSummary(deal) : null
}
