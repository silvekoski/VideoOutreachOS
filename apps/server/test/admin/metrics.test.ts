import { rmSync } from 'node:fs'
import { SLIDES } from '@mergero/shared'
import type { ApiError, DealAnalytics, MetricsDto, ProviderStatus } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'
import type { MetricsDeal } from '../../src/views/metrics.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { paths } = await import('../../src/paths.ts')
const { computeMetrics, readTextSequence } = await import('../../src/views/metrics.ts')
const { T0, insertAnalyst } = await import('../domain/fixtures.ts')
const { createHarness, publishedDeal } = await import('./harness.ts')

function watched(overrides: Partial<DealAnalytics> = {}): DealAnalytics {
  return {
    opens: 1,
    sessions: 1,
    totalWatchS: 0,
    perSlide: SLIDES.map((slide) => ({ slide, watchS: 0, replays: 0 })),
    stopSlide: null,
    replays: 0,
    completed: false,
    days: 1,
    lastEventId: 1,
    channel: 'email',
    firstChannel: 'email',
    buyerLinkTaps: 0,
    calculatorResults: 0,
    forwards: 0,
    ...overrides,
  }
}

function deal(overrides: Partial<MetricsDeal>): MetricsDeal {
  return {
    analystId: 1,
    country: 'FI',
    publishedAt: '2026-09-01T10:00:00.000Z',
    firstOpenAt: null,
    bookedAt: null,
    opened: false,
    formSent: false,
    booked: false,
    analytics: null,
    interest: null,
    signals: null,
    saleTiming: null,
    taskTypes: [],
    ...overrides,
  }
}

function metricsOf(deals: MetricsDeal[]) {
  return computeMetrics({ from: '2026-09-01', to: '2026-09-30', timeZone: 'UTC', deals, textDeals: [], analystNames: new Map() })
}

