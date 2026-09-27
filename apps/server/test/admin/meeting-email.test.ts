import { rmSync } from 'node:fs'
import type { AlertDto, DealDetailDto, InboxDto } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { sql } = await import('../../src/db/index.ts')
const { buildBriefData } = await import('../../src/domain/brief-data.ts')
const { paths } = await import('../../src/paths.ts')
const { bookMeeting, dealSlots } = await import('../../src/video/booking.ts')
const { T0, insertAnalyst } = await import('../domain/fixtures.ts')
const { createHarness, publishedDeal } = await import('./harness.ts')

const EMAIL = 'anna.owner@acme.test'

let h: Harness

beforeEach(() => {
  h = createHarness()
  insertAnalyst(h.db)
})

afterEach(() => h.close())

afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

function book(dealId: number, email: string | null): string {
  publishedDeal(h.db, { id: dealId })
  const [slot] = dealSlots(h.db, dealId, T0)
  if (!slot) throw new Error('The analyst has no free slot')
  return bookMeeting(h.db, dealId, { start: slot.start, email }, T0)
}

describe('meeting invitation email', () => {
  it('shows the email of the booking on the deal page, in the alert and in the Inbox, and never sends it to Pipedrive', async () => {
    const meetingAt = book(100, EMAIL)
    book(101, null)

    expect((await h.json<DealDetailDto>('/api/deals/100')).body).toMatchObject({ meetingAt, meetingEmail: EMAIL })
    expect((await h.json<DealDetailDto>('/api/deals/101')).body.meetingEmail).toBeNull()

    const alerts = (await h.json<AlertDto[]>('/api/alerts?analyst=10')).body.filter((alert) => alert.type === 'meeting_booked')
    expect(alerts.map((alert) => [alert.dealId, alert.text])).toEqual([
      [101, expect.not.stringContaining('invitation')],
      [100, `Booked a meeting for 2026-09-28 09:00 (Europe/Helsinki). Send the invitation to ${EMAIL}`],
    ])

    h.setNow(new Date(Date.parse(meetingAt) - 60 * 60_000))
    const inbox = (await h.json<InboxDto>('/api/inbox?analyst=10')).body
    const meetings = inbox.groups.find((group) => group.key === 'meeting_today')?.rows ?? []
    expect(meetings.find((row) => row.dealId === 100)).toMatchObject({ meetingAt, meetingEmail: EMAIL })
    expect(meetings.find((row) => row.dealId === 101)?.meetingEmail).toBeNull()

    const payloads = sql<{ payload: string }>(h.db, 'SELECT payload FROM jobs').all()
    expect(payloads.some((row) => row.payload.includes(EMAIL))).toBe(false)
    expect(JSON.stringify(buildBriefData(h.db, 100, T0))).not.toContain(EMAIL)
  })
})
