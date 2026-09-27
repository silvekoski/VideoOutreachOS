import { rmSync } from 'node:fs'
import type { ApiError, MetricsDto, ProviderStatus } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'
import type { MetricsDeal } from '../../src/views/metrics.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { paths } = await import('../../src/paths.ts')
const { computeMetrics, readTextSequence } = await import('../../src/views/metrics.ts')
const { T0, insertAnalyst } = await import('../domain/fixtures.ts')
const { createHarness, publishedDeal } = await import('./harness.ts')

function deal(overrides: Partial<MetricsDeal>): MetricsDeal {
  return {
    analystId: 1,
    country: 'FI',
    publishedAt: '2026-09-01T10:00:00.000Z',
    opened: false,
    formSent: false,
    booked: false,
    watchS: 0,
    ...overrides,
  }
}

describe('computeMetrics', () => {
  const deals = [
    deal({ publishedAt: '2026-09-01T10:00:00.000Z', opened: true, formSent: true, booked: true, watchS: 100 }),
    deal({ publishedAt: '2026-09-02T10:00:00.000Z', opened: true, watchS: 50 }),
    deal({ publishedAt: '2026-09-30T23:59:00.000Z', country: 'SE' }),
    deal({ publishedAt: '2026-08-01T10:00:00.000Z', analystId: 2, country: 'DE', opened: true, booked: true, watchS: 999 }),
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

  it('computes the rates per country, with no watch time when nobody opened', () => {
    expect(metrics.byCountry).toEqual([
      { key: 'FI', label: 'Finland', linksSent: 2, openRate: 1, avgWatchS: 75, formRate: 0.5, meetingRate: 0.5 },
      { key: 'SE', label: 'Sweden', linksSent: 1, openRate: 0, avgWatchS: null, formRate: 0, meetingRate: 0 },
    ])
  })

  it('compares the cumulative meeting rate of both sequences without the date range', () => {
    expect(metrics.comparison).toEqual([
      { n: 1, video: 1, text: 1 },
      { n: 2, video: 1, text: 0.5 },
      { n: 3, video: 0.6667, text: 0.3333 },
      { n: 4, video: 0.5, text: null },
      { n: 5, video: 0.4, text: null },
    ])
    expect(metrics).toMatchObject({ from: '2026-09-01', to: '2026-09-30', timeZone: 'UTC', videoDeals: 5, textDeals: 3 })
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
    expect(result.comparison.at(-1)).toEqual({ n: 100, video: 0.5, text: null })
    expect(result.byAnalyst[0]).toMatchObject({ label: 'Analyst 1', linksSent: 130 })
    expect(result.videoDeals).toBe(100)
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
        analytics: { opens: 2, sessions: 2, totalWatchS: 88.4, perSlide: [], stopSlide: 8, replays: 1, completed: true, days: 2, lastEventId: 9, channel: 'email' },
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
