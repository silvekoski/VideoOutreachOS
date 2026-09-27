import { describe, expect, it } from 'vitest'
import type { MgxClosedDeal } from '../src/types.ts'
import { computeValuation, multiplesFor, nace2, percentile } from '../src/valuation.ts'

const deal = (id: string, nace: string, profitMultiple: number): MgxClosedDeal => ({
  id,
  year: 2025,
  country: 'FI',
  nace,
  text: 'A deal',
  profitMultiple,
})

describe('nace2', () => {
  it.each([
    ['25.62', '25'],
    ['C25.6', '25'],
    ['2562', '25'],
    ['01.1', '01'],
    [' C 25.11 ', '25'],
    ['5', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%s gives %s', (value, expected) => {
    expect(nace2(value)).toBe(expected)
  })
})

describe('percentile', () => {
  it('interpolates linearly between the closest ranks (R-7)', () => {
    expect(percentile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75)
    expect(percentile([1, 2, 3, 4], 0.75)).toBeCloseTo(3.25)
    expect(percentile([4, 5, 7], 0.25)).toBeCloseTo(4.5)
    expect(percentile([4, 5, 7], 0.75)).toBeCloseTo(6)
    expect(percentile([3.1, 4.2, 5.0, 5.8, 7.4], 0.25)).toBeCloseTo(4.2)
    expect(percentile([3.1, 4.2, 5.0, 5.8, 7.4], 0.5)).toBeCloseTo(5.0)
  })

  it('returns the ends for p 0 and p 1 and the value for a single item', () => {
    expect(percentile([2, 9], 0)).toBe(2)
    expect(percentile([2, 9], 1)).toBe(9)
    expect(percentile([6], 0.75)).toBe(6)
  })

  it('rejects an empty list and p outside [0, 1]', () => {
    expect(() => percentile([], 0.5)).toThrow(RangeError)
    expect(() => percentile([1], 1.5)).toThrow(RangeError)
    expect(() => percentile([1], Number.NaN)).toThrow(RangeError)
  })
})

describe('multiplesFor', () => {
  it('keeps finite positive multiples of the same two-digit code, sorted', () => {
    const deals = [
      deal('a', '25.62', 6),
      deal('b', '25.11', 4),
      deal('c', '28.1', 9),
      deal('d', 'C25', Number.NaN),
      deal('e', '25.99', 0),
      deal('f', '25.50', -2),
      deal('g', '2599', 5),
    ]
    expect(multiplesFor(deals, 'C25.62')).toEqual([4, 5, 6])
    expect(multiplesFor(deals, null)).toEqual([])
    expect(multiplesFor(deals, '99.00')).toEqual([])
  })
})

describe('computeValuation', () => {
  const multiples = [4, 5, 7]

  it('gives no range with fewer than 3 multiples', () => {
    const result = computeValuation({ kind: 'exact', value: 500_000 }, [4, 5], '25.62')
    expect(result).toEqual({ available: false, low: null, high: null, p25: null, p75: null, dealCount: 2, nace2: '25' })
  })

  it('uses the same value for low and high with an exact profit', () => {
    const result = computeValuation({ kind: 'exact', value: 1_000_000 }, multiples, '25.62')
    expect(result).toEqual({ available: true, low: 4_500_000, high: 6_000_000, p25: 4.5, p75: 6, dealCount: 3, nace2: '25' })
  })

  it('uses profit low times p25 and profit high times p75 with a range', () => {
    const result = computeValuation({ kind: 'range', min: 500_000, max: 1_000_000 }, [7, 4, 5], '25')
    expect(result.low).toBe(2_250_000)
    expect(result.high).toBe(6_000_000)
  })

  it('keeps an open upper bound open', () => {
    const result = computeValuation({ kind: 'range', min: 5_000_000, max: null }, multiples, '25')
    expect(result).toMatchObject({ available: true, low: 22_500_000, high: null })
  })

  it('keeps an open or zero lower bound open', () => {
    expect(computeValuation({ kind: 'range', min: null, max: 250_000 }, multiples, '25')).toMatchObject({
      available: true,
      low: null,
      high: 1_500_000,
    })
    expect(computeValuation({ kind: 'range', min: 0, max: 250_000 }, multiples, '25')).toMatchObject({ low: null })
  })

  it('gives no range for a loss or zero profit but keeps the percentiles', () => {
    for (const profit of [
      { kind: 'range', min: null, max: 0 },
      { kind: 'exact', value: 0 },
      { kind: 'exact', value: -100_000 },
      { kind: 'range', min: null, max: null },
    ] as const) {
      expect(computeValuation(profit, multiples, '25')).toMatchObject({ available: false, low: null, high: null, p25: 4.5, p75: 6 })
    }
  })

  it('gives the percentiles without a profit', () => {
    expect(computeValuation(null, multiples, null)).toEqual({
      available: false,
      low: null,
      high: null,
      p25: 4.5,
      p75: 6,
      dealCount: 3,
      nace2: null,
    })
  })

  it('ignores invalid multiples in the count', () => {
    expect(computeValuation(null, [4, 5, Number.POSITIVE_INFINITY, -1], '25').dealCount).toBe(2)
  })
})
