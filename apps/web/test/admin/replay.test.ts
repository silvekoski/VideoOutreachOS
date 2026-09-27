import type { StoredEvent } from '@mergero/shared'
import { describe, expect, it } from 'vitest'
import { layoutReplay, replayKind } from '../../src/admin/lib/replay'

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

const slides = [
  { slide: 1 as const, startS: 0, endS: 30 },
  { slide: 2 as const, startS: 30, endS: 60 },
  { slide: 3 as const, startS: 60, endS: 100 },
]

describe('replayKind', () => {
  it('groups the page taps and the form fields', () => {
    expect(replayKind('buyer_link_tap')).toBe('tap')
    expect(replayKind('field_value')).toBe('field')
    expect(replayKind('slide_start')).toBeNull()
  })
})

describe('layoutReplay', () => {
  it('places the slides on the video time bar', () => {
    const layout = layoutReplay({ startedAt: START, durationS: 100, slides, events: [] })
    expect(layout.slides.map((slide) => [slide.leftPct, slide.widthPct])).toEqual([
      [0, 30],
      [30, 30],
      [60, 40],
    ])
    expect(layout.markers).toEqual([])
    expect(layout.lanes).toBe(1)
  })

  it('places each event at its video time and orders by sequence number', () => {
    const layout = layoutReplay({
      startedAt: START,
      durationS: 100,
      slides,
      events: [event(3, 2, 'pause', 50), event(1, 0, 'play', 0), event(2, 1, 'slide_start', 30)],
    })
    expect(layout.markers.map((marker) => [marker.type, marker.leftPct])).toEqual([
      ['play', 0],
      ['pause', 50],
    ])
    expect(layout.markers[0]?.offsetS).toBe(1)
  })

  it('carries the last known video time to an event without one', () => {
    const layout = layoutReplay({
      startedAt: START,
      durationS: 100,
      slides,
      events: [event(1, 0, 'play', 0), event(2, 1, 'slide_start', 42), event(3, 2, 'scroll', null)],
    })
    const scroll = layout.markers.find((marker) => marker.type === 'scroll')
    expect(scroll?.videoTime).toBe(42)
    expect(scroll?.estimated).toBe(true)
  })

  it('draws a seek from its start to its target', () => {
    const layout = layoutReplay({
      startedAt: START,
      durationS: 100,
      slides,
      events: [event(1, 0, 'seek', 80, { data: { from: 20 } })],
    })
    expect(layout.markers[0]?.fromPct).toBe(20)
    expect(layout.markers[0]?.leftPct).toBe(80)
  })

  it('clamps a time after the end of the video', () => {
    const layout = layoutReplay({ startedAt: START, durationS: 100, slides, events: [event(1, 0, 'pause', 140)] })
    expect(layout.markers[0]?.leftPct).toBe(100)
  })

  it('moves close markers to separate lanes', () => {
    const layout = layoutReplay({
      startedAt: START,
      durationS: 100,
      slides,
      events: [event(1, 0, 'play', 10), event(2, 1, 'tap', 10.5), event(3, 2, 'pause', 11), event(4, 3, 'play', 50)],
    })
    const lanes = layout.markers.map((marker) => marker.lane)
    expect(lanes).toEqual([0, 1, 2, 0])
    expect(layout.lanes).toBe(3)
  })

  it('reuses a lane when all lanes are full', () => {
    const events = Array.from({ length: 6 }, (_, index) => event(index + 1, index, 'tap', 10 + index * 0.1))
    const layout = layoutReplay({ startedAt: START, durationS: 100, slides, events }, { maxLanes: 3 })
    expect(layout.lanes).toBe(3)
    expect(Math.max(...layout.markers.map((marker) => marker.lane))).toBe(2)
  })

  it('uses the slides for the length when the duration is missing', () => {
    const layout = layoutReplay({ startedAt: START, durationS: 0, slides, events: [event(1, 0, 'play', 50)] })
    expect(layout.durationS).toBe(100)
    expect(layout.markers[0]?.leftPct).toBe(50)
  })

  it('gives no offset for an invalid start time', () => {
    const layout = layoutReplay({ startedAt: 'bad', durationS: 100, slides, events: [event(1, 0, 'play', 0)] })
    expect(layout.markers[0]?.offsetS).toBeNull()
  })
})
