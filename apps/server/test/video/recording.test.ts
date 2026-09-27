import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { RecordingChunk } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { requireDeal } from '../../src/domain/deals.ts'
import { readRecording } from '../../src/video/recording.ts'
import { DEAL_ID, T0 } from '../domain/fixtures.ts'
import { addRenderedVersion, createHarness, draftDeal, json, publishedDeal } from './harness.ts'
import type { Harness } from './harness.ts'

const SESSION = '4b0c2a4e-8f9e-4f7e-9c1a-6d0e5f3b2a10'
const OTHER_SESSION = '9d3f6a1b-2c4e-4a8b-8f0d-1e2a3b4c5d6e'
const START = T0.getTime()

let h: Harness
let code: string

beforeEach(() => {
  h = createHarness()
  code = publishedDeal(h).linkCode
})

afterEach(() => {
  h.close()
})

function chunk(part: number, timestamps: number[], sessionId = SESSION): RecordingChunk {
  return {
    sessionId,
    session: { channel: 'email', device: 'desktop', browser: 'Firefox', os: 'macOS', screen: '1800x1169', version: 1 },
    part,
    events: timestamps.map((timestamp) => ({ type: 3, timestamp, data: { source: 1, positions: [] } })),
  }
}

function send(body: unknown, query = ''): Promise<Response> {
  return h.request(`/v/${code}/recording${query}`, json(body))
}

function recordingDir(sessionId = SESSION): string {
  return path.join(h.storageDir, 'deals', String(DEAL_ID), 'recordings', sessionId)
}

async function stored(sessionId = SESSION): Promise<number[]> {
  const events = JSON.parse(await readRecording(h.storageDir, DEAL_ID, sessionId)) as { timestamp: number }[]
  return events.map((event) => event.timestamp)
}

describe('POST /v/:code/recording', () => {
  it('stores each chunk once, starts the session and reads the chunks back in time order', async () => {
    expect((await send(chunk(1, [START + 5000, START + 6000]))).status).toBe(204)
    expect((await send(chunk(0, [START, START + 1000]))).status).toBe(204)
    expect((await send(chunk(0, [START, START + 1000]))).status).toBe(204)
    expect(readdirSync(recordingDir()).sort()).toEqual([`${START}-0.json`, `${START + 5000}-1.json`])
    expect(await stored()).toEqual([START, START + 1000, START + 5000, START + 6000])
    expect(sql<{ id: string; screen: string }>(h.db, 'SELECT id, screen FROM sessions').all()).toEqual([
      { id: SESSION, screen: '1800x1169' },
    ])
  })

  it('reads an empty list for a session without a recording', async () => {
    expect(await stored(OTHER_SESSION)).toEqual([])
  })

  it('stores nothing for previews (204), expired links (410) and unpublished deals (404)', async () => {
    expect((await send(chunk(0, [START]), '?preview=1')).status).toBe(204)
    h.clock.now = new Date(requireDeal(h.db, DEAL_ID).expiresAt ?? T0)
    expect((await send(chunk(0, [START]))).status).toBe(410)
    h.clock.now = T0
    const draft = draftDeal(h, { id: 101 })
    addRenderedVersion(h, 101)
    expect((await h.request(`/v/${draft.linkCode}/recording`, json(chunk(0, [START])))).status).toBe(404)
    expect(existsSync(recordingDir())).toBe(false)
  })

  it('rejects a chunk without events or with a bad event', async () => {
    expect((await send({ ...chunk(0, []) })).status).toBe(400)
    expect((await send({ ...chunk(0, [START]), events: [{ type: 'full', timestamp: START }] })).status).toBe(400)
    expect(existsSync(recordingDir())).toBe(false)
  })

  it('accepts a chunk above the event body limit and rejects a body above 2 MB', async () => {
    const big = { ...chunk(0, [START]), events: [{ type: 2, timestamp: START, data: { node: 'x'.repeat(1024 * 1024) } }] }
    expect((await send(big)).status).toBe(204)
    const huge = { ...chunk(1, [START + 1]), events: [{ type: 2, timestamp: START + 1, data: { node: 'x'.repeat(3 * 1024 * 1024) } }] }
    expect((await send(huge)).status).toBe(413)
  })
})
