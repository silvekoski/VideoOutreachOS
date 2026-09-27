import type { ClientEvent, EventBatch } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { requireDeal } from '../../src/domain/deals.ts'
import { listEvents, listSessions } from '../../src/domain/events.ts'
import { publish } from '../../src/domain/pipeline.ts'
import { jobsForDeal } from '../../src/queue/index.ts'
import { DEAL_ID, T0, later } from '../domain/fixtures.ts'
import { addRenderedVersion, createHarness, draftDeal, json, publishedDeal } from './harness.ts'
import type { Harness } from './harness.ts'

const SESSION = '4b0c2a4e-8f9e-4f7e-9c1a-6d0e5f3b2a10'
const SECOND_SESSION = '9d3f6a1b-2c4e-4a8b-8f0d-1e2a3b4c5d6e'

let h: Harness
let code: string

beforeEach(() => {
  h = createHarness()
  code = publishedDeal(h).linkCode
})

afterEach(() => {
  h.close()
})

function event(seq: number, type: ClientEvent['type'], vt: number | null, slide: ClientEvent['slide'] = null): ClientEvent {
  return { seq, type, at: T0.toISOString(), slide, vt }
}

function batch(events: ClientEvent[], sessionId = SESSION, version = 1): EventBatch {
  return {
    sessionId,
    session: { channel: 'whatsapp', device: 'mobile', browser: 'Safari', os: 'iOS', screen: '390x844', version },
    events,
  }
}

const V2_TIMES = [
  { slide: 1, startS: 0, endS: 20 },
  { slide: 2, startS: 20, endS: 50 },
  { slide: 3, startS: 50, endS: 60 },
  { slide: 4, startS: 60, endS: 70 },
  { slide: 5, startS: 70, endS: 80 },
  { slide: 6, startS: 80, endS: 90 },
  { slide: 7, startS: 90, endS: 100 },
  { slide: 8, startS: 100, endS: 110 },
] as const

function republish(): void {
  publish(h.db, DEAL_ID, addRenderedVersion(h, DEAL_ID, {}, V2_TIMES), h.clock.now)
}

const FIRST_EVENTS = [
  event(0, 'open', null),
  event(1, 'play', 0, 1),
  event(2, 'slide_start', 0, 1),
  event(3, 'slide_start', 31.2, 2),
  event(4, 'pause', 40, 2),
]

