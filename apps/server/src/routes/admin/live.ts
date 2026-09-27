import type { LiveEvent } from '@mergero/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { adminContext } from './context.ts'

const HEARTBEAT_MS = 25_000

export const liveRoutes = new Hono()

liveRoutes.get('/events', (c) => {
  const { hub } = adminContext()
  return streamSSE(c, async (stream) => {
    const pending: LiveEvent[] = []
    let closed = false
    let wake: () => void = () => undefined
    const unsubscribe = hub.subscribe((event) => {
      if (event === null) closed = true
      else pending.push(event)
      wake()
    })
    stream.onAbort(() => {
      closed = true
      wake()
    })
    try {
      await stream.writeSSE({ event: 'ready', data: '{}' })
      while (!closed) {
        const event = pending.shift()
        if (event) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
          continue
        }
        const idle = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(true), HEARTBEAT_MS)
          wake = () => {
            clearTimeout(timer)
            resolve(false)
          }
        })
        if (idle && !closed) await stream.write(': ping\n\n')
      }
    } finally {
      unsubscribe()
    }
  })
})
