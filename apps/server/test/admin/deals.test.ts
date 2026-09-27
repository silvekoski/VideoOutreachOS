import { rmSync } from 'node:fs'
import type { ApiError, DealDetailDto, DealRowDto, MeetingBrief, ReviewDto, ReviewReason } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { sql } = await import('../../src/db/index.ts')
const { saveBrief } = await import('../../src/domain/brief-data.ts')
const { requireDeal } = await import('../../src/domain/deals.ts')
const { createTask } = await import('../../src/domain/tasks.ts')
const { createVersion, markRenderStatus } = await import('../../src/domain/timelines.ts')
const { paths } = await import('../../src/paths.ts')
const { PUBLIC_BASE_URL } = await import('./temp-storage.ts')
const { ANALYST_ID, SCRAPE_OK, T0, insertAnalyst, insertDeal, later, makeTimeline } = await import('../domain/fixtures.ts')
const { addSession, addSessionEvent, createHarness, jsonBody, publishedDeal, stoppedAt, writeStorageFile } = await import(
  './harness.ts'
)

const DAY = 24 * 60

function brief(meetingAt: string): MeetingBrief {
  return {
    version: 1,
    language: 'en',
    writtenAt: T0.toISOString(),
    header: { company: 'Acme Oy', owner: 'Matti Meikäläinen', ownerRole: 'CEO', meetingAt, timeZone: 'Europe/Helsinki', language: 'fi', interest: 'high', summary: null },
    company: { lines: [], country: 'FI', nace: '25.62', staffCount: 46 },
    figures: { revenue: null, profit: null, valuation: null },
    engagement: { opens: 1, sessions: 1, totalWatchS: 40, perSlide: [], stopSlide: 5, replays: 0, channels: [] },
    signals: [],
    form: null,
    customQuestions: [],
    buyers: [],
    questions: null,
  }
}

let h: Harness

beforeEach(() => {
  h = createHarness()
})

afterEach(() => h.close())

afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

describe('POST /api/deals/:id/ensure', () => {
  it('makes the deal row once from the fake Pipedrive', async () => {
    expect(await h.json('/api/deals/4001/ensure', { method: 'POST' })).toEqual({ status: 200, body: { id: 4001, created: true, refreshed: true, refreshError: null } })
    expect(await h.json('/api/deals/4001/ensure', { method: 'POST' })).toEqual({ status: 200, body: { id: 4001, created: false, refreshed: true, refreshError: null } })
    const deal = requireDeal(h.db, 4001)
    expect(deal).toMatchObject({ analystId: 1001, status: 'draft', country: 'FI', expiryDays: 30 })
    expect(sql<{ n: number }>(h.db, `SELECT COUNT(*) AS n FROM jobs WHERE type = 'scrape'`).get()?.n).toBe(1)
  })

  it('returns 404 for an unknown deal and 400 for a bad ID', async () => {
    const missing = await h.json<ApiError>('/api/deals/999999/ensure', { method: 'POST' })
    expect(missing).toEqual({ status: 404, body: { error: 'Pipedrive has no deal 999999' } })
    expect((await h.request('/api/deals/abc/ensure', { method: 'POST' })).status).toBe(400)
    expect((await h.request('/api/deals/0/ensure', { method: 'POST' })).status).toBe(400)
  })
})

