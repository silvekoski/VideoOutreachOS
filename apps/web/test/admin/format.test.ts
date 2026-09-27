import { describe, expect, it } from 'vitest'
import {
  formatClock,
  formatDate,
  formatDateTime,
  formatPercent,
  formatTime,
  formatZonedDateTime,
  companyInitials,
  initials,
  isValidRange,
  lastDaysRange,
  localDay,
  pluralize,
  timeZoneNote,
} from '../../src/admin/lib/format'

describe('date formatters', () => {
  it('writes the ISO 8601 date and a 24 hour time', () => {
    expect(formatDateTime('2026-09-26T12:05:00.000Z', 'UTC')).toBe('2026-09-26 12:05')
    expect(formatDate('2026-09-26T23:30:00.000Z', 'Europe/Helsinki')).toBe('2026-09-27')
    expect(formatTime('2026-09-26T00:05:00.000Z', 'UTC')).toBe('00:05')
  })

  it('names the IANA time zone of a zoned time', () => {
    expect(formatZonedDateTime('2026-09-26T23:42:17.000Z', 'Europe/Berlin')).toBe('2026-09-27 01:42 (Europe/Berlin)')
    expect(formatZonedDateTime('2026-09-26T23:42:17.000Z', 'Europe/Helsinki')).toBe('2026-09-27 02:42 (Europe/Helsinki)')
    expect(formatZonedDateTime(null, 'Europe/Berlin')).toBe('No date')
    expect(timeZoneNote('Europe/Berlin')).toBe('The times are in the time zone Europe/Berlin.')
  })

  it('handles a missing or invalid time', () => {
    expect(formatDateTime(null)).toBe('No date')
    expect(formatDate('not a date')).toBe('No date')
    expect(formatTime(undefined)).toBe('No time')
  })
})

describe('formatPercent', () => {
  it('puts a space between the number and the unit', () => {
    expect(formatPercent(0.425)).toBe('42.5 %')
    expect(formatPercent(1)).toBe('100 %')
    expect(formatPercent(0)).toBe('0 %')
  })

  it('shows No data for a missing rate', () => {
    expect(formatPercent(null)).toBe('No data')
    expect(formatPercent(Number.NaN)).toBe('No data')
  })
})

describe('formatClock', () => {
  it('writes minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65.9)).toBe('1:05')
    expect(formatClock(-3)).toBe('0:00')
    expect(formatClock(null)).toBe('0:00')
  })
})

describe('date ranges', () => {
  it('covers the last 90 days including today', () => {
    expect(lastDaysRange(new Date(2026, 8, 26), 90)).toEqual({ from: '2026-06-29', to: '2026-09-26' })
  })

  it('writes a local day', () => {
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('accepts only an ordered pair of ISO days', () => {
    expect(isValidRange('2026-01-01', '2026-01-31')).toBe(true)
    expect(isValidRange('2026-02-01', '2026-01-31')).toBe(false)
    expect(isValidRange('', '2026-01-31')).toBe(false)
  })
})

describe('pluralize', () => {
  it('selects the word by count', () => {
    expect(pluralize(1, 'deal', 'deals')).toBe('1 deal')
    expect(pluralize(3, 'deal', 'deals')).toBe('3 deals')
  })
})

describe('companyInitials', () => {
  it('leaves out the legal form', () => {
    expect(companyInitials('Kide Software Oy')).toBe('KS')
    expect(companyInitials('Wästerby Rör & Ventilation AB')).toBe('WV')
    expect(companyInitials('Nordkraft Oy')).toBe('NO')
    expect(companyInitials('Oy')).toBe('O')
  })
})

describe('initials', () => {
  it('takes the first letter of the first and the last name', () => {
    expect(initials('Jonas Weber')).toBe('JW')
    expect(initials('anna maria virtanen')).toBe('AV')
    expect(initials('  Émilie  ')).toBe('É')
    expect(initials(' ')).toBe('')
  })
})
