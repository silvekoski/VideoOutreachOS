import type { FormSubmitBody, SlotDto } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { requireAnalyst, updateAnalyst } from '../../src/domain/analysts.ts'
import { requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { listEvents } from '../../src/domain/events.ts'
import { createTask, getTask } from '../../src/domain/tasks.ts'
import { jobsForDeal } from '../../src/queue/index.ts'
import { slotGrid } from '../../src/video/booking.ts'
import { inboxDto } from '../../src/views/inbox.ts'
import { ANALYST_ID, DEAL_ID, T0 } from '../domain/fixtures.ts'
import { createHarness, draftDeal, json, publishedDeal } from './harness.ts'
import type { Harness } from './harness.ts'

let h: Harness

beforeEach(() => {
  h = createHarness()
})

afterEach(() => {
  h.close()
})

async function slots(code: string): Promise<SlotDto[]> {
  const res = await h.request(`/v/${code}/slots`, { headers: { accept: 'application/json' } })
  expect(res.status).toBe(200)
  return (await res.json()) as SlotDto[]
}

function book(code: string, start: string, email: string | null = 'matti@acme.test', query = ''): Promise<Response> {
  return h.request(`/v/${code}/book${query}`, json({ start, email }, { accept: 'application/json' }))
}

const NOT_INTERESTED: FormSubmitBody = {
  revenue: null,
  profit: null,
  staff: null,
  timing: 'not_interested',
  notInterestedReason: 'We keep the company in the family',
  custom: [],
  message: '',
}

async function sendNotInterested(code: string): Promise<void> {
  const res = await h.request(`/v/${code}/form`, json(NOT_INTERESTED, { accept: 'application/json' }))
  expect(res.status).toBe(200)
}

function meetingToday(now: Date): (number | null)[] {
  const group = inboxDto(h.db, requireAnalyst(h.db, ANALYST_ID), now).groups.find((item) => item.key === 'meeting_today')
  return group?.rows.map((row) => row.dealId) ?? []
}

function localParts(iso: string, timeZone: string): { weekday: string; time: string } {
  const format = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const parts = Object.fromEntries(format.formatToParts(new Date(iso)).map((part) => [part.type, part.value]))
  return { weekday: parts.weekday ?? '', time: `${parts.hour}:${parts.minute}` }
}

describe('slotGrid', () => {
  it('gives 30 minute slots from 09:00 to 16:00 on weekdays of the next 14 days', () => {
    const grid = slotGrid('Europe/Helsinki', T0)
    expect(grid).toHaveLength(10 * 14)
    expect(grid[0]).toEqual({ start: '2026-09-28T06:00:00.000Z', end: '2026-09-28T06:30:00.000Z' })
    expect(grid.at(-1)).toEqual({ start: '2026-10-09T12:30:00.000Z', end: '2026-10-09T13:00:00.000Z' })
    for (const slot of grid) {
      const { weekday, time } = localParts(slot.start, 'Europe/Helsinki')
      expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(weekday)
      expect(time >= '09:00' && time <= '15:30').toBe(true)
    }
  })

  it('uses the time zone of the analyst across a change of daylight saving time', () => {
    expect(slotGrid('Europe/Berlin', T0)[0]?.start).toBe('2026-09-28T07:00:00.000Z')
    const grid = slotGrid('Europe/Helsinki', new Date('2026-10-20T12:00:00.000Z')).map((slot) => slot.start)
    expect(grid[0]).toBe('2026-10-21T06:00:00.000Z')
    expect(grid).toContain('2026-10-23T06:00:00.000Z')
    expect(grid).toContain('2026-10-26T07:00:00.000Z')
    expect(grid).not.toContain('2026-10-26T06:00:00.000Z')
  })

  it('starts on the next local day, not the next UTC day', () => {
    const grid = slotGrid('Europe/Helsinki', new Date('2026-09-27T22:30:00.000Z'))
    expect(grid[0]?.start).toBe('2026-09-29T06:00:00.000Z')
  })
})

describe('GET /v/:code/slots', () => {
  it('leaves out the booked meetings of the analyst', async () => {
    const deal = publishedDeal(h)
    const other = publishedDeal(h, { id: 101 })
    updateDeal(h.db, other.id, { meetingAt: '2026-09-28T06:15:00.000Z' })
    const free = (await slots(deal.linkCode)).map((slot) => slot.start)
    expect(free).toHaveLength(140 - 2)
    expect(free).not.toContain('2026-09-28T06:00:00.000Z')
    expect(free).not.toContain('2026-09-28T06:30:00.000Z')
    expect(free[0]).toBe('2026-09-28T07:00:00.000Z')
  })

  it('uses the analyst time zone', async () => {
    updateAnalyst(h.db, ANALYST_ID, { timeZone: 'Europe/Zurich' })
    const deal = publishedDeal(h)
    expect((await slots(deal.linkCode))[0]?.start).toBe('2026-09-28T07:00:00.000Z')
  })

  it('returns no slots when the deal has a meeting, and works for a preview of an unpublished deal', async () => {
    const deal = publishedDeal(h)
    updateDeal(h.db, deal.id, { meetingAt: '2026-09-29T06:00:00.000Z' })
    expect(await slots(deal.linkCode)).toEqual([])
    const draft = draftDeal(h, { id: 101 })
    expect(await slots(draft.linkCode)).toHaveLength(139)
  })

  it('returns 410 after expiry', async () => {
    const deal = publishedDeal(h)
    h.clock.now = new Date(requireDeal(h.db, deal.id).expiresAt ?? T0)
    const res = await h.request(`/v/${deal.linkCode}/slots`, { headers: { accept: 'application/json' } })
    expect(res.status).toBe(410)
  })
})

describe('POST /v/:code/book', () => {
  it('books a free slot, moves the stage, closes tasks and adds the write-brief job', async () => {
    const deal = publishedDeal(h)
    const task = createTask(h.db, DEAL_ID, 'call', null, T0)
    const res = await book(deal.linkCode, '2026-09-28T09:30:00+03:00')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, meetingAt: '2026-09-28T06:30:00.000Z' })

    expect(requireDeal(h.db, DEAL_ID)).toMatchObject({
      status: 'meeting_booked',
      meetingAt: '2026-09-28T06:30:00.000Z',
      meetingEmail: 'matti@acme.test',
      bookedAt: T0.toISOString(),
      expiresAt: deal.expiresAt,
    })
    const [booked] = listEvents(h.db, DEAL_ID, { types: ['meeting_booked'] })
    expect(booked?.data).toEqual({ meetingAt: '2026-09-28T06:30:00.000Z' })
    expect(getTask(h.db, task?.id ?? 0)?.status).toBe('done')
    const briefJobs = jobsForDeal(h.db, DEAL_ID, ['write-brief'])
    expect(briefJobs.map((job) => [job.key, job.payload])).toEqual([
      [`brief:${DEAL_ID}:${booked?.id}`, { dealId: DEAL_ID, lastEventId: booked?.id }],
    ])
    expect(jobsForDeal(h.db, DEAL_ID, ['pipedrive-write']).map((job) => job.key)).toContain(
      `pipedrive-write:${DEAL_ID}:stage:meeting_booked`,
    )
  })

  it('returns 409 when the deal already has a meeting or the slot is taken', async () => {
    const deal = publishedDeal(h)
    const other = publishedDeal(h, { id: 101 })
    expect((await book(other.linkCode, '2026-09-28T06:00:00.000Z', null)).status).toBe(200)
    const taken = await book(deal.linkCode, '2026-09-28T06:00:00.000Z')
    expect(taken.status).toBe(409)
    expect(await taken.json()).toEqual({ error: 'This time is not free' })
    expect((await book(deal.linkCode, '2026-09-28T06:10:00.000Z')).status).toBe(409)
    expect((await book(deal.linkCode, '2026-09-26T13:00:00.000Z')).status).toBe(409)
    expect((await book(deal.linkCode, '2026-09-28T06:30:00.000Z')).status).toBe(200)
    const again = await book(deal.linkCode, '2026-09-28T07:00:00.000Z')
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: 'A meeting is already booked', detail: { meetingAt: '2026-09-28T06:30:00.000Z' } })
    expect(requireDeal(h.db, DEAL_ID).meetingAt).toBe('2026-09-28T06:30:00.000Z')
    expect(jobsForDeal(h.db, DEAL_ID, ['write-brief'])).toHaveLength(1)
  })

  it('keeps a lost deal lost, sends the Meeting booked stage to Pipedrive and shows the meeting in the Inbox', async () => {
    const deal = publishedDeal(h)
    await sendNotInterested(deal.linkCode)
    expect(requireDeal(h.db, DEAL_ID).status).toBe('lost')
    expect((await book(deal.linkCode, '2026-09-28T06:00:00.000Z')).status).toBe(200)
    expect(requireDeal(h.db, DEAL_ID)).toMatchObject({ status: 'lost', meetingAt: '2026-09-28T06:00:00.000Z' })
    expect(jobsForDeal(h.db, DEAL_ID, ['pipedrive-write']).map((job) => job.key)).toContain(
      `pipedrive-write:${DEAL_ID}:stage:meeting_booked`,
    )
    expect(jobsForDeal(h.db, DEAL_ID, ['write-brief'])).toHaveLength(1)
    expect(meetingToday(new Date('2026-09-28T03:00:00.000Z'))).toEqual([DEAL_ID])
    expect(meetingToday(new Date('2026-09-28T06:29:00.000Z'))).toEqual([DEAL_ID])
    expect(meetingToday(new Date('2026-09-28T06:30:00.000Z'))).toEqual([])
  })

  it('keeps the meeting in the Inbox when the owner sends not interested after the booking', async () => {
    const deal = publishedDeal(h)
    expect((await book(deal.linkCode, '2026-09-28T06:00:00.000Z')).status).toBe(200)
    await sendNotInterested(deal.linkCode)
    expect(requireDeal(h.db, DEAL_ID)).toMatchObject({ status: 'lost', meetingAt: '2026-09-28T06:00:00.000Z' })
    expect(meetingToday(new Date('2026-09-28T03:00:00.000Z'))).toEqual([DEAL_ID])
  })

  it('keeps the link until 24 hours after the meeting end when the meeting is after the expiry', async () => {
    const deal = publishedDeal(h, { patch: { expiryDays: 3 } })
    expect(deal.expiresAt).toBe('2026-09-29T12:00:00.000Z')
    expect((await book(deal.linkCode, '2026-10-01T06:00:00.000Z')).status).toBe(200)
    expect(requireDeal(h.db, DEAL_ID)).toMatchObject({
      meetingAt: '2026-10-01T06:00:00.000Z',
      expiresAt: '2026-10-02T06:30:00.000Z',
      expiryDays: 3,
    })
    h.clock.now = new Date('2026-10-02T06:29:00.000Z')
    expect((await h.request(`/v/${deal.linkCode}`)).status).toBe(200)
    h.clock.now = new Date('2026-10-02T06:30:00.000Z')
    expect((await h.request(`/v/${deal.linkCode}`)).status).toBe(410)
  })

  it('returns 403 for a booking from a preview and books nothing', async () => {
    const deal = publishedDeal(h)
    const res = await book(deal.linkCode, '2026-09-28T06:00:00.000Z', null, '?preview=1')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'A preview does not send anything' })
    expect(requireDeal(h.db, DEAL_ID)).toMatchObject({ meetingAt: null, status: 'link_sent' })
    expect(jobsForDeal(h.db, DEAL_ID, ['write-brief'])).toHaveLength(0)
  })

  it('rejects an invalid body and an unpublished deal', async () => {
    const deal = publishedDeal(h)
    expect((await book(deal.linkCode, '2026-09-28T06:00:00.000Z', 'not an email')).status).toBe(400)
    expect((await book(deal.linkCode, 'tomorrow')).status).toBe(400)
    const draft = draftDeal(h, { id: 101 })
    expect((await book(draft.linkCode, '2026-09-28T06:00:00.000Z')).status).toBe(404)
    expect(requireDeal(h.db, DEAL_ID).meetingAt).toBeNull()
  })
})
