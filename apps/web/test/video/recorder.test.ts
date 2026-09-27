import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventBatchSchema } from '@mergero/shared'
import type { EventBatch, SessionInfo } from '@mergero/shared'
import {
  BATCH_INTERVAL_MS,
  createRecorder,
  httpTransport,
  MAX_BATCH_EVENTS,
  MAX_BEACON_BYTES,
  randomId,
  roundTime,
  SESSION_IDLE_MS,
  sessionStore,
} from '../../src/video/recorder.ts'
import type { SendResult, SessionState, Transport } from '../../src/video/recorder.ts'

const SESSION: SessionInfo = { channel: 'whatsapp', device: 'mobile', browser: 'Safari', os: 'iOS', screen: '390x844', version: 2 }
const IDS = [
  '0f8fad5b-d9cb-469f-a165-70867728950e',
  '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  '9b2d5c1e-3f4a-4b6c-8d7e-1a2b3c4d5e6f',
]

interface PendingPost {
  batch: EventBatch
  resolve: (result: SendResult) => void
  reject: (error: Error) => void
}

function fakeTransport() {
  const posts: PendingPost[] = []
  const beacons: EventBatch[] = []
  let beaconOk = true
  const transport: Transport = {
    post: (body) =>
      new Promise<SendResult>((resolve, reject) => {
        posts.push({ batch: eventBatchSchema.parse(JSON.parse(body)) as EventBatch, resolve, reject })
      }),
    beacon: (body) => {
      if (!beaconOk) return false
      beacons.push(eventBatchSchema.parse(JSON.parse(body)) as EventBatch)
      return true
    },
  }
  return {
    transport,
    posts,
    beacons,
    failBeacons: () => {
      beaconOk = false
    },
  }
}

function memoryStore(initial: SessionState | null = null) {
  let state = initial
  return { read: () => state, write: (next: SessionState) => void (state = next), current: () => state }
}

function setup(initial: SessionState | null = null) {
  const fake = fakeTransport()
  const store = memoryStore(initial)
  let next = 0
  const recorder = createRecorder({
    session: SESSION,
    transport: fake.transport,
    store,
    newId: () => IDS[next++] ?? 'no-more-ids',
  })
  return { ...fake, store, recorder }
}

const seqs = (batch: EventBatch | undefined) => batch?.events.map((event) => event.seq)
const types = (batch: EventBatch | undefined) => batch?.events.map((event) => event.type)

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-26T09:00:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('recorder batches', () => {
  it('sends one batch every 10 seconds with one rising sequence counter', async () => {
    const { recorder, posts } = setup()
    const stop = recorder.start()
    recorder.record('open')
    recorder.record('play', { slide: 1, vt: 0 })
    recorder.record('tap', { data: { target: 'play' } })
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS - 1)
    expect(posts).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(posts).toHaveLength(1)
    const first = posts[0]?.batch
    expect(first?.sessionId).toBe(IDS[0])
    expect(first?.session).toEqual(SESSION)
    expect(seqs(first)).toEqual([0, 1, 2])
    expect(first?.events[1]).toEqual({ seq: 1, type: 'play', at: '2026-09-26T09:00:00.000Z', slide: 1, vt: 0 })
    expect(first?.events[2]?.data).toEqual({ target: 'play' })
    posts[0]?.resolve('ok')
    recorder.record('pause', { slide: 1, vt: 4.2 })
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS)
    expect(posts).toHaveLength(2)
    expect(seqs(posts[1]?.batch)).toEqual([3])
    posts[1]?.resolve('ok')
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 3)
    expect(posts).toHaveLength(2)
    stop()
  })

  it('retries a failed batch on the next tick in order and without duplicates', async () => {
    const { recorder, posts } = setup()
    recorder.record('open')
    recorder.record('play', { slide: 1, vt: 0 })
    const first = recorder.tick()
    posts[0]?.resolve('retry')
    await first
    recorder.record('pause', { slide: 1, vt: 3 })
    const second = recorder.tick()
    expect(seqs(posts[1]?.batch)).toEqual([0, 1, 2])
    posts[1]?.reject(new Error('network down'))
    await second
    const third = recorder.tick()
    expect(seqs(posts[2]?.batch)).toEqual([0, 1, 2])
    posts[2]?.resolve('ok')
    await third
    await recorder.tick()
    expect(posts).toHaveLength(3)
  })

  it('does not start a second request while one is in flight', async () => {
    const { recorder, posts } = setup()
    recorder.record('open')
    const first = recorder.tick()
    recorder.record('scroll', { data: { depth: 40 } })
    await recorder.tick()
    expect(posts).toHaveLength(1)
    posts[0]?.resolve('ok')
    await first
    const second = recorder.tick()
    expect(seqs(posts[1]?.batch)).toEqual([1])
    posts[1]?.resolve('ok')
    await second
  })

  it('drops a batch that the server rejects as invalid', async () => {
    const { recorder, posts } = setup()
    recorder.record('open')
    const first = recorder.tick()
    posts[0]?.resolve('drop')
    await first
    await recorder.tick()
    expect(posts).toHaveLength(1)
  })

  it('stops when the link is gone', async () => {
    const { recorder, posts, beacons } = setup()
    recorder.record('open')
    const first = recorder.tick()
    posts[0]?.resolve('gone')
    await first
    recorder.record('play', { slide: 1, vt: 0 })
    await recorder.tick()
    recorder.hide()
    expect(posts).toHaveLength(1)
    expect(beacons).toHaveLength(0)
  })

  it(`sends at most ${MAX_BATCH_EVENTS} events per batch`, async () => {
    const { recorder, posts } = setup()
    for (let i = 0; i < 1200; i += 1) recorder.record('scroll', { data: { depth: i % 100 } })
    for (const expected of [[0, 499], [500, 999], [1000, 1199]]) {
      const pending = recorder.tick()
      const batch = posts.at(-1)?.batch
      expect([batch?.events[0]?.seq, batch?.events.at(-1)?.seq]).toEqual(expected)
      posts.at(-1)?.resolve('ok')
      await pending
    }
  })
})