describe('GET /api/deals', () => {
  beforeEach(() => {
    insertAnalyst(h.db)
    insertAnalyst(h.db, { id: 11, name: 'Jonas Weber' })
    insertDeal(h.db, {
      id: 100,
      patch: { status: 'review', reviewReasons: [{ code: 'lines_missing', slide: 3, detail: 'Slide 3 needs lines' }] },
    })
    publishedDeal(h.db, { id: 101, analystId: 11, patch: { analytics: { ...emptyAnalytics(), totalWatchS: 42.5 } } })
    createTask(h.db, 101, 'call', null, T0)
    publishedDeal(h.db, { id: 102, patch: { meetingAt: later(DAY).toISOString() } })
  })

  it('lists all deals with the analyst, the watch time and the next action', async () => {
    const { status, body } = await h.json<DealRowDto[]>('/api/deals')
    expect(status).toBe(200)
    const rows = Object.fromEntries(body.map((row) => [row.id, row]))
    expect(rows[100]).toMatchObject({ analystName: 'Aino Analyst', status: 'review', nextAction: 'Review the video', watchS: 0 })
    expect(rows[101]).toMatchObject({ analystId: 11, analystName: 'Jonas Weber', status: 'link_sent', watchS: 42.5, nextAction: 'Call the owner' })
    expect(rows[102]?.nextAction).toBe('Prepare the meeting')
  })

  it('asks for a review of a new rendered version of a published video', async () => {
    createVersion(h.db, 101, makeTimeline(101, { audio: 'ok' }), later(5))
    markRenderStatus(h.db, 101, 2, 'rendered', later(6))
    const { body } = await h.json<DealRowDto[]>('/api/deals')
    expect(body.find((row) => row.id === 101)).toMatchObject({ status: 'link_sent', nextAction: 'Review the new version' })
  })

  it('filters on analyst, country, status and the search text', async () => {
    const ids = async (query: string) => (await h.json<DealRowDto[]>(`/api/deals${query}`)).body.map((row) => row.id).sort()
    expect(await ids('?analyst=10')).toEqual([100, 102])
    expect(await ids('?status=link_sent')).toEqual([101, 102])
    expect(await ids('?country=fi&analyst=11')).toEqual([101])
    expect(await ids('?country=se')).toEqual([])
    expect(await ids(`?q=${encodeURIComponent('MEIKÄLÄINEN')}`)).toEqual([100, 101, 102])
    expect(await ids('?q=nothing')).toEqual([])
    expect(await ids('?q=101&analyst=')).toEqual([101])
  })

  it('rejects bad filters', async () => {
    expect((await h.request('/api/deals?status=won')).status).toBe(400)
    expect((await h.request('/api/deals?country=FIN')).status).toBe(400)
    expect((await h.request('/api/deals?analyst=x')).status).toBe(400)
  })
})

describe('GET /api/deals/:id', () => {
  it('builds the deal page data of a published deal', async () => {
    insertAnalyst(h.db)
    const deal = publishedDeal(h.db, { patch: { meetingAt: later(120).toISOString() } })
    addSession(h.db, deal.id, { id: 's-old', startedAt: later(10), channel: 'email', analytics: stoppedAt(3) })
    addSession(h.db, deal.id, { id: 's-new', startedAt: later(30), analytics: stoppedAt(5) })
    addSessionEvent(h.db, deal.id, 's-new', { seq: 0, type: 'open', at: later(30) })
    addSessionEvent(h.db, deal.id, 's-new', { seq: 1, type: 'scroll', at: later(31) })
    createTask(h.db, deal.id, 'call', null, later(20))
    createTask(h.db, deal.id, 'second_channel', 'email', later(40))
    saveBrief(h.db, deal.id, brief(later(120).toISOString()), 1, later(50))

    const { status, body } = await h.json<DealDetailDto>('/api/deals/100')
    expect(status).toBe(200)
    const link = `${PUBLIC_BASE_URL}/v/${deal.linkCode}`
    expect(body).toMatchObject({
      id: 100,
      status: 'link_sent',
      company: 'Acme Oy',
      ownerName: 'Matti Meikäläinen',
      analyst: { id: ANALYST_ID, name: 'Aino Analyst', timeZone: 'Europe/Helsinki' },
      pipedriveUrl: 'https://fake-pipedrive.invalid/deal/100',
      link,
      links: { email: `${link}?c=email`, linkedin: `${link}?c=linkedin`, sms: `${link}?c=sms`, whatsapp: `${link}?c=whatsapp` },
      previewUrl: `${link}?preview=1`,
      expired: false,
      publishedVersion: 1,
      pendingVersion: null,
      download720: null,
      openTasks: [
        { type: 'call', channel: null, status: 'open', ownerPhone: '+358 40 123 4567', ownerEmail: 'matti@acme.test' },
        { type: 'second_channel', channel: 'email', status: 'open', ownerPhone: '+358 40 123 4567', ownerEmail: 'matti@acme.test' },
      ],
      brief: { version: 1, header: { interest: 'high' } },
      failedJobs: [],
      pipeline: { running: false, step: null },
    })
    expect(body.sessions.map((session) => session.id)).toEqual(['s-new', 's-old'])
    expect(body.events.map((event) => event.type)).toEqual(['link_sent', 'open', 'task_created', 'task_created', 'brief_written'])
    expect(body.slideNames[5]).toBe('Buyers from Mergero deals')

    writeStorageFile('deals/100/video-720.v1.mp4', 'video')
    expect((await h.json<DealDetailDto>('/api/deals/100')).body.download720).toBe('/api/deals/100/files/video-720.v1.mp4?download=1')
  })

  it('gives the time zone of the deal analyst and the new version that waits for review', async () => {
    insertAnalyst(h.db)
    sql(h.db, `UPDATE analysts SET time_zone = 'Europe/Berlin' WHERE id = ?`).run(ANALYST_ID)
    publishedDeal(h.db)
    createVersion(h.db, 100, makeTimeline(100, { audio: 'ok' }), later(5))
    markRenderStatus(h.db, 100, 2, 'rendered', later(6))
    expect((await h.json<DealDetailDto>('/api/deals/100')).body).toMatchObject({
      analyst: { id: ANALYST_ID, timeZone: 'Europe/Berlin' },
      publishedVersion: 1,
      pendingVersion: 2,
    })
  })

  it('has no links before publication and returns 404 for an unknown deal', async () => {
    insertAnalyst(h.db)
    insertDeal(h.db)
    const { body } = await h.json<DealDetailDto>('/api/deals/100')
    expect(body).toMatchObject({ link: null, links: null, previewUrl: null, download720: null, expiresAt: null, pipeline: { running: false } })
    expect((await h.json<ApiError>('/api/deals/555')).status).toBe(404)
  })
})

