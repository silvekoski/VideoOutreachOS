import { describe, expect, it } from 'vitest'
import { computeSignals, interestLevel } from '../src/signals.ts'
import type { SignalInput } from '../src/signals.ts'
import type { FormAnswers, Signal, SignalKey } from '../src/types.ts'
import { SIGNAL_KEYS } from '../src/types.ts'
import { SLIDE_TIMES, analytics, dealEvent, sessionEvents } from './fixtures.ts'

function form(overrides: Partial<FormAnswers> = {}): FormAnswers {
  return {
    revenue: { kind: 'range', min: 1_000_000, max: 3_000_000 },
    profit: { kind: 'range', min: 250_000, max: 500_000 },
    staff: '20-49',
    timing: 'later',
    notInterestedReason: null,
    custom: [],
    message: null,
    submittedAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  }
}

function input(overrides: Partial<SignalInput> = {}): SignalInput {
  return {
    analytics: analytics(),
    events: [],
    form: null,
    sessionDays: [{ sessionId: 's1', localDay: '2026-09-25' }],
    ...overrides,
  }
}

const keys = (signals: Signal[]) => signals.map((s) => s.key)
const find = (signals: Signal[], key: SignalKey) => signals.find((s) => s.key === key)

describe('computeSignals', () => {
  it('returns no signal for a plain session', () => {
    expect(computeSignals(input())).toEqual([])
  })

  it('finds watched to the end from the first complete event', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['complete', 170],
      ['play', 0],
      ['complete', 170],
    ])
    const signal = find(computeSignals(input({ events })), 'watched_to_end')
    expect(signal).toEqual({
      key: 'watched_to_end',
      type: 'positive',
      evidenceEventId: 2,
      evidenceText: null,
      evidenceEvent: { type: 'complete', at: '2026-09-26T10:00:00.000Z', slide: 8, channel: 'email' },
    })
  })

  it('finds a replay of slide 4 or 5 with the replay event as evidence', () => {
    const events = sessionEvents('s1', 1, [
      ['play', 0],
      ['slide_start', 70],
      ['slide_start', 90],
      ['seek', 75, { from: 95 }],
      ['slide_start', 75, {}, 4],
    ])
    const perSlide = SLIDE_TIMES.map((s) => ({ slide: s.slide, watchS: 10, replays: s.slide === 4 ? 1 : 0 }))
    const signal = find(computeSignals(input({ events, analytics: analytics({ perSlide }) })), 'replayed_figures_or_buyers')
    expect(signal?.evidenceEventId).toBe(5)
    expect(signal?.evidenceEvent).toMatchObject({ type: 'slide_start', slide: 4 })
  })

  it('ignores replays of other slides', () => {
    const perSlide = SLIDE_TIMES.map((s) => ({ slide: s.slide, watchS: 10, replays: s.slide === 3 || s.slide === 6 ? 2 : 0 }))
    expect(keys(computeSignals(input({ analytics: analytics({ perSlide }) })))).not.toContain('replayed_figures_or_buyers')
  })

  it('uses the replayed slide numbers as text when no replay event exists', () => {
    const perSlide = SLIDE_TIMES.map((s) => ({ slide: s.slide, watchS: 10, replays: s.slide === 5 ? 1 : 0 }))
    const signal = find(computeSignals(input({ analytics: analytics({ perSlide }) })), 'replayed_figures_or_buyers')
    expect(signal).toMatchObject({ evidenceEventId: null, evidenceText: '5', evidenceEvent: null })
  })

  it.each([
    ['buyer_link_tap', 'tapped_buyer_link'],
    ['calculator_result', 'used_calculator'],
    ['forward', 'forwarded_link'],
  ] as const)('finds %s events as %s', (type, key) => {
    const events = sessionEvents('s1', 7, [
      ['open', null],
      [type, null],
      [type, null],
    ])
    expect(find(computeSignals(input({ events })), key)).toEqual({
      key,
      type: 'positive',
      evidenceEventId: 8,
      evidenceText: null,
      evidenceEvent: { type, at: '2026-09-26T10:00:00.000Z', slide: null, channel: 'email' },
    })
  })

  it('finds exact figures with the newest form_sent event as evidence', () => {
    const events = [dealEvent(30, 'form_sent'), dealEvent(31, 'form_sent')]
    const exactProfit = computeSignals(input({ events, form: form({ profit: { kind: 'exact', value: 610_000 } }) }))
    expect(find(exactProfit, 'gave_exact_figures')).toMatchObject({
      evidenceEventId: 31,
      evidenceEvent: { type: 'form_sent', at: '2026-09-26T12:00:00.000Z', slide: null, channel: null },
    })
    const exactRevenue = computeSignals(input({ events, form: form({ revenue: { kind: 'exact', value: 4_200_000 } }) }))
    expect(keys(exactRevenue)).toContain('gave_exact_figures')
    expect(keys(computeSignals(input({ events, form: form() })))).not.toContain('gave_exact_figures')
  })

  it('finds came back with the first open event of the second local day', () => {
    const sessionDays = [
      { sessionId: 's1', localDay: '2026-09-25' },
      { sessionId: 's2', localDay: '2026-09-25' },
      { sessionId: 's4', localDay: '2026-09-27' },
      { sessionId: 's3', localDay: '2026-09-26' },
      { sessionId: 's5', localDay: '2026-09-26' },
    ]
    const events = [
      ...sessionEvents('s1', 1, [['open', null]]),
      ...sessionEvents('s5', 19, [
        ['play', 0],
        ['open', null],
      ]),
      ...sessionEvents('s3', 30, [['open', null]]),
      ...sessionEvents('s4', 40, [['open', null]]),
    ]
    const signal = find(computeSignals(input({ sessionDays, events })), 'came_back')
    expect(signal).toMatchObject({ type: 'positive', evidenceEventId: 20, evidenceEvent: { type: 'open', channel: 'email' } })
  })

  it('does not find came back with several sessions on one day', () => {
    const sessionDays = [
      { sessionId: 's1', localDay: '2026-09-25' },
      { sessionId: 's2', localDay: '2026-09-25' },
    ]
    expect(keys(computeSignals(input({ sessionDays })))).not.toContain('came_back')
  })

  it('uses the days as text when the second day has no open event', () => {
    const sessionDays = [
      { sessionId: 's1', localDay: '2026-09-25' },
      { sessionId: 's2', localDay: '2026-09-26' },
    ]
    expect(find(computeSignals(input({ sessionDays })), 'came_back')?.evidenceText).toBe('2026-09-25, 2026-09-26')
  })

  it('finds answered custom questions only for a non-empty answer', () => {
    const events = [dealEvent(30, 'form_sent')]
    const answered = form({ custom: [{ questionId: 'q1', question: 'Successor?', answer: 'My son' }] })
    expect(find(computeSignals(input({ events, form: answered })), 'answered_custom_questions')?.evidenceEventId).toBe(30)
    const blank = form({ custom: [{ questionId: 'q1', question: 'Successor?', answer: '  ' }] })
    expect(keys(computeSignals(input({ events, form: blank })))).not.toContain('answered_custom_questions')
  })

  it('finds stopped early for a stop slide before slide 4', () => {
    const early = find(computeSignals(input({ analytics: analytics({ stopSlide: 3 }) })), 'stopped_early')
    expect(early).toEqual({ key: 'stopped_early', type: 'negative', evidenceEventId: null, evidenceText: '3', evidenceEvent: null })
    expect(keys(computeSignals(input({ analytics: analytics({ stopSlide: 4 }) })))).not.toContain('stopped_early')
    expect(keys(computeSignals(input({ analytics: analytics({ stopSlide: null }) })))).not.toContain('stopped_early')
  })

  it('finds short watch below 30 seconds with the total seconds as text', () => {
    const short = find(computeSignals(input({ analytics: analytics({ totalWatchS: 29.9 }) })), 'short_watch')
    expect(short).toEqual({ key: 'short_watch', type: 'negative', evidenceEventId: null, evidenceText: '29', evidenceEvent: null })
    expect(keys(computeSignals(input({ analytics: analytics({ totalWatchS: 30 }) })))).not.toContain('short_watch')
  })

  it('returns the signals in the order of SIGNAL_KEYS', () => {
    const events = [
      ...sessionEvents('s1', 1, [
        ['open', null],
        ['complete', 170],
        ['buyer_link_tap', null],
        ['forward', null],
        ['calculator_result', null],
      ]),
      dealEvent(30, 'form_sent'),
    ]
    const signals = computeSignals(
      input({
        events,
        analytics: analytics({ stopSlide: 2, totalWatchS: 10 }),
        form: form({ revenue: { kind: 'exact', value: 1 }, custom: [{ questionId: 'q', question: 'Q', answer: 'A' }] }),
        sessionDays: [
          { sessionId: 's1', localDay: '2026-09-25' },
          { sessionId: 's2', localDay: '2026-09-26' },
        ],
      }),
    )
    const order = keys(signals)
    expect(order).toEqual(SIGNAL_KEYS.filter((key) => order.includes(key)))
    expect(order).toHaveLength(9)
  })
})

describe('interestLevel', () => {
  const make = (positive: number, negative: number): Signal[] => [
    ...SIGNAL_KEYS.slice(0, positive).map((key): Signal => ({ key, type: 'positive', evidenceEventId: 1, evidenceText: null, evidenceEvent: null })),
    ...(['stopped_early', 'short_watch'] as const)
      .slice(0, negative)
      .map((key): Signal => ({ key, type: 'negative', evidenceEventId: null, evidenceText: '1', evidenceEvent: null })),
  ]

  it.each([
    [4, 0, 'high'],
    [8, 0, 'high'],
    [3, 0, 'medium'],
    [4, 1, 'medium'],
    [1, 1, 'medium'],
    [1, 0, 'medium'],
    [0, 0, 'low'],
    [0, 1, 'low'],
    [5, 2, 'low'],
    [1, 2, 'low'],
  ] as const)('%i positive and %i negative give %s', (positive, negative, level) => {
    expect(interestLevel(make(positive, negative))).toBe(level)
  })
})
