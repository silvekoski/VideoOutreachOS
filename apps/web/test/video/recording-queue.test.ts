import { describe, expect, it } from 'vitest'
import { recordingChunkSchema } from '@mergero/shared'
import type { RecordingChunk, SessionInfo } from '@mergero/shared'
import { MAX_BEACON_BYTES } from '../../src/video/recorder.ts'
import type { SendResult, Transport } from '../../src/video/recorder.ts'
import { MAX_CHUNK_BYTES, createRecordingQueue } from '../../src/video/recording-queue.ts'

const SESSION: SessionInfo = { channel: 'email', device: 'desktop', browser: 'Firefox', os: 'macOS', screen: '1800x1169', version: 1 }
const FIRST = '0f8fad5b-d9cb-469f-a165-70867728950e'
const SECOND = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

function setup(results: SendResult[] = []) {
  const posts: RecordingChunk[] = []
  const beacons: RecordingChunk[] = []
  let beaconOk = true
  let sessionId: string | null = FIRST
  const parse = (body: string) => recordingChunkSchema.parse(JSON.parse(body)) as RecordingChunk
  const transport: Transport = {
    post: async (body) => {
      posts.push(parse(body))
      return results.shift() ?? 'ok'
    },
    beacon: (body) => {
      if (!beaconOk) return false
      beacons.push(parse(body))
      return true
    },
  }
  const queue = createRecordingQueue({ session: SESSION, transport, sessionId: () => sessionId })
  return {
    queue,
    posts,
    beacons,
    setSession: (id: string | null) => void (sessionId = id),
    failBeacons: () => void (beaconOk = false),
  }
}

const event = (timestamp: number, size = 0) => ({ type: 3, timestamp, data: { text: 'x'.repeat(size) } })
const stamps = (chunk: RecordingChunk | undefined) => chunk?.events.map((item) => item.timestamp)

describe('createRecordingQueue', () => {
  it('sends the buffered events as one chunk per tick with a new part number', async () => {
    const t = setup()
    t.queue.add(event(1))
    t.queue.add(event(2))
    await t.queue.tick()
    t.queue.add(event(3))
    await t.queue.tick()
    await t.queue.tick()
    expect(t.posts.map((chunk) => [chunk.sessionId, chunk.part, stamps(chunk)])).toEqual([
      [FIRST, 0, [1, 2]],
      [FIRST, 1, [3]],
    ])
  })

  it('drops events without a session and tells the caller when the session changes', () => {
    const t = setup()
    t.setSession(null)
    expect(t.queue.add(event(1))).toBe(false)
    t.setSession(FIRST)
    expect(t.queue.add(event(2))).toBe(false)
    t.setSession(SECOND)
    expect(t.queue.add(event(3))).toBe(true)
    expect(t.queue.add(event(4))).toBe(false)
  })

  it('keeps each session in its own chunk', async () => {
    const t = setup()
    t.queue.add(event(1))
    t.setSession(SECOND)
    t.queue.add(event(2))
    await t.queue.tick()
    expect(t.posts.map((chunk) => [chunk.sessionId, stamps(chunk)])).toEqual([
      [FIRST, [1]],
      [SECOND, [2]],
    ])
  })

  it('seals a chunk when the buffer gets too large', async () => {
    const t = setup()
    t.queue.add(event(1, MAX_CHUNK_BYTES / 3))
    t.queue.add(event(2, MAX_CHUNK_BYTES / 3))
    t.queue.add(event(3, MAX_CHUNK_BYTES / 3))
    t.queue.add(event(4))
    await t.queue.tick()
    expect(t.posts.map(stamps)).toEqual([[1, 2], [3], [4]])
  })

  it('sends the same sealed chunk again after a retry and stops after gone', async () => {
    const t = setup(['retry', 'ok', 'gone'])
    t.queue.add(event(1))
    await t.queue.tick()
    t.queue.add(event(2))
    await t.queue.tick()
    expect(t.posts.map((chunk) => [chunk.part, stamps(chunk)])).toEqual([
      [0, [1]],
      [0, [1]],
      [1, [2]],
    ])
    expect(t.queue.add(event(3))).toBe(false)
    await t.queue.tick()
    expect(t.posts).toHaveLength(3)
  })

  it('sends beacons that fit the beacon limit when the page hides and keeps the rest', async () => {
    const t = setup()
    t.queue.add(event(1, MAX_BEACON_BYTES / 2))
    t.queue.add(event(2, MAX_BEACON_BYTES / 2))
    t.queue.hide()
    expect(t.beacons.map(stamps)).toEqual([[1], [2]])
    t.failBeacons()
    t.queue.add(event(3))
    t.queue.hide()
    await t.queue.tick()
    expect(t.posts.map(stamps)).toEqual([[3]])
  })
})