describe('review and approval', () => {
  beforeEach(() => {
    insertAnalyst(h.db)
    insertDeal(h.db, {
      patch: {
        scrape: SCRAPE_OK,
        mgx: {
          buyers: [{ id: 'b1', name: 'Nordic Industrial Partners', logoUrl: 'http://localhost:3100/logos/b1.svg', website: null, focus: 'x', namePublic: true }],
          featuredBuyers: [],
          sectorDeals: [],
          recentDeals: [],
          multiples: [],
          fetchedAt: T0.toISOString(),
        },
      },
    })
  })

  it('returns 404 while the video has no timeline', async () => {
    const { status, body } = await h.json<ApiError>('/api/deals/100/review')
    expect(status).toBe(404)
    expect(body.error).toMatch(/no script yet/u)
  })

  it('builds the review data of the newest version', async () => {
    createVersion(h.db, 100, makeTimeline(100, { audio: 'ok' }), T0)
    writeStorageFile('deals/100/video-1080.v1.mp4', 'old render')
    const { status, body } = await h.json<ReviewDto>('/api/deals/100/review')
    expect(status).toBe(200)
    expect(body).toMatchObject({
      dealId: 100,
      version: 1,
      publishedVersion: null,
      renderStatus: 'pending',
      approved: false,
      video: null,
      scrapeOk: true,
      lines: ['Acme makes steel parts.', 'It has 46 staff.', 'It sells to ship yards.'],
      linesSource: 'model',
      financials: { mode: 'ask' },
      screenshotUrl: `/api/deals/100/files/screenshot.png?v=${encodeURIComponent(T0.toISOString())}`,
    })
    expect(body.slides[0]).toEqual({ slide: 1, name: 'Face-cam intro', script: null, audioStatus: null, audioError: null, audioUrl: null, newAudio: false })
    expect(body.slides[1]).toMatchObject({ slide: 2, script: 'Script of slide 2.', audioStatus: 'ok', audioUrl: '/api/deals/100/files/audio/slide-2.v1.mp3', newAudio: false })
    expect(body.buyers.map((buyer) => [buyer.id, buyer.logoUrl, buyer.removed])).toEqual([
      ['b1', 'http://localhost:3100/logos/b1.svg', false],
      ['b2', null, false],
      ['b3', null, false],
    ])
  })

  it('reports the published version next to a newer working version', async () => {
    publishedDeal(h.db, { id: 102 })
    createVersion(h.db, 102, makeTimeline(102, { audio: 'ok' }), later(5))
    const { body } = await h.json<ReviewDto>('/api/deals/102/review')
    expect(body).toMatchObject({ status: 'link_sent', version: 2, publishedVersion: 1, expired: false })
    h.setNow(later(31 * DAY))
    expect((await h.json<ReviewDto>('/api/deals/102/review')).body.expired).toBe(true)
  })

  it('applies a review patch and marks new audio', async () => {
    createVersion(h.db, 100, makeTimeline(100, { audio: 'ok' }), T0)
    const { status, body } = await h.json<ReviewDto>(
      '/api/deals/100/review',
      jsonBody('PATCH', { scripts: { 2: 'A new script for slide two.' }, removedBuyers: ['b2'], customQuestions: [{ id: 'q1', text: ' Why now? ' }] }),
    )
    expect(status).toBe(200)
    expect(body.slides[1]).toMatchObject({ script: 'A new script for slide two.', audioStatus: 'new', newAudio: true })
    expect(body.buyers.find((buyer) => buyer.id === 'b2')?.removed).toBe(true)
    expect(body.customQuestions).toEqual([{ id: 'q1', text: 'Why now?' }])
    expect(body.pipeline).toEqual({ running: true, step: 'write-script' })

    const face = await h.json<ApiError>('/api/deals/100/review', jsonBody('PATCH', { scripts: { 1: 'x' } }))
    expect(face.status).toBe(400)
    expect((await h.request('/api/deals/100/review', jsonBody('PATCH', { expiryDays: 0 }))).status).toBe(400)
    const large = await h.request('/api/deals/100/review', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'content-length': String(2 * 1024 * 1024) },
      body: '{}',
    })
    expect(large.status).toBe(413)
    const form = new FormData()
    form.append('scripts', 'x')
    expect(await h.json('/api/deals/100/review', { method: 'PATCH', body: form })).toEqual({
      status: 400,
      body: { error: 'The request body must be JSON' },
    })
  })

  it('returns 409 with the reasons when a blocking reason remains', async () => {
    createVersion(h.db, 100, makeTimeline(100, { audio: 'ok', lines: [], linesSource: null }), T0)
    const { status, body } = await h.json<ApiError>('/api/deals/100/approve', { method: 'POST' })
    expect(status).toBe(409)
    expect((body.detail as ReviewReason[]).map((reason) => reason.code)).toEqual(['lines_missing'])
  })

  it('approves the version and queues the render', async () => {
    createVersion(h.db, 100, makeTimeline(100, { audio: 'ok' }), T0)
    const { status, body } = await h.json<ReviewDto>('/api/deals/100/approve', { method: 'POST' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ approved: true, renderStatus: 'rendering', pipeline: { running: true, step: 'render' } })
  })
})