function beacon(body: EventBatch, query = ''): Promise<Response> {
  return h.request(`/v/${code}/events${query}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body),
  })
}

function count(table: 'events' | 'sessions'): number {
  return sql<{ n: number }>(h.db, `SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0
}

function writeJobs(op: string): string[] {
  return jobsForDeal(h.db, DEAL_ID, ['pipedrive-write'])
    .filter((job) => job.type === 'pipedrive-write' && job.payload.op === op)
    .map((job) => job.key)
}

describe('POST /v/:code/events', () => {
  it('stores a sendBeacon batch, moves the stage once and recomputes the analytics', async () => {
    const res = await beacon(batch(FIRST_EVENTS))
    expect(res.status).toBe(204)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')

    const [session] = listSessions(h.db, DEAL_ID)
    expect(session).toMatchObject({ id: SESSION, version: 1, channel: 'whatsapp', device: 'mobile', localDay: '2026-09-26', startedAt: T0.toISOString() })
    expect(session?.analytics).toMatchObject({ watchS: 40, stopSlide: 2, played: true, completed: false })
    const events = listEvents(h.db, DEAL_ID, { types: ['open', 'play', 'slide_start', 'pause'] })
    expect(events.map((item) => [item.seq, item.type, item.slide, item.videoTime, item.channel])).toEqual([
      [0, 'open', null, null, 'whatsapp'],
      [1, 'play', 1, 0, 'whatsapp'],
      [2, 'slide_start', 1, 0, 'whatsapp'],
      [3, 'slide_start', 2, 31.2, 'whatsapp'],
      [4, 'pause', 2, 40, 'whatsapp'],
    ])

    const deal = requireDeal(h.db, DEAL_ID)
    expect(deal.status).toBe('opened')
    expect(deal.firstOpenAt).toBe(T0.toISOString())
    expect(deal.analytics).toMatchObject({ opens: 1, sessions: 1, totalWatchS: 40, stopSlide: 2, days: 1 })
    expect(deal.analytics?.perSlide.slice(0, 3)).toEqual([
      { slide: 1, watchS: 31.2, replays: 0 },
      { slide: 2, watchS: 8.8, replays: 0 },
      { slide: 3, watchS: 0, replays: 0 },
    ])
    expect(writeJobs('stage')).toEqual([`pipedrive-write:${DEAL_ID}:stage:link_sent`, `pipedrive-write:${DEAL_ID}:stage:opened`])
    const analyticsJobs = jobsForDeal(h.db, DEAL_ID, ['pipedrive-write']).filter(
      (job) => job.type === 'pipedrive-write' && job.payload.op === 'analytics',
    )
    expect(analyticsJobs).toHaveLength(1)
    expect(analyticsJobs[0]?.runAt).toBe(later(1).toISOString())
  })

  it('ignores sequence numbers it already has and does not move the stage twice', async () => {
    await beacon(batch(FIRST_EVENTS))
    h.clock.now = later(0.5)
    expect((await beacon(batch(FIRST_EVENTS))).status).toBe(204)
    expect(count('events')).toBe(FIRST_EVENTS.length + 1)
    h.clock.now = later(2)
    await beacon(batch([event(4, 'pause', 40, 2), event(5, 'play', 40, 2), event(6, 'pause', 50, 2)]))
    expect(count('events')).toBe(FIRST_EVENTS.length + 3)
    expect(requireDeal(h.db, DEAL_ID).analytics?.totalWatchS).toBe(50)

    h.clock.now = later(60 * 24)
    await beacon(batch([event(0, 'open', null), event(1, 'play', 105.6, 8), event(2, 'complete', 118, 8)], SECOND_SESSION))
    const deal = requireDeal(h.db, DEAL_ID)
    expect(deal.firstOpenAt).toBe(T0.toISOString())
    expect(deal.analytics).toMatchObject({ opens: 2, sessions: 2, completed: true, stopSlide: 8, days: 2 })
    expect(writeJobs('stage')).toHaveLength(2)
    expect(listSessions(h.db, DEAL_ID).map((session) => session.localDay)).toEqual(['2026-09-26', '2026-09-27'])
  })

  it('adds one analytics job while one is queued', async () => {
    await beacon(batch(FIRST_EVENTS))
    h.clock.now = later(0.5)
    await beacon(batch([event(5, 'play', 40, 2)]))
    expect(writeJobs('analytics')).toHaveLength(1)
  })

  it('uses the local day of the deal country', async () => {
    h.clock.now = new Date('2026-09-26T22:30:00.000Z')
    await beacon(batch(FIRST_EVENTS))
    expect(listSessions(h.db, DEAL_ID)[0]?.localDay).toBe('2026-09-27')
  })

  it('accepts application/json and makes no session for an empty batch', async () => {
    expect((await h.request(`/v/${code}/events`, json(batch([])))).status).toBe(204)
    expect(count('sessions')).toBe(0)
    const res = await h.request(`/v/${code}/events`, json(batch(FIRST_EVENTS)))
    expect(res.status).toBe(204)
    expect(count('sessions')).toBe(1)
  })

  it('stores nothing for preview batches (204), expired links (410) and unpublished deals (404)', async () => {
    expect((await beacon(batch(FIRST_EVENTS), '?preview=1')).status).toBe(204)
    h.clock.now = new Date(requireDeal(h.db, DEAL_ID).expiresAt ?? T0)
    const expired = await beacon(batch(FIRST_EVENTS))
    expect(expired.status).toBe(410)
    expect(await expired.json()).toEqual({ error: 'The link has expired' })
    expect((await beacon(batch(FIRST_EVENTS), '?preview=1')).status).toBe(204)
    h.clock.now = T0
    const draft = draftDeal(h, { id: 101 })
    addRenderedVersion(h, 101)
    const res = await h.request(`/v/${draft.linkCode}/events`, json(batch(FIRST_EVENTS)))
    expect(res.status).toBe(404)
    expect(count('sessions')).toBe(0)
    expect(listEvents(h.db, DEAL_ID).filter((item) => item.sessionId !== null)).toHaveLength(0)
    expect(requireDeal(h.db, DEAL_ID).status).toBe('link_sent')
  })

  it('rejects bad bodies, a session of another link and unknown codes', async () => {
    const badJson = await h.request(`/v/${code}/events`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"sessionId":' })
    expect(badJson.status).toBe(400)
    expect(await badJson.json()).toEqual({ error: 'The request body is not valid JSON' })

    const invalid = await beacon({ ...batch(FIRST_EVENTS), sessionId: 'not-a-uuid' })
    expect(invalid.status).toBe(400)
    expect(((await invalid.json()) as { detail: { path: string }[] }).detail[0]?.path).toBe('sessionId')

    const other = publishedDeal(h, { id: 101 })
    await beacon(batch(FIRST_EVENTS))
    const stolen = await h.request(`/v/${other.linkCode}/events`, json(batch([event(9, 'play', 0, 1)])))
    expect(stolen.status).toBe(400)
    expect(count('events')).toBe(FIRST_EVENTS.length + 2)

    expect((await h.request('/v/AAAAAAAAAAAAAAAAAAAAAA/events', json(batch(FIRST_EVENTS)))).status).toBe(404)
  })

  it('computes each session with the slide times of its own video version after a republish', async () => {
    const watch = [event(0, 'open', null), event(1, 'play', 0, 1), event(2, 'pause', 40, 2)]
    await beacon(batch(watch))
    h.clock.now = later(10)
    republish()
    expect(requireDeal(h.db, DEAL_ID).publishedVersion).toBe(2)
    await beacon(batch(watch, SECOND_SESSION, 2))

    const sessions = listSessions(h.db, DEAL_ID)
    expect(sessions.map((item) => [item.id, item.version])).toEqual([
      [SESSION, 1],
      [SECOND_SESSION, 2],
    ])
    expect(sessions[0]?.analytics?.perSlide.slice(0, 2)).toEqual([
      { slide: 1, watchS: 31.2, replays: 0 },
      { slide: 2, watchS: 8.8, replays: 0 },
    ])
    expect(sessions[1]?.analytics?.perSlide.slice(0, 2)).toEqual([
      { slide: 1, watchS: 20, replays: 0 },
      { slide: 2, watchS: 20, replays: 0 },
    ])
    expect(requireDeal(h.db, DEAL_ID).analytics?.perSlide.slice(0, 2)).toEqual([
      { slide: 1, watchS: 51.2, replays: 0 },
      { slide: 2, watchS: 28.8, replays: 0 },
    ])

    h.clock.now = later(11)
    await beacon(batch([event(3, 'play', 40, 2), event(4, 'pause', 50, 3)]))
    expect(listSessions(h.db, DEAL_ID)[0]?.analytics).toMatchObject({ watchS: 50, stopSlide: 3 })
    expect(requireDeal(h.db, DEAL_ID).analytics?.perSlide.slice(0, 3)).toEqual([
      { slide: 1, watchS: 51.2, replays: 0 },
      { slide: 2, watchS: 32.4, replays: 0 },
      { slide: 3, watchS: 6.4, replays: 0 },
    ])
  })

  it('rejects a video version that was never published and a session that changes its version', async () => {
    addRenderedVersion(h, DEAL_ID, {}, V2_TIMES)
    const unpublished = await beacon(batch(FIRST_EVENTS, SESSION, 2))
    expect(unpublished.status).toBe(400)
    expect(await unpublished.json()).toEqual({ error: 'Video version 2 was never published' })
    expect((await beacon(batch(FIRST_EVENTS, SESSION, 7))).status).toBe(400)
    expect(count('sessions')).toBe(0)

    await beacon(batch(FIRST_EVENTS))
    publish(h.db, DEAL_ID, 2, h.clock.now)
    const moved = await beacon(batch([event(5, 'play', 40, 2)], SESSION, 2))
    expect(moved.status).toBe(400)
    expect(await moved.json()).toEqual({ error: 'The session belongs to another video version' })
    expect(count('events')).toBe(FIRST_EVENTS.length + 1)
  })

  it('rejects a body above the size limit', async () => {
    const res = await h.request(`/v/${code}/events`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x'.repeat(300 * 1024),
    })
    expect(res.status).toBe(413)
    expect(count('sessions')).toBe(0)
  })
})