describe('computeMetrics', () => {
  const deals = [
    deal({ publishedAt: '2026-09-01T10:00:00.000Z', opened: true, formSent: true, booked: true, analytics: watched({ totalWatchS: 100 }) }),
    deal({ publishedAt: '2026-09-02T10:00:00.000Z', opened: true, analytics: watched({ totalWatchS: 50 }) }),
    deal({ publishedAt: '2026-09-30T23:59:00.000Z', country: 'SE' }),
    deal({ publishedAt: '2026-08-01T10:00:00.000Z', analystId: 2, country: 'DE', opened: true, booked: true, analytics: watched({ totalWatchS: 999 }) }),
    deal({ publishedAt: '2026-10-01T00:00:00.000Z', analystId: 2, country: 'DE' }),
  ]
  const metrics = computeMetrics({
    from: '2026-09-01',
    to: '2026-09-30',
    timeZone: 'UTC',
    deals,
    textDeals: [
      { n: 2, meetingBooked: false },
      { n: 1, meetingBooked: true },
      { n: 3, meetingBooked: false },
    ],
    analystNames: new Map([[1, 'Linnea Aaltonen']]),
  })

  it('computes the rates per analyst over the deals published in the range', () => {
    expect(metrics.byAnalyst).toEqual([
      { key: '1', label: 'Linnea Aaltonen', linksSent: 3, openRate: 0.6667, avgWatchS: 75, formRate: 0.3333, meetingRate: 0.3333 },
    ])
  })

  it('computes the same five numbers over all links of the range', () => {
    expect(metrics.total).toEqual({ key: 'all', label: 'All links', linksSent: 3, openRate: 0.6667, avgWatchS: 75, formRate: 0.3333, meetingRate: 0.3333 })
  })

  it('computes the rates per country, with no watch time when nobody opened', () => {
    expect(metrics.byCountry).toEqual([
      { key: 'FI', label: 'Finland', linksSent: 2, openRate: 1, avgWatchS: 75, formRate: 0.5, meetingRate: 0.5 },
      { key: 'SE', label: 'Sweden', linksSent: 1, openRate: 0, avgWatchS: null, formRate: 0, meetingRate: 0 },
    ])
  })

  it('compares the cumulative meeting rate of both sequences without the date range', () => {
    expect(metrics.comparison.map(({ n, video, text }) => ({ n, video, text }))).toEqual([
      { n: 1, video: 1, text: 1 },
      { n: 2, video: 1, text: 0.5 },
      { n: 3, video: 0.6667, text: 0.3333 },
      { n: 4, video: 0.5, text: null },
      { n: 5, video: 0.4, text: null },
    ])
    expect(metrics).toMatchObject({ from: '2026-09-01', to: '2026-09-30', timeZone: 'UTC', videoDeals: 5, textDeals: 3 })
  })

  it('gives a 95 % Wilson band around each cumulative rate', () => {
    const tenDeals = Array.from({ length: 10 }, (_, index) =>
      deal({ publishedAt: new Date(Date.UTC(2026, 8, 1) + index * 3_600_000).toISOString(), booked: index < 5 }),
    )
    const point = metricsOf(tenDeals).comparison[9]
    expect(point).toMatchObject({ n: 10, video: 0.5, videoBand: [0.2366, 0.7634], text: null, textBand: null })
    const [low, high] = metrics.comparison[0]?.videoBand ?? [0, 0]
    expect(low).toBeGreaterThan(0)
    expect(high).toBe(1)
  })

  it('counts a deal on the calendar day of the given time zone', () => {
    const afterMidnight = [deal({ publishedAt: '2026-09-26T22:28:07.874Z' })]
    const day = (timeZone: string, date: string) =>
      computeMetrics({ from: date, to: date, timeZone, deals: afterMidnight, textDeals: [], analystNames: new Map() }).byAnalyst
    expect(day('Europe/Helsinki', '2026-09-27')).toMatchObject([{ linksSent: 1 }])
    expect(day('Europe/Helsinki', '2026-09-26')).toEqual([])
    expect(day('UTC', '2026-09-26')).toMatchObject([{ linksSent: 1 }])
  })

  it('uses the first 100 deals of each sequence', () => {
    const many = Array.from({ length: 130 }, (_, index) =>
      deal({ publishedAt: new Date(Date.UTC(2026, 0, 1) + index * 3_600_000).toISOString(), booked: index % 2 === 0 }),
    )
    const result = computeMetrics({
      from: '2026-01-01',
      to: '2026-12-31',
      timeZone: 'UTC',
      deals: many,
      textDeals: [],
      analystNames: new Map(),
    })
    expect(result.comparison).toHaveLength(100)
    expect(result.comparison.at(-1)).toMatchObject({ n: 100, video: 0.5, text: null, textBand: null })
    expect(result.byAnalyst[0]).toMatchObject({ label: 'Analyst 1', linksSent: 130 })
    expect(result.videoDeals).toBe(100)
  })

  it('counts each funnel step over the links sent in the range', () => {
    expect(metrics.funnel).toEqual({ sent: 3, opened: 2, completed: 0, formSent: 1, booked: 1 })
    const done = metricsOf([deal({ opened: true, analytics: watched({ completed: true }) })])
    expect(done.funnel).toMatchObject({ opened: 1, completed: 1 })
  })

  it('crosses the country with the channel of the first open, and adds a total row', () => {
    const result = metricsOf([
      deal({ opened: true, booked: true, analytics: watched({ firstChannel: 'email', channel: 'linkedin' }) }),
      deal({ opened: true, analytics: watched({ firstChannel: 'email' }) }),
      deal({ country: 'DE', opened: true, booked: true, analytics: watched({ firstChannel: 'linkedin' }) }),
      deal({ country: 'DE' }),
    ])
    expect(result.byChannel).toEqual([
      { key: 'FI', label: 'Finland', cells: { email: { opened: 2, meetingRate: 0.5 } } },
      { key: 'DE', label: 'Germany', cells: { linkedin: { opened: 1, meetingRate: 1 } } },
      { key: 'all', label: 'All countries', cells: { email: { opened: 2, meetingRate: 0.5 }, linkedin: { opened: 1, meetingRate: 1 } } },
    ])
    expect(metricsOf([deal({})]).byChannel).toEqual([])
  })

  it('gives the share of openers who reach each slide and the average watch time per slide', () => {
    const perSlide = (watchS: number) => SLIDES.map((slide) => ({ slide, watchS: slide <= 3 ? watchS : 0, replays: 0 }))
    const result = metricsOf([
      deal({ opened: true, analytics: watched({ stopSlide: 8, completed: true, perSlide: SLIDES.map((slide) => ({ slide, watchS: 10, replays: 0 })) }) }),
      deal({ opened: true, analytics: watched({ stopSlide: 3, perSlide: perSlide(20) }) }),
      deal({ opened: true, analytics: watched({ stopSlide: null }) }),
    ])
    expect(result.retention.opened).toBe(3)
    expect(result.retention.slides[0]).toEqual({ slide: 1, reachRate: 0.6667, avgWatchS: 10 })
    expect(result.retention.slides[3]).toEqual({ slide: 4, reachRate: 0.3333, avgWatchS: 3.3 })
    expect(metricsOf([]).retention.slides[0]).toEqual({ slide: 1, reachRate: null, avgWatchS: null })
  })

  it('gives the share of openers who used each page action', () => {
    const replayed = SLIDES.map((slide) => ({ slide, watchS: 0, replays: slide === 5 ? 1 : 0 }))
    const result = metricsOf([
      deal({ opened: true, analytics: watched({ buyerLinkTaps: 2, calculatorResults: 1 }) }),
      deal({ opened: true, analytics: watched({ forwards: 1, perSlide: replayed }) }),
      deal({ opened: true, analytics: null }),
      deal({ opened: true, analytics: watched() }),
    ])
    expect(result.actions).toEqual({
      opened: 4,
      buyerLinkTap: { deals: 1, rate: 0.25 },
      calculator: { deals: 1, rate: 0.25 },
      forward: { deals: 1, rate: 0.25 },
      replayFiguresOrBuyers: { deals: 1, rate: 0.25 },
    })
  })

  it('gives the meeting rate per interest level of the opened deals', () => {
    const result = metricsOf([
      deal({ opened: true, booked: true, interest: 'high' }),
      deal({ opened: true, interest: 'high' }),
      deal({ opened: true, interest: 'low' }),
      deal({ interest: null }),
    ])
    expect(result.byInterest).toEqual([
      { level: 'high', deals: 2, meetingRate: 0.5 },
      { level: 'medium', deals: 0, meetingRate: null },
      { level: 'low', deals: 1, meetingRate: 0 },
    ])
  })

  it('gives one row per week from the Monday of the first day, with empty weeks', () => {
    const result = computeMetrics({
      from: '2026-09-02',
      to: '2026-09-20',
      timeZone: 'UTC',
      deals: [
        deal({ publishedAt: '2026-09-02T10:00:00.000Z', opened: true, booked: true }),
        deal({ publishedAt: '2026-09-06T10:00:00.000Z' }),
        deal({ publishedAt: '2026-09-17T10:00:00.000Z', opened: true }),
      ],
      textDeals: [],
      analystNames: new Map(),
    })
    expect(result.byWeek.map(({ key, linksSent, openRate, meetingRate }) => ({ key, linksSent, openRate, meetingRate }))).toEqual([
      { key: '2026-08-31', linksSent: 2, openRate: 0.5, meetingRate: 0.5 },
      { key: '2026-09-07', linksSent: 0, openRate: null, meetingRate: null },
      { key: '2026-09-14', linksSent: 1, openRate: 1, meetingRate: 0 },
    ])
  })

  it('gives the share of links opened and booked by the hours after the link was sent', () => {
    const sent = '2026-09-01T10:00:00.000Z'
    const result = metricsOf([
      deal({ publishedAt: sent, firstOpenAt: '2026-09-01T12:00:00.000Z', bookedAt: '2026-09-03T10:00:00.000Z' }),
      deal({ publishedAt: sent, firstOpenAt: '2026-09-04T10:00:00.000Z' }),
      deal({ publishedAt: sent }),
      deal({ publishedAt: sent }),
    ])
    expect(result.timing).toHaveLength(29)
    expect(result.timing[0]).toEqual({ hours: 0, opened: 0, booked: 0 })
    expect(result.timing[1]).toEqual({ hours: 6, opened: 0.25, booked: 0 })
    expect(result.timing[8]).toEqual({ hours: 48, opened: 0.25, booked: 0.25 })
    expect(result.timing[12]).toEqual({ hours: 72, opened: 0.5, booked: 0.25 })
    expect(metricsOf([]).timing[28]).toEqual({ hours: 168, opened: null, booked: null })
  })

  it('counts the first opens per weekday and hour in the time zone of the owner country', () => {
    const grid = metricsOf([
      deal({ country: 'FI', opened: true, firstOpenAt: '2026-09-07T06:30:00.000Z' }),
      deal({ country: 'DE', opened: true, firstOpenAt: '2026-09-13T21:10:00.000Z' }),
      deal({ country: 'DE', opened: true, firstOpenAt: null }),
    ]).openHeatmap
    expect(grid).toHaveLength(7)
    expect(grid[0]?.[9]).toBe(1)
    expect(grid[6]?.[23]).toBe(1)
    expect(grid.flat().reduce((sum, n) => sum + n, 0)).toBe(2)
  })

  it('puts the watch time of each opened link in a bucket', () => {
    const result = metricsOf([
      deal({ opened: true, analytics: watched({ totalWatchS: 10 }) }),
      deal({ opened: true, analytics: watched({ totalWatchS: 30 }) }),
      deal({ opened: true, analytics: watched({ totalWatchS: 400 }) }),
      deal({ opened: true, analytics: null }),
    ])
    expect(result.watchHistogram.map((bucket) => bucket.deals)).toEqual([1, 0, 1, 0, 0, 0, 1])
    expect(result.watchHistogram.at(-1)).toEqual({ fromS: 180, toS: null, deals: 1 })
  })

  it('compares the meeting rate with and without each signal', () => {
    const result = metricsOf([
      deal({ opened: true, booked: true, signals: ['watched_to_end', 'used_calculator'] }),
      deal({ opened: true, signals: ['watched_to_end'] }),
      deal({ opened: true, signals: ['short_watch'] }),
      deal({ opened: true, signals: null }),
    ])
    const lift = Object.fromEntries(result.signalLift.map((row) => [row.key, row]))
    expect(result.signalLift).toHaveLength(10)
    expect(lift.watched_to_end).toEqual({ key: 'watched_to_end', deals: 2, withRate: 0.5, withoutRate: 0 })
    expect(lift.used_calculator).toEqual({ key: 'used_calculator', deals: 1, withRate: 1, withoutRate: 0 })
    expect(lift.came_back).toEqual({ key: 'came_back', deals: 0, withRate: null, withoutRate: 0.3333 })
  })

  it('gives the meeting rate per sale timing answer', () => {
    const result = metricsOf([
      deal({ saleTiming: 'within_12_months', booked: true }),
      deal({ saleTiming: 'within_12_months' }),
      deal({ saleTiming: 'not_interested' }),
    ])
    expect(result.saleTiming).toEqual([
      { timing: 'within_12_months', forms: 2, meetingRate: 0.5 },
      { timing: 'in_1_3_years', forms: 0, meetingRate: null },
      { timing: 'later', forms: 0, meetingRate: null },
      { timing: 'not_interested', forms: 1, meetingRate: 0 },
    ])
  })

  it('gives the meetings booked after each type of follow-up task', () => {
    const result = metricsOf([
      deal({ taskTypes: ['call'], booked: true }),
      deal({ taskTypes: ['call'] }),
      deal({ taskTypes: ['call', 'second_channel'] }),
      deal({ booked: true }),
    ])
    expect(result.followUp).toEqual([
      { type: 'call', tasks: 3, booked: 1, rate: 0.3333 },
      { type: 'second_channel', tasks: 1, booked: 0, rate: 0 },
    ])
  })

  it('reads the text sequence seed, and a missing file gives no text deals', async () => {
    const text = await readTextSequence()
    expect(text).toHaveLength(100)
    expect(text.filter((row) => row.meetingBooked).length).toBeGreaterThan(0)
    expect(await readTextSequence('/nonexistent/text-sequence.json')).toEqual([])
  })
})

