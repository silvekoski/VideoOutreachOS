import { describe, expect, it } from 'vitest'
import { formatAmount, formatDurationS, formatMoney, pipedriveAmountText, pipedriveValuationText } from '../src/format.ts'
import { LANGUAGES } from '../src/types.ts'

const plain = (text: string) => text.replace(/[\u00A0\u202F]/gu, ' ')

describe('formatMoney', () => {
  it('formats compact EUR in the locale of each language', () => {
    expect(formatMoney(4_200_000, 'en')).toBe('€4.2M')
    expect(plain(formatMoney(4_200_000, 'fi'))).toBe('4,2 milj. €')
    expect(plain(formatMoney(4_200_000, 'de'))).toBe('4,2 Mio. €')
    expect(plain(formatMoney(4_200_000, 'sv'))).toBe('4,2 mn €')
    expect(plain(formatMoney(4_200_000, 'nb'))).toBe('4,2 mill. €')
    expect(plain(formatMoney(4_200_000, 'da'))).toBe('4,2 mio. €')
  })

  it('never writes an en dash or an em dash', () => {
    for (const lang of LANGUAGES) expect(formatMoney(-150_000, lang)).not.toMatch(/[\u2013\u2014]/u)
  })
})

describe('formatAmount', () => {
  it('formats a closed range with the word of each language', () => {
    expect(formatAmount({ kind: 'range', min: 1_000_000, max: 3_000_000 }, 'en')).toBe('€1M to €3M')
    expect(plain(formatAmount({ kind: 'range', min: 1_000_000, max: 3_000_000 }, 'de'))).toBe('1 Mio. € bis 3 Mio. €')
    expect(plain(formatAmount({ kind: 'range', min: 1_000_000, max: 3_000_000 }, 'fi'))).toBe(
      'alaraja 1 milj. €, yläraja 3 milj. €',
    )
  })

  it('formats open ranges', () => {
    expect(formatAmount({ kind: 'range', min: null, max: 1_000_000 }, 'en')).toBe('Under €1M')
    expect(formatAmount({ kind: 'range', min: 50_000_000, max: null }, 'en')).toBe('Over €50M')
    expect(plain(formatAmount({ kind: 'range', min: 5_000_000, max: null }, 'sv'))).toBe('Över 5 mn €')
  })

  it('formats an exact value in full and missing values', () => {
    expect(formatAmount({ kind: 'exact', value: 1_500_000 }, 'en')).toBe('€1,500,000')
    expect(formatAmount({ kind: 'exact', value: 1_450_000 }, 'en')).toBe('€1,450,000')
    expect(plain(formatAmount({ kind: 'exact', value: 1_450_000 }, 'de'))).toBe('1.450.000 €')
    expect(plain(formatAmount({ kind: 'exact', value: 4_230_000.4 }, 'fi'))).toBe('4 230 000 €')
    expect(formatAmount(null, 'en')).toBe('No data')
    expect(formatAmount({ kind: 'range', min: null, max: null }, 'de')).toBe('Keine Daten')
  })
})

describe('pipedriveAmountText', () => {
  it.each([
    [{ kind: 'range', min: 1_000_000, max: 3_000_000 }, '1000000-3000000 EUR'],
    [{ kind: 'exact', value: 1_500_000 }, '1500000 EUR'],
    [{ kind: 'range', min: 5_000_000, max: null }, '5000000- EUR'],
    [{ kind: 'range', min: null, max: 1_000_000 }, '-1000000 EUR'],
    [{ kind: 'exact', value: 1_234.6 }, '1235 EUR'],
    [{ kind: 'range', min: null, max: null }, null],
    [null, null],
  ] as const)('%j gives %s', (amount, expected) => {
    expect(pipedriveAmountText(amount)).toBe(expected)
  })
})

describe('pipedriveValuationText', () => {
  const base = { p25: 4.5, p75: 6, dealCount: 3, nace2: '25' }
  it('writes the range of an available valuation', () => {
    expect(pipedriveValuationText({ ...base, available: true, low: 2_250_000, high: 6_000_000 })).toBe('2250000-6000000 EUR')
    expect(pipedriveValuationText({ ...base, available: true, low: 2_250_000, high: null })).toBe('2250000- EUR')
  })

  it('writes nothing without a valuation', () => {
    expect(pipedriveValuationText(null)).toBeNull()
    expect(pipedriveValuationText({ ...base, available: false, low: null, high: null })).toBeNull()
  })
})

describe('formatDurationS', () => {
  it.each([
    [125, '2 min 05 s'],
    [45, '45 s'],
    [44.6, '45 s'],
    [0, '0 s'],
    [60, '1 min 00 s'],
    [3725, '1 h 02 min 05 s'],
    [-5, '0 s'],
    [Number.NaN, '0 s'],
  ])('%d seconds give %s', (seconds, expected) => {
    expect(formatDurationS(seconds)).toBe(expected)
  })
})
