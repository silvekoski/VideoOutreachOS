import { slideAtTime } from './timeline.ts'
import type { DealAnalytics, SessionAnalytics, SessionChannel, SlideAnalytics, SlideNumber, StoredEvent } from './types.ts'

export interface SlideTime {
  slide: SlideNumber
  startS: number
  endS: number
}

type AnalyticsEvent = Pick<StoredEvent, 'type' | 'slide' | 'videoTime' | 'data' | 'seq'>

const LAST_SLIDE: SlideNumber = 8
const FORM_EVENTS = new Set(['field_focus', 'field_value'])

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function playIntervals(events: AnalyticsEvent[]): { intervals: [number, number][]; played: boolean } {
  const intervals: [number, number][] = []
  let open: number | null = null
  let last: number | null = null
  let played = false
  const close = (at: number | null) => {
    if (open === null) return
    const end = at ?? last ?? open
    intervals.push([open, Math.max(open, end)])
    open = null
  }
  for (const event of events) {
    const time = num(event.videoTime)
    switch (event.type) {
      case 'play':
        if (time === null) break
        close(last)
        open = time
        played = true
        break
      case 'pause':
      case 'page_hide':
      case 'complete':
        close(time)
        break
      case 'seek':
        if (open !== null) {
          close(num(event.data?.from))
          if (time !== null) open = time
        }
        break
      case 'slide_start':
      case 'slide_end':
        break
      default:
        continue
    }
    if (time !== null) last = time
  }
  close(last)
  return { intervals, played }
}

function overlap(intervals: [number, number][], start: number, end: number): number {
  let total = 0
  for (const [a, b] of intervals) total += Math.max(0, Math.min(b, end) - Math.max(a, start))
  return total
}

export function computeSessionAnalytics(events: AnalyticsEvent[], slides: SlideTime[]): SessionAnalytics {
  const sorted = [...events].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER))
  const { intervals, played } = playIntervals(sorted)
  const started = new Set<number>()
  const replays = new Map<number, number>()
  for (const event of sorted) {
    if (event.type !== 'slide_start' || event.slide === null) continue
    if (started.has(event.slide)) replays.set(event.slide, (replays.get(event.slide) ?? 0) + 1)
    started.add(event.slide)
  }
  const perSlide: SlideAnalytics[] = [...slides]
    .sort((a, b) => a.slide - b.slide)
    .map((s) => ({ slide: s.slide, watchS: round(overlap(intervals, s.startS, s.endS)), replays: replays.get(s.slide) ?? 0 }))
  const completed = sorted.some((event) => event.type === 'complete')
  const lastInterval = intervals.at(-1)
  const stopSlide = completed ? LAST_SLIDE : played && lastInterval ? slideAtTime(slides, lastInterval[1]) : null
  return {
    watchS: round(perSlide.reduce((sum, s) => sum + s.watchS, 0)),
    perSlide,
    stopSlide,
    replays: perSlide.reduce((sum, s) => sum + s.replays, 0),
    completed,
    played,
    formActivity: sorted.some((event) => FORM_EVENTS.has(event.type)),
  }
}

export function computeDealAnalytics(
  sessions: { localDay: string; channel: SessionChannel; events: StoredEvent[]; slides?: SlideTime[] }[],
  slides: SlideTime[],
): DealAnalytics {
  const results = sessions.map((session) => computeSessionAnalytics(session.events, session.slides ?? slides))
  const perSlide: SlideAnalytics[] = [...slides]
    .sort((a, b) => a.slide - b.slide)
    .map((s) => {
      const rows = results.map((r) => r.perSlide.find((p) => p.slide === s.slide))
      return {
        slide: s.slide,
        watchS: round(rows.reduce((sum, p) => sum + (p?.watchS ?? 0), 0)),
        replays: rows.reduce((sum, p) => sum + (p?.replays ?? 0), 0),
      }
    })
  const stops = results.map((r) => r.stopSlide).filter((slide): slide is SlideNumber => slide !== null)
  const ids = sessions.flatMap((session) => session.events.map((event) => event.id))
  return {
    opens: sessions.reduce((sum, session) => sum + Math.max(1, session.events.filter((event) => event.type === 'open').length), 0),
    sessions: sessions.length,
    totalWatchS: round(perSlide.reduce((sum, s) => sum + s.watchS, 0)),
    perSlide,
    stopSlide: stops.length > 0 ? (Math.max(...stops) as SlideNumber) : null,
    replays: perSlide.reduce((sum, s) => sum + s.replays, 0),
    completed: results.some((r) => r.completed),
    days: new Set(sessions.map((session) => session.localDay)).size,
    lastEventId: ids.length > 0 ? Math.max(...ids) : null,
    channel: sessions.at(-1)?.channel ?? null,
  }
}
