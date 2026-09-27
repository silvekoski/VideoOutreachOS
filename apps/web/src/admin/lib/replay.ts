import type { StoredEvent } from '@mergero/shared'

export type ReplayKind = 'play' | 'pause' | 'seek' | 'scroll' | 'tap' | 'field' | 'complete' | 'page_hide'

const KINDS: Record<string, ReplayKind> = {
  play: 'play',
  pause: 'pause',
  seek: 'seek',
  scroll: 'scroll',
  tap: 'tap',
  buyer_link_tap: 'tap',
  forward: 'tap',
  calculator_result: 'tap',
  field_focus: 'field',
  field_value: 'field',
  complete: 'complete',
  page_hide: 'page_hide',
}

export function replayKind(type: string): ReplayKind | null {
  return KINDS[type] ?? null
}

export interface ReplayMarker {
  id: number
  type: string
  kind: ReplayKind
  videoTime: number
  estimated: boolean
  slide: number | null
  offsetS: number | null
  clientMs: number | null
  data: Record<string, unknown>
}

type ReplayEvent = Pick<StoredEvent, 'id' | 'seq' | 'type' | 'slide' | 'videoTime' | 'clientAt' | 'at' | 'data'>

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function bySeq(a: ReplayEvent, b: ReplayEvent): number {
  if (a.seq !== null && b.seq !== null && a.seq !== b.seq) return a.seq - b.seq
  if (a.seq === null && b.seq !== null) return 1
  if (a.seq !== null && b.seq === null) return -1
  return a.id - b.id
}

export function replayMarkers(startedAt: string, events: readonly ReplayEvent[]): ReplayMarker[] {
  const started = Date.parse(startedAt)
  const markers: ReplayMarker[] = []
  let known = 0
  for (const event of [...events].sort(bySeq)) {
    const estimated = !finite(event.videoTime)
    const videoTime = finite(event.videoTime) ? event.videoTime : known
    if (!estimated) known = videoTime
    const kind = replayKind(event.type)
    if (!kind) continue
    const at = Date.parse(event.clientAt ?? event.at)
    markers.push({
      id: event.id,
      type: event.type,
      kind,
      videoTime,
      estimated,
      slide: event.slide,
      offsetS: Number.isNaN(started) || Number.isNaN(at) ? null : Math.max(0, (at - started) / 1000),
      clientMs: Number.isNaN(at) ? null : at,
      data: event.data,
    })
  }
  return markers
}
