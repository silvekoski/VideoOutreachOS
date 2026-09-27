import type { StoredEvent } from '@mergero/shared'
import { describe, expect, it } from 'vitest'
import { replayKind, replayMarkers } from '../../src/admin/lib/replay'

const START = '2026-09-20T10:00:00.000Z'

function event(id: number, seq: number | null, type: StoredEvent['type'], videoTime: number | null, extra: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id,
    dealId: 1,
    sessionId: 's1',
    seq,
    type,
    slide: null,
    videoTime,
    channel: 'email',
    clientAt: new Date(Date.parse(START) + id * 1000).toISOString(),
    at: new Date(Date.parse(START) + id * 1000).toISOString(),
    data: {},
    ...extra,
  }
}

describe('replayKind', () => {
  it('groups the page taps and the form fields', () => {
    expect(replayKind('buyer_link_tap')).toBe('tap')
    expect(replayKind('field_value')).toBe('field')
    expect(replayKind('slide_start')).toBeNull()
  })
})

describe('replayMarkers', () => {
  it('gives no markers without events', () => {
    expect(replayMarkers(START, [])).toEqual([])
  })

  it('orders by sequence number, skips the slide events and gives the client time', () => {
    const markers = replayMarkers(START, [event(3, 2, 'pause', 50), event(1, 0, 'play', 0), event(2, 1, 'slide_start', 30)])
    expect(markers.map((marker) => [marker.type, marker.videoTime])).toEqual([
      ['play', 0],
      ['pause', 50],
    ])
    expect(markers[0]?.offsetS).toBe(1)
    expect(markers[0]?.clientMs).toBe(Date.parse(START) + 1000)
  })

  it('carries the last known video time to an event without one', () => {
    const markers = replayMarkers(START, [event(1, 0, 'play', 0), event(2, 1, 'slide_start', 42), event(3, 2, 'scroll', null)])
    const scroll = markers.find((marker) => marker.type === 'scroll')
    expect(scroll?.videoTime).toBe(42)
    expect(scroll?.estimated).toBe(true)
  })

  it('gives no offset for an invalid start time', () => {
    expect(replayMarkers('bad', [event(1, 0, 'play', 0)])[0]?.offsetS).toBeNull()
  })
})
