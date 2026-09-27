import { rmSync } from 'node:fs'
import type { QueueItemDto } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { sql } = await import('../../src/db/index.ts')
const { paths } = await import('../../src/paths.ts')
const { enqueue } = await import('../../src/queue/index.ts')
const { T0, insertAnalyst, insertDeal, later } = await import('../domain/fixtures.ts')
const { createHarness } = await import('./harness.ts')

let h: Harness

beforeEach(() => {
  h = createHarness()
  insertAnalyst(h.db)
  insertAnalyst(h.db, { id: 11, name: 'Jonas Weber' })
  for (const id of [201, 202, 203, 204]) insertDeal(h.db, { id })
  insertDeal(h.db, { id: 205, analystId: 11 })
})

afterEach(() => h.close())

afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

function setStatus(id: number | undefined, status: string, error: string | null = null): void {
  sql(h.db, 'UPDATE jobs SET status = ?, error = ? WHERE id = ?').run(status, error, id)
}

describe('GET /api/queue', () => {
  it('lists one row per deal in the video pipeline, the running jobs first', async () => {
    enqueue(h.db, 'scrape', 'q-scrape-201', { dealId: 201 }, { now: T0, runAt: later(5) })
    const render = enqueue(h.db, 'render', 'q-render-202', { kind: 'deal', dealId: 202, version: 1 }, { now: T0, runAt: later(10) })
    setStatus(render?.id, 'running')
    const audio = enqueue(h.db, 'audio', 'q-audio-203', { kind: 'slides', dealId: 203, version: 1 }, { now: T0, runAt: later(1) })
    setStatus(audio?.id, 'queued', 'ElevenLabs timed out')
    const done = enqueue(h.db, 'scrape', 'q-scrape-204', { dealId: 204 }, { now: T0 })
    setStatus(done?.id, 'done')
    enqueue(h.db, 'pipedrive-write', 'q-write-204', { dealId: 204, op: 'fields' }, { now: T0 })
    enqueue(h.db, 'render', 'q-preview', { kind: 'preview', sceneHash: 'abc' }, { now: T0 })
    enqueue(h.db, 'write-script', 'q-script-205', { dealId: 205, version: 1, slides: [2], lines: false }, { now: T0, runAt: later(20) })
    enqueue(h.db, 'audio', 'q-audio-205', { kind: 'slides', dealId: 205, version: 1 }, { now: T0, runAt: later(30) })

    const { status, body } = await h.json<QueueItemDto[]>('/api/queue')

    expect(status).toBe(200)
    expect(body.map(({ dealId, step, state }) => ({ dealId, step, state }))).toEqual([
      { dealId: 202, step: 'render', state: 'running' },
      { dealId: 203, step: 'audio', state: 'retrying' },
      { dealId: 201, step: 'scrape', state: 'queued' },
      { dealId: 205, step: 'write-script', state: 'queued' },
    ])
    expect(body[3]).toMatchObject({ company: 'Acme Oy', analystName: 'Jonas Weber', runAt: later(20).toISOString() })
  })

  it('returns an empty list when no video is in the pipeline', async () => {
    const { status, body } = await h.json<QueueItemDto[]>('/api/queue')
    expect(status).toBe(200)
    expect(body).toEqual([])
  })
})
