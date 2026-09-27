import type { Amount, MgxClosedDeal, ValuationResult } from './types.ts'

const MIN_DEALS = 3

export function nace2(nace: string | null | undefined): string | null {
  const match = /^\s*[A-Za-z]?\s*(\d{2})/u.exec(nace ?? '')
  return match?.[1] ?? null
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new RangeError('percentile of an empty list')
  if (!(p >= 0 && p <= 1)) throw new RangeError(`percentile p must be in [0, 1], got ${p}`)
  const h = (sorted.length - 1) * p
  const lo = Math.floor(h)
  const low = sorted[lo] as number
  const high = sorted[Math.min(lo + 1, sorted.length - 1)] as number
  return low + (h - lo) * (high - low)
}

function cleanMultiples(multiples: number[]): number[] {
  return multiples.filter((m) => Number.isFinite(m) && m > 0).sort((a, b) => a - b)
}

export function multiplesFor(deals: MgxClosedDeal[], nace: string | null): number[] {
  const code = nace2(nace)
  if (code === null) return []
  return cleanMultiples(deals.filter((deal) => nace2(deal.nace) === code).map((deal) => deal.profitMultiple))
}

export interface ValuationRange {
  available: boolean
  low: number | null
  high: number | null
}

export function valuationRange(profit: Amount, p25: number, p75: number): ValuationRange {
  const [min, max] = profit.kind === 'exact' ? [profit.value, profit.value] : [profit.min, profit.max]
  const lowProfit = min !== null && min > 0 ? min : null
  if ((max !== null && max <= 0) || (lowProfit === null && max === null)) {
    return { available: false, low: null, high: null }
  }
  return {
    available: true,
    low: lowProfit === null ? null : Math.round(lowProfit * p25),
    high: max === null ? null : Math.round(max * p75),
  }
}

export function computeValuation(profit: Amount | null, multiples: number[], nace: string | null): ValuationResult {
  const sorted = cleanMultiples(multiples)
  const base = { dealCount: sorted.length, nace2: nace2(nace) }
  if (sorted.length < MIN_DEALS) return { ...base, available: false, low: null, high: null, p25: null, p75: null }
  const p25 = percentile(sorted, 0.25)
  const p75 = percentile(sorted, 0.75)
  const range = profit === null ? { available: false, low: null, high: null } : valuationRange(profit, p25, p75)
  return { ...base, ...range, p25, p75 }
}
