import type { RecordingChunk, RecordingEvent, SessionInfo } from '@mergero/shared'
import { MAX_BEACON_BYTES } from './recorder.ts'
import type { SendResult, Transport } from './recorder.ts'

export const MAX_CHUNK_BYTES = 512 * 1024

export interface RecordingQueue {
  add(event: RecordingEvent): boolean
  tick(): Promise<void>
  hide(): void
}

export interface RecordingQueueOptions {
  session: SessionInfo
  transport: Transport
  sessionId: () => string | null
}

export function createRecordingQueue(options: RecordingQueueOptions): RecordingQueue {
  let buffer: { sessionId: string; items: { event: RecordingEvent; size: number }[]; bytes: number } | null = null
  let sealed: string[] = []
  let part = 0
  let sending = false
  let stopped = false

  function seal(maxBytes: number): void {
    if (buffer === null) return
    const { sessionId, items } = buffer
    buffer = null
    let piece: RecordingEvent[] = []
    let bytes = 0
    const flush = () => {
      const chunk: RecordingChunk = { sessionId, session: options.session, part: part++, events: piece }
      sealed.push(JSON.stringify(chunk))
      piece = []
      bytes = 0
    }
    for (const { event, size } of items) {
      if (piece.length > 0 && bytes + size > maxBytes) flush()
      piece.push(event)
      bytes += size
    }
    if (piece.length > 0) flush()
  }

  return {
    add(event) {
      const sessionId = options.sessionId()
      if (stopped || sessionId === null) return false
      const rotated = buffer !== null && buffer.sessionId !== sessionId
      if (rotated) seal(MAX_CHUNK_BYTES)
      const size = JSON.stringify(event).length + 1
      buffer ??= { sessionId, items: [], bytes: 0 }
      buffer.items.push({ event, size })
      buffer.bytes += size
      if (buffer.bytes >= MAX_CHUNK_BYTES) seal(MAX_CHUNK_BYTES)
      return rotated
    },
    async tick() {
      if (stopped || sending) return
      seal(MAX_CHUNK_BYTES)
      sending = true
      while (!stopped && sealed.length > 0) {
        const body = sealed[0] as string
        let result: SendResult
        try {
          result = await options.transport.post(body)
        } catch {
          result = 'retry'
        }
        if (result === 'retry') break
        if (result === 'gone') {
          stopped = true
          sealed = []
        }
        sealed = sealed.filter((item) => item !== body)
      }
      sending = false
    },
    hide() {
      if (stopped) return
      seal(MAX_BEACON_BYTES)
      for (const body of [...sealed]) {
        if (body.length > MAX_BEACON_BYTES || !options.transport.beacon(body)) break
        sealed = sealed.filter((item) => item !== body)
      }
    },
  }
}
