import { t } from './i18n.ts'
import { fill, formatEur } from './i18n/base.ts'
import type { Amount, Lang, ValuationResult } from './types.ts'

export function formatMoney(value: number, lang: Lang): string {
  return formatEur(value, t(lang).locale)
}

export function formatAmount(amount: Amount | null, lang: Lang): string {
  const s = t(lang)
  if (amount === null) return s.brief.noData
  if (amount.kind === 'exact') {
    return new Intl.NumberFormat(s.locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount.value)
  }
  const { min, max } = amount
  if (min !== null && max !== null) return fill(s.format.range, { min: formatMoney(min, lang), max: formatMoney(max, lang) })
  if (max !== null) return fill(s.format.under, { max: formatMoney(max, lang) })
  if (min !== null) return fill(s.format.over, { min: formatMoney(min, lang) })
  return s.brief.noData
}

export function pipedriveAmountText(amount: Amount | null): string | null {
  if (amount === null) return null
  if (amount.kind === 'exact') return `${Math.round(amount.value)} EUR`
  if (amount.min === null && amount.max === null) return null
  const bound = (value: number | null) => (value === null ? '' : String(Math.round(value)))
  return `${bound(amount.min)}-${bound(amount.max)} EUR`
}

export function pipedriveValuationText(v: ValuationResult | null): string | null {
  if (v === null || !v.available) return null
  return pipedriveAmountText({ kind: 'range', min: v.low, max: v.high })
}

export function formatDurationS(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor(total / 60) % 60
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${h} h ${pad(m)} min ${pad(s)} s`
  if (m > 0) return `${m} min ${pad(s)} s`
  return `${s} s`
}
