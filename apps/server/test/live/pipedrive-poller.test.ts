import type { LiveEvent } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { LiveHub } from '../../src/live/hub.ts'
import { IDLE_MS, PipedrivePoller, SAVING_MS, WATCHED_MS, recentsTimestamp } from '../../src/live/pipedrive-poller.ts'
import type { PipedriveChanges } from '../../src/providers/types.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'

const NOW = new Date('2026-09-27T10:00:00.000Z')

let t: TempDb
let hub: LiveHub
let pages: PipedriveChanges[]
let listChanges: Mock<(since: string) => Promise<PipedriveChanges>>

function poller(): PipedrivePoller {
  const unused = async () => {
    throw new Error('not used')
  }
  return new PipedrivePoller({
    db: t.db,
    hub,
    clock: () => NOW,
    providers: {
      pipedrive: { listChanges, listUsers: unused, getDeal: unused, getPerson: unused, getOrg: unused },
      linkedin: { get: async () => null },
    },
  })
}

beforeEach(() => {
  t = tempDb()
  hub = new LiveHub()
  pages = []
  listChanges = vi.fn(async () => pages.shift() ?? { changes: [], cursor: '2026-09-27 10:00:00', budget: null })
})

afterEach(() => {
  t.close()
})

describe('PipedrivePoller', () => {
  it('starts at the current time, keeps the cursor and skips a change that it saw on the last page', async () => {
    const change = { type: 'deal' as const, id: 41, updatedAt: '2026-09-27 10:00:05', deal: null }
    pages.push({ changes: [change], cursor: '2026-09-27 10:00:05', budget: null }, { changes: [change], cursor: '2026-09-27 10:00:05', budget: null })
    const events: (LiveEvent | null)[] = []
    hub.subscribe((event) => events.push(event))
    const subject = poller()

    expect(await subject.poll()).toEqual({ dealIds: [], prospects: true })
    expect(await subject.poll()).toEqual({ dealIds: [], prospects: false })
    expect(listChanges.mock.calls).toEqual([[recentsTimestamp(NOW)], ['2026-09-27 10:00:05']])
    expect(sql<{ value: string }>(t.db, 'SELECT value FROM sync_state').get()?.value).toBe('2026-09-27 10:00:05')
    expect(events).toEqual([{ type: 'pipedrive', dealIds: [], prospects: true }])
  })

  it('polls fast only while a panel listens and slows down when the daily budget is low', async () => {
    const subject = poller()
    expect(subject.delayMs()).toBe(IDLE_MS)
    const unsubscribe = hub.subscribe(() => undefined)
    expect(subject.delayMs()).toBe(WATCHED_MS)
    pages.push({ changes: [], cursor: '2026-09-27 10:00:00', budget: { limit: 150_000, remaining: 20_000 } })
    await subject.poll()
    expect(subject.delayMs()).toBe(SAVING_MS)
    unsubscribe()
  })
})

describe('LiveHub', () => {
  it('tells join listeners about a new subscriber and sends null to each subscriber on close', () => {
    const joined = vi.fn()
    const received: (LiveEvent | null)[] = []
    hub.onJoin(joined)
    hub.subscribe((event) => received.push(event))
    hub.publish({ type: 'db' })
    hub.close()
    expect(joined).toHaveBeenCalledTimes(1)
    expect(received).toEqual([{ type: 'db' }, null])
    expect(hub.size).toBe(0)
  })
})
