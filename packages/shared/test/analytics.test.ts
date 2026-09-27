import { describe, expect, it } from 'vitest'
import { computeDealAnalytics, computeSessionAnalytics } from '../src/analytics.ts'
import { SLIDE_TIMES, sessionEvents } from './fixtures.ts'

const watchOf = (result: ReturnType<typeof computeSessionAnalytics>, slide: number) =>
  result.perSlide.find((s) => s.slide === slide)?.watchS

describe('computeSessionAnalytics', () => {
  it('counts play to pause as watch time per slide', () => {
    const events = sessionEvents('s1', 1, [
      ['open', null],
      ['play', 0],
      ['slide_start', 30],
      ['pause', 45],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(watchOf(result, 1)).toBe(30)
    expect(watchOf(result, 2)).toBe(15)
    expect(result.watchS).toBe(45)
    expect(result.stopSlide).toBe(2)
    expect(result.played).toBe(true)
    expect(result.completed).toBe(false)
    expect(result.perSlide).toHaveLength(8)
  })

  it('closes the interval at the seek origin and reopens at the target on a forward seek', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['seek', 60, { from: 10 }],
      ['pause', 75],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(watchOf(result, 1)).toBe(10)
    expect(watchOf(result, 2)).toBe(0)
    expect(watchOf(result, 3)).toBe(10)
    expect(watchOf(result, 4)).toBe(5)
    expect(result.watchS).toBe(25)
    expect(result.stopSlide).toBe(4)
  })

  it('counts watch time twice and a replay on a backward seek', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['slide_start', 70],
      ['slide_start', 90],
      ['seek', 72, { from: 95 }],
      ['slide_start', 72, {}, 4],
      ['pause', 100],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(watchOf(result, 4)).toBe(38)
    expect(watchOf(result, 5)).toBe(15)
    expect(result.perSlide.find((s) => s.slide === 4)?.replays).toBe(1)
    expect(result.replays).toBe(1)
    expect(result.stopSlide).toBe(5)
  })

  it('uses the last known time for a seek without a from value', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['slide_start', 30],
      ['seek', 100],
      ['pause', 105],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(result.watchS).toBe(35)
  })

  it('ignores a seek while paused', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['pause', 10],
      ['seek', 100, { from: 10 }],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(result.watchS).toBe(10)
    expect(result.stopSlide).toBe(1)
  })

  it('closes the interval on page_hide', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['page_hide', 20],
      ['scroll', null],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(result.watchS).toBe(20)
    expect(result.stopSlide).toBe(1)
  })

  it('closes an open interval at the last known time when closing events are missing', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['slide_start', 30],
      ['slide_start', 50],
      ['tap', null],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(result.watchS).toBe(50)
    expect(result.stopSlide).toBe(3)
  })

  it('closes a running interval at the last known time when a second play arrives', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['slide_start', 30],
      ['play', 40],
      ['pause', 45],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(result.watchS).toBe(35)
  })

  it('sets slide 8 as the stop slide after complete and counts replays after it', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ...SLIDE_TIMES.map((s): ['slide_start', number] => ['slide_start', s.startS]),
      ['complete', 170],
      ['play', 0],
      ['slide_start', 0],
      ['pause', 10],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(result.completed).toBe(true)
    expect(result.stopSlide).toBe(8)
    expect(result.watchS).toBe(180)
    expect(watchOf(result, 1)).toBe(40)
    expect(result.perSlide.find((s) => s.slide === 1)?.replays).toBe(1)
    expect(result.replays).toBe(1)
  })

  it('has no stop slide and no watch time without play', () => {
    const events = sessionEvents('s1', 1, [
      ['open', null],
      ['field_focus', null, { field: 'revenue' }],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(result.played).toBe(false)
    expect(result.stopSlide).toBeNull()
    expect(result.watchS).toBe(0)
    expect(result.formActivity).toBe(true)
  })

  it('sorts events by sequence number', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['pause', 20],
    ]).reverse()
    expect(computeSessionAnalytics(events, SLIDE_TIMES).watchS).toBe(20)
  })

  it('ignores negative intervals and events without a video time', () => {
    const events = sessionEvents('s1', 1, [
      ['play', null],
      ['play', 40],
      ['pause', 35],
    ])
    const result = computeSessionAnalytics(events, SLIDE_TIMES)
    expect(result.watchS).toBe(0)
    expect(result.stopSlide).toBe(2)
  })
})

describe('computeDealAnalytics', () => {
  it('sums sessions, takes the highest stop slide and counts the local days', () => {
    const first = sessionEvents('s1', 1, [
      ['play', 0],
      ['slide_start', 90],
      ['slide_start', 90],
      ['pause', 95],
    ])
    const second = sessionEvents('s2', 20, [
      ['play', 0],
      ['pause', 40],
    ])
    const third = sessionEvents('s3', 40, [['open', null]])
    const result = computeDealAnalytics(
      [
        { localDay: '2026-09-25', channel: 'email', events: first },
        { localDay: '2026-09-26', channel: 'whatsapp', events: second },
        { localDay: '2026-09-26', channel: 'linkedin', events: third },
      ],
      SLIDE_TIMES,
    )
    expect(result.opens).toBe(3)
    expect(result.sessions).toBe(3)
    expect(result.totalWatchS).toBe(135)
    expect(result.perSlide.find((s) => s.slide === 1)?.watchS).toBe(60)
    expect(result.perSlide.find((s) => s.slide === 5)?.replays).toBe(1)
    expect(result.replays).toBe(1)
    expect(result.stopSlide).toBe(5)
    expect(result.completed).toBe(false)
    expect(result.days).toBe(2)
    expect(result.lastEventId).toBe(40)
    expect(result.channel).toBe('linkedin')
  })

  it('counts each page load of a session as an open', () => {
    const reloads = sessionEvents('s1', 1, [
      ['open', null],
      ['open', null],
      ['play', 0],
      ['pause', 5],
    ])
    const result = computeDealAnalytics([{ localDay: '2026-09-26', channel: 'direct', events: reloads }], SLIDE_TIMES)
    expect(result.opens).toBe(2)
    expect(result.sessions).toBe(1)
  })

  it('returns empty numbers without sessions', () => {
    const result = computeDealAnalytics([], SLIDE_TIMES)
    expect(result).toMatchObject({ opens: 0, sessions: 0, totalWatchS: 0, stopSlide: null, days: 0, lastEventId: null, channel: null })
  })
})
