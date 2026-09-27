import type { SlideTime } from './analytics.ts'
import type { Segment, SlideNumber, Timeline } from './types.ts'

export const SLIDE_NAMES_EN: Record<SlideNumber, string> = {
  1: 'Face-cam intro',
  2: 'Who Mergero is',
  3: 'Your company',
  4: 'Your figures',
  5: 'Buyers from Mergero deals',
  6: 'What is possible',
  7: 'Your data stays private',
  8: 'Book a meeting',
}

const CAPTION_LINE = 42
const CAPTION_LINES_PER_CUE = 2
const MIN_CUE_S = 1

export function frames(seconds: number, fps: number): number {
  return Math.max(0, Math.ceil(seconds * fps - 1e-9))
}

function plannedFrames(segment: Segment, fps: number, pauseS: number): number | null {
  if (segment.template === 'facecam') return frames(segment.durationS, fps)
  const audioS = segment.audio.durationS
  return audioS === null ? null : frames(audioS + pauseS, fps)
}

export function plannedDurationS(segment: Segment, fps: number, pauseS: number): number | null {
  const count = plannedFrames(segment, fps, pauseS)
  return count === null ? null : count / fps
}

export function slideTimes(timeline: Timeline): SlideTime[] {
  return timeline.segments.map((segment) => {
    if (segment.startS === null || segment.endS === null) {
      throw new Error(`Slide ${segment.slide} has no start or end time`)
    }
    return { slide: segment.slide, startS: segment.startS, endS: segment.endS }
  })
}

export function withPlannedTimes(timeline: Timeline): Timeline {
  let startFrame = 0
  const segments = timeline.segments.map((segment): Segment => {
    const count = plannedFrames(segment, timeline.fps, timeline.pauseS)
    if (count === null) throw new Error(`Slide ${segment.slide} has no audio duration`)
    const startS = startFrame / timeline.fps
    startFrame += count
    const endS = startFrame / timeline.fps
    return segment.template === 'facecam'
      ? { ...segment, startS, endS }
      : { ...segment, durationS: count / timeline.fps, startS, endS }
  })
  return { ...timeline, segments }
}

export function slideAtTime(slides: readonly SlideTime[], t: number): SlideNumber | null {
  if (!Number.isFinite(t) || slides.length === 0) return null
  for (const slide of slides) {
    if (t >= slide.startS && t < slide.endS) return slide.slide
  }
  const last = slides.reduce((a, b) => (b.endS > a.endS ? b : a))
  return t >= last.endS ? last.slide : null
}

interface Split {
  cost: number
  groups: string[][]
}

function balancedSplit(words: readonly string[], parts: number, fits: (group: readonly string[]) => boolean): string[][] | null {
  const ideal = words.join(' ').length / parts
  const memo = new Map<string, Split | null>()
  const cost = (group: readonly string[]) => (group.join(' ').length - ideal) ** 2
  const best = (from: number, left: number): Split | null => {
    if (left === 1) {
      const group = words.slice(from)
      return fits(group) ? { cost: cost(group), groups: [group] } : null
    }
    const key = `${from}:${left}`
    const known = memo.get(key)
    if (known !== undefined) return known
    let result: Split | null = null
    for (let to = from + 1; to <= words.length - left + 1; to += 1) {
      const group = words.slice(from, to)
      if (!fits(group)) break
      const rest = best(to, left - 1)
      if (!rest) continue
      const total = cost(group) + rest.cost
      if (!result || total < result.cost) result = { cost: total, groups: [group, ...rest.groups] }
    }
    memo.set(key, result)
    return result
  }
  return best(0, parts)?.groups ?? null
}

function cueLines(words: readonly string[]): string[] | null {
  const text = words.join(' ')
  if (words.length === 1 || text.length <= CAPTION_LINE) return [text]
  const fitsLine = (line: readonly string[]) => line.length === 1 || line.join(' ').length <= CAPTION_LINE
  return balancedSplit(words, CAPTION_LINES_PER_CUE, fitsLine)?.map((line) => line.join(' ')) ?? null
}

function sentenceCues(sentence: string): string[] {
  const words = sentence.split(/\s+/u).filter(Boolean)
  for (let parts = 1; parts <= words.length; parts += 1) {
    const groups = balancedSplit(words, parts, (group) => cueLines(group) !== null)
    if (groups) return groups.map((group) => (cueLines(group) ?? []).join('\n'))
  }
  return []
}

function cueTexts(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+/u).flatMap(sentenceCues)
}

function cueDurations(weights: readonly number[], total: number): number[] {
  const even = total / weights.length
  if (even <= MIN_CUE_S) return weights.map(() => even)
  const short = new Set<number>()
  for (;;) {
    const free = total - short.size * MIN_CUE_S
    const weight = weights.reduce((sum, value, index) => (short.has(index) ? sum : sum + value), 0)
    const next = weights.flatMap((value, index) => (!short.has(index) && (free * value) / weight < MIN_CUE_S ? [index] : []))
    if (next.length === 0) return weights.map((value, index) => (short.has(index) ? MIN_CUE_S : (free * value) / weight))
    for (const index of next) short.add(index)
  }
}

function timestamp(seconds: number): string {
  const ms = Math.round(seconds * 1000)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
}

function escapeCue(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildCaptions(timeline: Timeline, introTranscript: string | null): string {
  const blocks: string[] = []
  for (const segment of timeline.segments) {
    if (segment.startS === null || segment.endS === null) {
      throw new Error(`Slide ${segment.slide} has no start or end time`)
    }
    const text = segment.template === 'facecam' ? (introTranscript ?? '') : segment.script
    const cues = cueTexts(text)
    if (cues.length === 0) continue
    const speechS = segment.template === 'facecam' ? null : segment.audio.durationS
    const start = segment.startS
    const end = speechS === null ? segment.endS : Math.min(segment.endS, start + speechS)
    const durations = cueDurations(cues.map((cue) => cue.length), end - start)
    let cueStart = start
    for (const [index, cue] of cues.entries()) {
      const cueEnd = index === cues.length - 1 ? end : cueStart + (durations[index] ?? 0)
      blocks.push(`${blocks.length + 1}\n${timestamp(cueStart)} --> ${timestamp(cueEnd)}\n${escapeCue(cue)}`)
      cueStart = cueEnd
    }
  }
  return `WEBVTT\n\n${blocks.map((block) => `${block}\n\n`).join('')}`
}
