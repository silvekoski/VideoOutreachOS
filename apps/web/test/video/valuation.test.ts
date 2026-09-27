import { describe, expect, it } from 'vitest'
import { formatMoney as sharedFormatMoney } from '@mergero/shared/format'
import { PROFIT_RANGES, REVENUE_RANGES, t } from '@mergero/shared/i18n'
import { calculatorRange, isInvalidAmount, parseAmount, rangeText, toAmount } from '../../src/video/valuation.ts'

describe('parseAmount', () => {
  it.each([
    ['1500000', 1_500_000],
    ['1 500 000', 1_500_000],
    ['1 500 000', 1_500_000],
    ['1.500.000', 1_500_000],
    ['1,500,000', 1_500_000],
    ["1'500'000", 1_500_000],
    ['1.500', 1500],
    ['2,5', 2.5],
    ['2.75', 2.75],
    ['EUR 900000', 900_000],
    ['900000 €', 900_000],
    ['1000000000000', 1e12],
    ['1.450.000,00', 1_450_000],
    ['1,450,000.00', 1_450_000],
    ['1.450.000,5', 1_450_000.5],
    ['1 450 000,00', 1_450_000],
    ['1450000,00', 1_450_000],
    ['1.450', 1450],
    ['1.450.000', 1_450_000],
  ])('reads %j as %d', (text, value) => {
    expect(parseAmount(text)).toBe(value)
  })

  it.each(['', '   ', '0', '0,00', 'abc', '-5000', '1e6', '1000000000001', '.5'])('rejects %j', (text) => {
    expect(parseAmount(text)).toBeNull()
  })
})

describe('isInvalidAmount', () => {
  it('flags only a typed exact value that cannot be read', () => {
    expect(isInvalidAmount({ kind: 'exact', range: '', exact: '0' })).toBe(true)
    expect(isInvalidAmount({ kind: 'exact', range: '', exact: '1000000000001' })).toBe(true)
    expect(isInvalidAmount({ kind: 'exact', range: '', exact: '1 500 000' })).toBe(false)
    expect(isInvalidAmount({ kind: 'exact', range: '', exact: '  ' })).toBe(false)
    expect(isInvalidAmount({ kind: 'range', range: '', exact: '0' })).toBe(false)
  })
})

describe('toAmount', () => {
  it('maps each range option to its bounds', () => {
    for (const option of REVENUE_RANGES) {
      expect(toAmount({ kind: 'range', range: option.value, exact: '42' }, REVENUE_RANGES)).toEqual({
        kind: 'range',
        min: option.min,
        max: option.max,
      })
    }
  })

  it('gives null for no choice, an unknown option or an exact value that is not valid', () => {
    expect(toAmount({ kind: 'range', range: '', exact: '' }, PROFIT_RANGES)).toBeNull()
    expect(toAmount({ kind: 'range', range: 'huge', exact: '' }, PROFIT_RANGES)).toBeNull()
    expect(toAmount({ kind: 'exact', range: 'loss', exact: '0' }, PROFIT_RANGES)).toBeNull()
  })

  it('uses only the active kind', () => {
    expect(toAmount({ kind: 'exact', range: 'loss', exact: '640 000' }, PROFIT_RANGES)).toEqual({
      kind: 'exact',
      value: 640_000,
    })
  })
})

describe('calculatorRange', () => {
  const calculator = { p25: 4, p75: 6, dealCount: 5 }
  const profits = [
    ...PROFIT_RANGES.map((option) => toAmount({ kind: 'range', range: option.value, exact: '' }, PROFIT_RANGES)),
    { kind: 'exact' as const, value: 640_000 },
  ]

  it('gives no result to record when MGX has too few closed deals for a range', () => {
    for (const profit of profits) expect(calculatorRange({ calculatorEnabled: true, calculator: null }, profit)).toBeNull()
  })

  it('gives no result without a profit or outside DACH', () => {
    expect(calculatorRange({ calculatorEnabled: true, calculator }, null)).toBeNull()
    expect(calculatorRange({ calculatorEnabled: false, calculator }, { kind: 'exact', value: 640_000 })).toBeNull()
  })

  it('gives a range for a positive profit and an unavailable result for a loss', () => {
    expect(calculatorRange({ calculatorEnabled: true, calculator }, { kind: 'range', min: 500_000, max: 1_000_000 })).toEqual({
      available: true,
      low: 2_000_000,
      high: 6_000_000,
    })
    expect(calculatorRange({ calculatorEnabled: true, calculator }, { kind: 'range', min: null, max: 0 })).toEqual({
      available: false,
      low: null,
      high: null,
    })
  })
})

describe('rangeText', () => {
  it('writes the range with the page templates', () => {
    const strings = t('en')
    const templates = { result: strings.page.calculatorResult, over: strings.format.over, under: strings.format.under }
    const locale = strings.locale
    expect(rangeText({ available: true, low: 2_000_000, high: 6_000_000 }, templates, locale)).toBe('€2M to €6M')
    expect(rangeText({ available: true, low: 20_000_000, high: null }, templates, locale)).toBe('Over €20M')
    expect(rangeText({ available: true, low: null, high: 1_500_000 }, templates, locale)).toBe('Under €1.5M')
    expect(rangeText({ available: false, low: null, high: null }, templates, locale)).toBeNull()
  })

  it('writes Finnish ranges without a dash', () => {
    const strings = t('fi')
    const text = rangeText(
      { available: true, low: 2_000_000, high: 6_000_000 },
      { result: strings.page.calculatorResult, over: strings.format.over, under: strings.format.under },
      strings.locale,
    )
    expect(text).not.toMatch(/[\u2013\u2014]/u)
    expect(text).toContain(sharedFormatMoney(2_000_000, 'fi'))
  })
})
