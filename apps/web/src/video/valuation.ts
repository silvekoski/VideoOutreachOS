import type { Amount, VideoPageData } from '@mergero/shared'
import { fill, formatEur } from '@mergero/shared/i18n/base'
import { valuationRange } from '@mergero/shared/valuation'
import type { ValuationRange } from '@mergero/shared/valuation'

export interface AmountDraft {
  kind: 'range' | 'exact'
  range: string
  exact: string
}

export interface RangeOption {
  value: string
  min: number | null
  max: number | null
}

const MAX_AMOUNT = 1e12

export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s'’]/gu, '').replace(/eur|€/giu, '')
  if (!/^\d[\d.,]*$/u.test(cleaned)) return null
  const decimal = /^(\d[\d.,]*?)[.,](\d{1,2})$/u.exec(cleaned)
  const digits = (part: string) => part.replace(/[.,]/gu, '')
  const value = decimal ? Number(`${digits(decimal[1] ?? '')}.${decimal[2]}`) : Number(digits(cleaned))
  return Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT ? value : null
}

export function isInvalidAmount(draft: AmountDraft): boolean {
  return draft.kind === 'exact' && draft.exact.trim() !== '' && parseAmount(draft.exact) === null
}

export function toAmount(draft: AmountDraft, options: readonly RangeOption[]): Amount | null {
  if (draft.kind === 'exact') {
    const value = parseAmount(draft.exact)
    return value === null ? null : { kind: 'exact', value }
  }
  const option = options.find((item) => item.value === draft.range)
  return option ? { kind: 'range', min: option.min, max: option.max } : null
}

export function calculatorRange(
  data: Pick<VideoPageData, 'calculator' | 'calculatorEnabled'>,
  profit: Amount | null,
): ValuationRange | null {
  if (!data.calculatorEnabled || data.calculator === null || profit === null) return null
  return valuationRange(profit, data.calculator.p25, data.calculator.p75)
}

export function rangeText(
  range: ValuationRange,
  templates: { result: string; over: string; under: string },
  locale: string,
): string | null {
  if (!range.available) return null
  const money = (value: number) => formatEur(value, locale)
  if (range.low !== null && range.high !== null) {
    return fill(templates.result, { low: money(range.low), high: money(range.high) })
  }
  if (range.low !== null) return fill(templates.over, { min: money(range.low) })
  if (range.high !== null) return fill(templates.under, { max: money(range.high) })
  return null
}
