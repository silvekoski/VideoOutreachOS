import { describe, expect, it } from 'vitest'
import type { SlotDto } from '@mergero/shared'
import { formatMeeting, groupSlotsByDay, viewerTimeZone } from '../../src/video/slots.ts'

function slot(start: string): SlotDto {
  return { start, end: new Date(Date.parse(start) + 30 * 60_000).toISOString() }
}

const SLOTS = [
  slot('2026-09-29T06:00:00.000Z'),
  slot('2026-09-29T06:30:00.000Z'),
  slot('2026-09-30T12:30:00.000Z'),
  slot('2026-09-29T13:00:00.000Z'),
  slot('2026-10-01T02:00:00.000Z'),
]

describe('groupSlotsByDay', () => {
  it('groups by the local day of the viewer, sorted by time', () => {
    const days = groupSlotsByDay(SLOTS, 'en-US', 'Europe/Helsinki')
    expect(days.map((day) => day.key)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
    expect(days[0]?.slots.map((item) => item.label)).toEqual(['9:00 AM', '9:30 AM', '4:00 PM'])
    expect(days[0]?.slots.map((item) => item.start)).toEqual([
      '2026-09-29T06:00:00.000Z',
      '2026-09-29T06:30:00.000Z',
      '2026-09-29T13:00:00.000Z',
    ])
    expect(days[0]?.label).toBe('Tuesday, September 29')
    expect(days[0]?.short).toBe('Tue, Sep 29')
    expect(days[2]?.slots.map((item) => item.label)).toEqual(['5:00 AM'])
  })

  it('moves a slot to the previous day west of UTC', () => {
    const days = groupSlotsByDay(SLOTS, 'en-US', 'America/New_York')
    expect(days.map((day) => [day.key, day.slots.length])).toEqual([
      ['2026-09-29', 3],
      ['2026-09-30', 2],
    ])
    expect(days[1]?.slots.map((item) => item.label)).toEqual(['8:30 AM', '10:00 PM'])
  })

  it('uses the page locale for the labels', () => {
    const days = groupSlotsByDay(SLOTS, 'de-DE', 'Europe/Berlin')
    expect(days[0]?.label).toBe('Dienstag, 29. September')
    expect(days[0]?.slots[0]?.label).toBe('8:00')
    const finnish = groupSlotsByDay(SLOTS, 'fi-FI', 'Europe/Helsinki')
    expect(finnish[0]?.slots[0]?.label).toBe('9.00')
  })

  it('drops duplicate and unreadable starts', () => {
    const days = groupSlotsByDay(
      [slot('2026-09-29T06:00:00.000Z'), { start: '2026-09-29T06:00:00Z', end: '' }, { start: 'soon', end: '' }],
      'en-US',
      'UTC',
    )
    expect(days).toHaveLength(1)
    expect(days[0]?.slots).toEqual([{ start: '2026-09-29T06:00:00.000Z', label: '6:00 AM' }])
  })

  it('gives no days for no slots', () => {
    expect(groupSlotsByDay([], 'en-US', 'UTC')).toEqual([])
  })
})

describe('formatMeeting', () => {
  const ABBREVIATION = /\b(?:GMT|UTC|[A-Z]{2,4}S?T|[A-Z]?ES?Z)\b|[+-]\d/u

  it('writes the meeting time without a leading zero and with the IANA time zone name', () => {
    expect(formatMeeting('2026-09-29T06:00:00.000Z', 'en-US', 'Europe/Helsinki')).toBe(
      'Tuesday, September 29 at 9:00 AM (Europe/Helsinki)',
    )
    expect(formatMeeting('2026-09-29T06:00:00.000Z', 'de-DE', 'Europe/Berlin')).toBe(
      'Dienstag, 29. September um 8:00 (Europe/Berlin)',
    )
  })

  it('never names the time zone with an abbreviation or an offset', () => {
    for (const locale of ['en-US', 'fi-FI', 'sv-SE', 'nb-NO', 'da-DK', 'de-DE']) {
      for (const zone of ['Europe/Helsinki', 'Europe/Zurich', 'America/New_York']) {
        const text = formatMeeting('2026-12-29T06:00:00.000Z', locale, zone)
        expect(text.endsWith(` (${zone})`), text).toBe(true)
        expect(text.slice(0, -zone.length - 3), text).not.toMatch(ABBREVIATION)
      }
    }
  })

  it('uses the time zone of the viewer by default', () => {
    const zone = viewerTimeZone()
    expect(zone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(formatMeeting('2026-09-29T06:00:00.000Z', 'en-US').endsWith(` (${zone})`)).toBe(true)
  })
})