describe('recorder on page hide', () => {
  it('records page_hide with the playhead and sends the rest with a beacon', async () => {
    const { recorder, posts, beacons } = setup()
    recorder.setPlayhead(() => ({ slide: 4, vt: 70.12345 }))
    recorder.record('open')
    recorder.record('play', { slide: 4, vt: 66 })
    recorder.hide()
    expect(beacons).toHaveLength(1)
    expect(types(beacons[0])).toEqual(['open', 'play', 'page_hide'])
    expect(beacons[0]?.events[2]).toMatchObject({ seq: 2, slide: 4, vt: 70.123 })
    await recorder.tick()
    expect(posts).toHaveLength(0)
  })

  it('records page_hide without a player as slide and time null', () => {
    const { recorder, beacons } = setup()
    recorder.hide()
    expect(beacons[0]?.events[0]).toMatchObject({ type: 'page_hide', slide: null, vt: null })
  })

  it('includes the batch in flight and does not queue it again when that request fails', async () => {
    const { recorder, posts, beacons } = setup()
    recorder.record('open')
    const inFlight = recorder.tick()
    recorder.record('pause', { slide: 2, vt: 40 })
    recorder.hide()
    expect(seqs(beacons[0])).toEqual([0, 1, 2])
    posts[0]?.resolve('retry')
    await inFlight
    await recorder.tick()
    expect(posts).toHaveLength(1)
  })

  it('keeps the events for the next tick when the beacon fails', async () => {
    const { recorder, posts, failBeacons } = setup()
    failBeacons()
    recorder.record('open')
    recorder.hide()
    const pending = recorder.tick()
    expect(types(posts[0]?.batch)).toEqual(['open', 'page_hide'])
    posts[0]?.resolve('ok')
    await pending
  })

  it(`splits the beacon into parts under ${MAX_BEACON_BYTES} bytes`, () => {
    const { recorder, beacons } = setup()
    for (let i = 0; i < 150; i += 1) recorder.record('tap', { data: { target: 'x'.repeat(900) } })
    recorder.hide()
    expect(beacons.length).toBeGreaterThan(1)
    for (const beacon of beacons) expect(JSON.stringify(beacon).length).toBeLessThan(MAX_BEACON_BYTES + 1000)
    expect(beacons.flatMap((beacon) => seqs(beacon) ?? [])).toEqual(Array.from({ length: 151 }, (_, i) => i))
  })
})

