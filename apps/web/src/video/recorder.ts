import type { ClientEvent, EventBatch, SessionEventType, SessionInfo, SlideNumber } from '@mergero/shared'

export const BATCH_INTERVAL_MS = 10_000
export const SESSION_IDLE_MS = 30 * 60_000
export const MAX_BATCH_EVENTS = 500
export const MAX_BEACON_BYTES = 60_000
const MAX_VIDEO_TIME = 86_400

export type SendResult = 'ok' | 'retry' | 'drop' | 'gone'

export interface Transport {
  post(body: string): Promise<SendResult>
  beacon(body: string): boolean
}

export interface SessionState {
  id: string
  seq: number
  lastAt: number
}

export interface SessionStore {
  read(): SessionState | null
  write(state: SessionState): void
}

export interface Playhead {
  slide: SlideNumber | null
  vt: number | null
}

export interface EventInput {
  slide?: SlideNumber | null
  vt?: number | null
  data?: ClientEvent['data']
}

export interface Recorder {
  record(type: SessionEventType, input?: EventInput): void
  tick(): Promise<void>
  hide(): void
  setPlayhead(read: (() => Playhead) | null): void
  sessionId(): string | null
  start(): () => void
}

export interface RecorderOptions {
  session: SessionInfo
  transport: Transport
  store: SessionStore
  newId: () => string
  now?: () => number
  intervalMs?: number
}

interface Queued {
  sessionId: string
  event: ClientEvent
}

export const noopRecorder: Recorder = {
  record: () => {},
  tick: async () => {},
  hide: () => {},
  setPlayhead: () => {},
  sessionId: () => null,
  start: () => () => {},
}

export function roundTime(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return Math.round(Math.min(MAX_VIDEO_TIME, Math.max(0, value)) * 1000) / 1000
}

export function createRecorder(options: RecorderOptions): Recorder {
  const now = options.now ?? Date.now
  let state = options.store.read()
  let queue: Queued[] = []
  let inFlight: Queued[] | null = null
  const beaconed = new WeakSet<Queued>()
  let stopped = false
  let playhead: (() => Playhead) | null = null

  function take(items: Queued[], maxBytes: number): Queued[] {
    const sessionId = items[0]?.sessionId
    const batch: Queued[] = []
    let bytes = 0
    for (const item of items) {
      if (item.sessionId !== sessionId || batch.length >= MAX_BATCH_EVENTS) break
      const size = JSON.stringify(item.event).length + 1
      if (batch.length > 0 && bytes + size > maxBytes) break
      batch.push(item)
      bytes += size
    }
    return batch
  }

  function body(batch: Queued[]): string {
    const payload: EventBatch = {
      sessionId: batch[0]?.sessionId ?? '',
      session: options.session,
      events: batch.map((item) => item.event),
    }
    return JSON.stringify(payload)
  }

  function record(type: SessionEventType, input: EventInput = {}): void {
    if (stopped) return
    const at = now()
    const current =
      state === null || at - state.lastAt > SESSION_IDLE_MS ? { id: options.newId(), seq: 0, lastAt: at } : state
    const event: ClientEvent = {
      seq: current.seq,
      type,
      at: new Date(at).toISOString(),
      slide: input.slide ?? null,
      vt: roundTime(input.vt),
    }
    if (input.data !== undefined) event.data = input.data
    state = { id: current.id, seq: current.seq + 1, lastAt: at }
    options.store.write(state)
    queue.push({ sessionId: current.id, event })
  }

  async function tick(): Promise<void> {
    if (stopped || inFlight !== null || queue.length === 0) return
    const batch = take(queue, Number.POSITIVE_INFINITY)
    queue = queue.slice(batch.length)
    inFlight = batch
    let result: SendResult
    try {
      result = await options.transport.post(body(batch))
    } catch {
      result = 'retry'
    }
    inFlight = null
    if (result === 'retry') {
      queue = [...batch.filter((item) => !beaconed.has(item)), ...queue]
    } else if (result === 'gone') {
      stopped = true
      queue = []
    }
  }

  function flushBeacon(): void {
    let pending = [...(inFlight ?? []).filter((item) => !beaconed.has(item)), ...queue]
    while (pending.length > 0) {
      const chunk = take(pending, MAX_BEACON_BYTES)
      if (!options.transport.beacon(body(chunk))) break
      for (const item of chunk) beaconed.add(item)
      pending = pending.slice(chunk.length)
    }
    queue = queue.filter((item) => !beaconed.has(item))
  }

  return {
    record,
    tick,
    hide() {
      if (stopped) return
      record('page_hide', playhead?.() ?? {})
      flushBeacon()
    },
    setPlayhead(read) {
      playhead = read
    },
    sessionId() {
      return state?.id ?? null
    },
    start() {
      const timer = setInterval(() => void tick(), options.intervalMs ?? BATCH_INTERVAL_MS)
      return () => clearInterval(timer)
    },
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

export function randomId(source: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string }): string {
  if (typeof source.randomUUID === 'function') return source.randomUUID()
  const hex = Array.from(source.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`
}

function isSessionState(value: unknown): value is SessionState {
  if (typeof value !== 'object' || value === null) return false
  const { id, seq, lastAt } = value as Record<string, unknown>
  return (
    typeof id === 'string' &&
    UUID.test(id) &&
    Number.isSafeInteger(seq) &&
    (seq as number) >= 0 &&
    typeof lastAt === 'number' &&
    Number.isFinite(lastAt)
  )
}

export function sessionStore(storage: () => Pick<Storage, 'getItem' | 'setItem'>, key: string): SessionStore {
  let memory: SessionState | null = null
  function load(): SessionState | null {
    try {
      const raw = storage().getItem(key)
      const parsed: unknown = raw === null ? null : JSON.parse(raw)
      return isSessionState(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return {
    read() {
      memory = load() ?? memory
      return memory
    },
    write(state) {
      memory = state
      try {
        storage().setItem(key, JSON.stringify(state))
      } catch {
        return
      }
    },
  }
}

export function httpTransport(url: string, sendBeacon: (url: string, body: string) => boolean): Transport {
  return {
    async post(body) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
        if (response.ok) return 'ok'
        if (response.status === 404 || response.status === 410) return 'gone'
        if (response.status === 408 || response.status === 429 || response.status >= 500) return 'retry'
        return 'drop'
      } catch {
        return 'retry'
      }
    },
    beacon(body) {
      try {
        return sendBeacon(url, body)
      } catch {
        return false
      }
    },
  }
}
