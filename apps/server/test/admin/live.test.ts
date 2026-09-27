import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { LiveHub } = await import('../../src/live/hub.ts')
const { configureAdmin } = await import('../../src/routes/admin/index.ts')
const { createHarness } = await import('./harness.ts')

let h: Harness
let hub: InstanceType<typeof LiveHub>

beforeEach(() => {
  h = createHarness()
  hub = new LiveHub()
  configureAdmin({ hub })
})

afterEach(() => {
  configureAdmin({ hub: undefined })
  h.close()
})

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, text: string): Promise<string> {
  const decoder = new TextDecoder()
  let received = ''
  while (!received.includes(text)) {
    const { value, done } = await reader.read()
    if (done) throw new Error(`The stream ended before "${text}"`)
    received += decoder.decode(value, { stream: true })
  }
  return received
}

describe('GET /api/events', () => {
  it('streams the hub events and ends when the hub closes', async () => {
    const response = await h.request('/api/events')
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    await readUntil(reader, 'event: ready')
    expect(hub.size).toBe(1)
    hub.publish({ type: 'pipedrive', dealIds: [40], prospects: true })
    expect(await readUntil(reader, '"prospects":true')).toContain('event: pipedrive')
    hub.close()
    expect((await reader.read()).done).toBe(true)
  })
})