describe('recorder sessions', () => {
  it('continues the session and the counter from the store after a reload', () => {
    const stored = { id: IDS[2] as string, seq: 7, lastAt: Date.now() - 60_000 }
    const { recorder, store, beacons } = setup(stored)
    recorder.record('open')
    expect(store.current()).toEqual({ id: IDS[2], seq: 8, lastAt: Date.now() })
    recorder.hide()
    expect(beacons[0]?.sessionId).toBe(IDS[2])
    expect(seqs(beacons[0])).toEqual([7, 8])
  })

  it('starts a new session after 30 minutes without events and sends each session in its own batch', async () => {
    const { recorder, posts } = setup()
    recorder.record('open')
    recorder.record('pause', { slide: 3, vt: 50 })
    vi.setSystemTime(Date.now() + SESSION_IDLE_MS + 1)
    recorder.record('play', { slide: 3, vt: 50 })
    const first = recorder.tick()
    expect(posts[0]?.batch.sessionId).toBe(IDS[0])
    expect(seqs(posts[0]?.batch)).toEqual([0, 1])
    posts[0]?.resolve('ok')
    await first
    const second = recorder.tick()
    expect(posts[1]?.batch.sessionId).toBe(IDS[1])
    expect(seqs(posts[1]?.batch)).toEqual([0])
    posts[1]?.resolve('ok')
    await second
  })

  it('keeps the session within 30 minutes', () => {
    const { recorder, beacons } = setup()
    recorder.record('open')
    vi.setSystemTime(Date.now() + SESSION_IDLE_MS)
    recorder.hide()
    expect(beacons).toHaveLength(1)
    expect(seqs(beacons[0])).toEqual([0, 1])
  })
})

describe('roundTime', () => {
  it.each([
    [12.34567, 12.346],
    [-1, 0],
    [100_000, 86_400],
    [Number.NaN, null],
    [null, null],
    [undefined, null],
  ])('%s gives %s', (input, output) => {
    expect(roundTime(input)).toBe(output)
  })
})

describe('randomId', () => {
  it('uses randomUUID when it exists', () => {
    expect(randomId({ randomUUID: () => IDS[0] as string, getRandomValues: (array) => array })).toBe(IDS[0])
  })

  it('builds a version 4 UUID from random bytes when randomUUID is missing', () => {
    for (const byte of [0x00, 0x7f, 0xff]) {
      const id = randomId({ getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        if (array instanceof Uint8Array) array.fill(byte)
        return array
      } } as Pick<Crypto, 'getRandomValues'>)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
      expect(eventBatchSchema.safeParse({ sessionId: id, session: SESSION, events: [] }).success).toBe(true)
    }
  })
})

describe('sessionStore', () => {
  it('writes and reads the state', () => {
    const data = new Map<string, string>()
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
    const store = sessionStore(() => storage, 'mergero.session.abc')
    const state = { id: IDS[0] as string, seq: 3, lastAt: 1000 }
    store.write(state)
    expect(JSON.parse(data.get('mergero.session.abc') ?? 'null')).toEqual(state)
    expect(sessionStore(() => storage, 'mergero.session.abc').read()).toEqual(state)
  })

  it('ignores a stored value that is not valid', () => {
    for (const raw of ['{', '{"id":"x","seq":1,"lastAt":1}', `{"id":"${IDS[0]}","seq":-1,"lastAt":1}`, 'null']) {
      const store = sessionStore(() => ({ getItem: () => raw, setItem: () => {} }), 'k')
      expect(store.read()).toBeNull()
    }
  })

  it('keeps the state in memory when the storage throws', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    const store = sessionStore(blocked, 'k')
    expect(store.read()).toBeNull()
    const state = { id: IDS[1] as string, seq: 0, lastAt: 5 }
    store.write(state)
    expect(store.read()).toEqual(state)
  })
})

describe('httpTransport', () => {
  it.each([
    [204, 'ok'],
    [200, 'ok'],
    [404, 'gone'],
    [410, 'gone'],
    [408, 'retry'],
    [429, 'retry'],
    [500, 'retry'],
    [503, 'retry'],
    [400, 'drop'],
    [413, 'drop'],
  ])('maps HTTP %i to %s', async (status, result) => {
    const fetchMock = vi.fn(async () => new Response(null, { status }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = httpTransport('/v/abc/events', () => true)
    await expect(transport.post('{}')).resolves.toBe(result)
    expect(fetchMock).toHaveBeenCalledWith('/v/abc/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
  })

  it('retries after a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(httpTransport('/v/abc/events', () => true).post('{}')).resolves.toBe('retry')
  })

  it('sends the beacon to the events URL and reports a thrown beacon as failed', () => {
    const calls: [string, string][] = []
    expect(httpTransport('/v/abc/events', (url, body) => calls.push([url, body]) > 0).beacon('{"a":1}')).toBe(true)
    expect(calls).toEqual([['/v/abc/events', '{"a":1}']])
    const throwing = httpTransport('/v/abc/events', () => {
      throw new TypeError('Illegal invocation')
    })
    expect(throwing.beacon('{}')).toBe(false)
  })
})