describe('GET /api/metrics, /api/status and unknown routes', () => {
  let h: Harness

  beforeEach(() => {
    h = createHarness()
    insertAnalyst(h.db)
  })

  afterEach(() => h.close())

  afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

  it('reports the published deals of the date range', async () => {
    publishedDeal(h.db, {
      id: 100,
      at: new Date('2026-09-10T08:00:00.000Z'),
      patch: {
        firstOpenAt: '2026-09-11T08:00:00.000Z',
        formSentAt: '2026-09-11T08:10:00.000Z',
        bookedAt: '2026-09-11T08:20:00.000Z',
        analytics: watched({ opens: 2, sessions: 2, totalWatchS: 88.4, perSlide: [], stopSlide: 8, replays: 1, completed: true, days: 2, lastEventId: 9 }),
      },
    })
    publishedDeal(h.db, { id: 101, at: new Date('2026-09-12T08:00:00.000Z') })
    const { status, body } = await h.json<MetricsDto>('/api/metrics?from=2026-09-01&to=2026-09-30')
    expect(status).toBe(200)
    expect(body.byAnalyst).toEqual([
      { key: '10', label: 'Aino Analyst', linksSent: 2, openRate: 0.5, avgWatchS: 88.4, formRate: 0.5, meetingRate: 0.5 },
    ])
    expect(body.byCountry.map((row) => row.label)).toEqual(['Finland'])
    expect(body).toMatchObject({ videoDeals: 2, textDeals: 100 })
    expect(body.comparison).toHaveLength(100)
    expect(body.comparison[1]).toMatchObject({ n: 2, video: 0.5 })
  })

  it('filters on the days of the time zone that the page sends', async () => {
    publishedDeal(h.db, { id: 100, at: new Date('2026-09-26T22:28:07.874Z') })
    const today = await h.json<MetricsDto>('/api/metrics?from=2026-09-27&to=2026-09-27&tz=Europe/Helsinki')
    expect(today.body).toMatchObject({ timeZone: 'Europe/Helsinki', byAnalyst: [{ linksSent: 1 }] })
    expect((await h.json<MetricsDto>('/api/metrics?from=2026-09-27&to=2026-09-27')).body).toMatchObject({ timeZone: 'UTC', byAnalyst: [] })
    h.setNow(new Date('2026-09-26T22:42:00.000Z'))
    expect((await h.json<MetricsDto>('/api/metrics?tz=Europe/Helsinki')).body).toMatchObject({ from: '2026-06-30', to: '2026-09-27' })
    expect((await h.request('/api/metrics?tz=Mars/Olympus')).status).toBe(400)
    expect((await h.request('/api/metrics?tz=EET')).status).toBe(400)
  })

  it('defaults to the last 90 days and rejects bad dates', async () => {
    const { body } = await h.json<MetricsDto>('/api/metrics')
    expect(body).toMatchObject({ from: '2026-06-29', to: T0.toISOString().slice(0, 10), timeZone: 'UTC', byAnalyst: [] })
    expect((await h.request('/api/metrics?from=2026-09-31&to=2026-10-01')).status).toBe(400)
    const reversed = await h.json<ApiError>('/api/metrics?from=2026-09-30&to=2026-09-01')
    expect(reversed).toEqual({ status: 400, body: { error: 'The start date must not be after the end date' } })
  })

  it('returns fixed mock data for source=mock, through the same computation', async () => {
    const url = '/api/metrics?from=2026-06-30&to=2026-09-27&source=mock'
    const first = await h.json<MetricsDto>(url)
    expect(first.status).toBe(200)
    expect(first.body.total.linksSent).toBeGreaterThan(150)
    expect(first.body.byAnalyst.map((row) => row.label)).toEqual(['Aino Virtanen', 'Elsa Lindqvist', 'Jonas Weber', 'Mikko Laine'])
    expect(first.body.byChannel.at(-1)?.key).toBe('all')
    expect(first.body.signalLift.every((row) => row.deals > 0)).toBe(true)
    expect(first.body.funnel.booked).toBeGreaterThan(0)
    expect((await h.json<MetricsDto>(url)).body).toEqual(first.body)
    expect((await h.json<MetricsDto>('/api/metrics?from=2026-06-30&to=2026-09-27')).body.total.linksSent).toBe(0)
    expect((await h.request('/api/metrics?source=fake')).status).toBe(400)
  })

  it('returns the provider modes', async () => {
    const { body } = await h.json<ProviderStatus>('/api/status')
    expect(body).toEqual({ pipedrive: 'fake', firecrawl: 'fake', featherless: 'fake', elevenlabs: 'fake', mgxUrl: expect.any(String) })
  })

  it('returns an ApiError for an unknown API route and hides internal errors', async () => {
    expect(await h.json('/api/nothing/here')).toEqual({ status: 404, body: { error: 'The API has no such route' } })
    expect((await h.request('/api/deals/1/approve')).status).toBe(404)
    h.db.close()
    const broken = await h.json<ApiError>('/api/deals')
    expect(broken).toEqual({ status: 500, body: { error: 'The server could not complete the request. Check the server log.' } })
  })
})
