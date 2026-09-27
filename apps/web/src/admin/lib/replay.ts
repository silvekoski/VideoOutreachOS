import type { SlideNumber, StoredEvent } from '@mergero/shared'

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

export interface ReplaySlide {
  slide: SlideNumber
  startS: number
  endS: number
  leftPct: number
  widthPct: number
}

export interface ReplayMarker {
  id: number
  type: string
  kind: ReplayKind
  videoTime: number
  estimated: boolean
  leftPct: number
  fromPct: number | null
  lane: number
  slide: number | null
  offsetS: number | null
  data: Record<string, unknown>
}

export interface ReplayLayout {
  durationS: number
  slides: ReplaySlide[]
  markers: ReplayMarker[]
  lanes: number
}

export interface ReplayInput {
  startedAt: string
  durationS: number
  slides: { slide: SlideNumber; startS: number; endS: number }[]
  events: Pick<StoredEvent, 'id' | 'seq' | 'type' | 'slide' | 'videoTime' | 'clientAt' | 'at' | 'data'>[]
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function bySeq(a: ReplayInput['events'][number], b: ReplayInput['events'][number]): number {
  if (a.seq !== null && b.seq !== null && a.seq !== b.seq) return a.seq - b.seq
  if (a.seq === null && b.seq !== null) return 1
  if (a.seq !== null && b.seq === null) return -1
  return a.id - b.id
}

export function layoutReplay(input: ReplayInput, { minGapPct = 2.5, maxLanes = 4 } = {}): ReplayLayout {
  const events = [...input.events].sort(bySeq)
  const latest = Math.max(
    0,
    ...input.slides.map((slide) => slide.endS),
    ...events.map((event) => (finite(event.videoTime) ? event.videoTime : 0)),
  )
  const durationS = finite(input.durationS) && input.durationS > 0 ? input.durationS : Math.max(latest, 1)
  const pct = (seconds: number) => Math.min(100, Math.max(0, (seconds / durationS) * 100))
  const started = Date.parse(input.startedAt)

  const slides = input.slides
    .filter((slide) => finite(slide.startS) && finite(slide.endS) && slide.endS > slide.startS)
    .map((slide) => ({ ...slide, leftPct: pct(slide.startS), widthPct: pct(slide.endS) - pct(slide.startS) }))

  const markers: ReplayMarker[] = []
  let known = 0
  for (const event of events) {
    const estimated = !finite(event.videoTime)
    const videoTime = finite(event.videoTime) ? event.videoTime : known
    if (!estimated) known = videoTime
    const kind = replayKind(event.type)
    if (!kind) continue
    const from = kind === 'seek' ? event.data.from : null
    const at = Date.parse(event.clientAt ?? event.at)
    markers.push({
      id: event.id,
      type: event.type,
      kind,
      videoTime,
      estimated,
      leftPct: pct(videoTime),
      fromPct: finite(from) ? pct(from) : null,
      lane: 0,
      slide: event.slide,
      offsetS: Number.isNaN(started) || Number.isNaN(at) ? null : Math.max(0, (at - started) / 1000),
      data: event.data,
    })
  }

  const laneEnds: number[] = []
  const placed = [...markers].sort((a, b) => a.leftPct - b.leftPct)
  for (const marker of placed) {
    let lane = laneEnds.findIndex((end) => marker.leftPct - end >= minGapPct)
    if (lane === -1) {
      if (laneEnds.length < maxLanes) lane = laneEnds.length
      else lane = laneEnds.indexOf(Math.min(...laneEnds))
    }
    laneEnds[lane] = marker.leftPct
    marker.lane = lane
  }

  return { durationS, slides, markers, lanes: Math.max(1, laneEnds.length) }
}