describe('POST /api/deals/:id/expiry', () => {
  it('sets the days before publication and moves expires_at after it', async () => {
    insertAnalyst(h.db)
    insertDeal(h.db, { id: 100 })
    publishedDeal(h.db, { id: 101 })
    const draft = await h.json<DealDetailDto>('/api/deals/100/expiry', jsonBody('POST', { days: 7 }))
    expect(draft.body).toMatchObject({ expiryDays: 7, expiresAt: null })
    h.setNow(later(60))
    const published = await h.json<DealDetailDto>('/api/deals/101/expiry', jsonBody('POST', { days: 10 }))
    expect(published.body).toMatchObject({ expiryDays: 10, expiresAt: new Date(later(60).getTime() + 10 * 86_400_000).toISOString() })
  })

  it('rejects days outside 1 to 365 and an expired link', async () => {
    insertAnalyst(h.db)
    publishedDeal(h.db)
    expect((await h.request('/api/deals/100/expiry', jsonBody('POST', { days: 0 }))).status).toBe(400)
    expect((await h.request('/api/deals/100/expiry', jsonBody('POST', { days: 366 }))).status).toBe(400)
    expect((await h.request('/api/deals/100/expiry', jsonBody('POST', { days: 2.5 }))).status).toBe(400)
    h.setNow(later(31 * DAY))
    expect(await h.json('/api/deals/100/expiry', jsonBody('POST', { days: 5 }))).toEqual({ status: 409, body: { error: 'The link has expired' } })
  })
})

describe('POST /api/deals/:id/brief/read', () => {
  it('writes one brief_read event per brief version in 10 minutes', async () => {
    insertAnalyst(h.db)
    publishedDeal(h.db, { patch: { meetingAt: later(120).toISOString() } })
    expect((await h.request('/api/deals/100/brief/read', { method: 'POST' })).status).toBe(404)
    saveBrief(h.db, 100, brief(later(120).toISOString()), 1, T0)
    const reads = () => sql<{ n: number }>(h.db, `SELECT COUNT(*) AS n FROM events WHERE type = 'brief_read'`).get()?.n
    expect((await h.request('/api/deals/100/brief/read', { method: 'POST' })).status).toBe(204)
    expect((await h.request('/api/deals/100/brief/read', { method: 'POST' })).status).toBe(204)
    expect(reads()).toBe(1)
    h.setNow(later(11))
    expect((await h.request('/api/deals/100/brief/read', { method: 'POST' })).status).toBe(204)
    expect(reads()).toBe(2)
  })
})

function emptyAnalytics() {
  return { opens: 0, sessions: 0, totalWatchS: 0, perSlide: [], stopSlide: null, replays: 0, completed: false, days: 0, lastEventId: null, channel: null }
}
