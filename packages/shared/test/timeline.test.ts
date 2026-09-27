import { describe, expect, it } from 'vitest'
import {
  SLIDE_NAMES_EN,
  buildCaptions,
  frames,
  plannedDurationS,
  slideAtTime,
  slideTimes,
  withPlannedTimes,
} from '../src/timeline.ts'
import { fallbackScript } from '../src/fallback-writer.ts'
import type { ScriptContext } from '../src/fallback-writer.ts'
import { LANGUAGES } from '../src/types.ts'
import type { Lang, Segment, SlideSegment } from '../src/types.ts'
import { SLIDE_TIMES, timeline } from './fixtures.ts'

const CHARACTERS_PER_S = 15

const SCRIPT_CONTEXT = (lang: Lang): ScriptContext => ({
  lang,
  company: 'Nordic Steel Oy',
  ownerFirstName: 'Matti',
  analystName: 'Johanna Virtanen',
  buyerNames: ['Nordic Industrial Partners', 'Stena Adactum', 'Axcel Capital'],
  buyerCount: 2200,
  figures: { source: 'asiakastieto', revenue: 4_200_000, profit: 610_000, fiscalYear: 2025 },
  calculator: false,
  lines: [],
  linesSource: 'model',
  hasWebsite: true,
  dealTexts: [],
  country: 'FI',
})

describe('frames', () => {
  it('rounds up to whole frames and ignores float noise', () => {
    expect(frames(1, 30)).toBe(30)
    expect(frames(0.1 * 3, 30)).toBe(9)
    expect(frames(2.4, 30)).toBe(72)
    expect(frames(10.45, 30)).toBe(314)
    expect(frames(0.01, 30)).toBe(1)
    expect(frames(0, 30)).toBe(0)
  })
})

describe('plannedDurationS', () => {
  it('uses the clip length for the face-cam and audio plus the pause for slides', () => {
    const tl = timeline()
    expect(plannedDurationS(tl.segments[0] as Segment, 30, 0.4)).toBe(30)
    const slide = { ...(tl.segments[1] as SlideSegment), audio: { file: 'a.mp3', durationS: 10.05, status: 'ok' as const, error: null } }
    expect(plannedDurationS(slide, 30, 0.4)).toBeCloseTo(314 / 30)
  })

  it('returns null for a slide without audio', () => {
    const slide = { ...(timeline().segments[1] as SlideSegment), audio: { file: null, durationS: null, status: 'missing' as const, error: null } }
    expect(plannedDurationS(slide, 30, 0.4)).toBeNull()
  })
})

describe('withPlannedTimes', () => {
  it('fills frame exact contiguous times', () => {
    const tl = withPlannedTimes(timeline({}, false))
    const times = slideTimes(tl)
    expect(times[0]).toEqual({ slide: 1, startS: 0, endS: 30 })
    for (let i = 1; i < times.length; i += 1) {
      const previous = times[i - 1]
      const current = times[i]
      expect(current?.startS).toBe(previous?.endS)
      expect(((current?.endS ?? 0) - (current?.startS ?? 0)) * 30).toBeCloseTo(600)
      expect(Number.isInteger(Math.round((current?.startS ?? 0) * 30 * 1e6) / 1e6)).toBe(true)
    }
    expect((tl.segments[1] as SlideSegment).durationS).toBe(20)
  })

  it('throws when a slide has no audio', () => {
    const tl = timeline({}, false)
    const slide = tl.segments[3] as SlideSegment
    slide.audio = { ...slide.audio, durationS: null }
    expect(() => withPlannedTimes(tl)).toThrow('Slide 4 has no audio duration')
  })
})

describe('slideTimes', () => {
  it('returns the actual times', () => {
    expect(slideTimes(timeline())).toEqual(SLIDE_TIMES)
  })

  it('throws without actual times', () => {
    expect(() => slideTimes(timeline({}, false))).toThrow('Slide 1 has no start or end time')
  })
})

describe('slideAtTime', () => {
  it.each([
    [0, 1],
    [29.999, 1],
    [30, 2],
    [169.9, 8],
    [170, 8],
    [500, 8],
    [-1, null],
    [Number.NaN, null],
  ])('time %d is slide %s', (time, slide) => {
    expect(slideAtTime(SLIDE_TIMES, time)).toBe(slide)
  })

  it('returns null without slides', () => {
    expect(slideAtTime([], 3)).toBeNull()
  })
})

describe('buildCaptions', () => {
  const parse = (vtt: string) =>
    vtt
      .trim()
      .split('\n\n')
      .slice(1)
      .map((block) => {
        const [id, time, ...lines] = block.split('\n')
        const [start, end] = (time ?? '').split(' --> ')
        const seconds = (stamp = '') => {
          const [h, m, s] = stamp.split(':').map(Number)
          return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)
        }
        return { id, start: seconds(start), end: seconds(end), lines }
      })

  it('writes WebVTT cues with at most 2 lines of at most 42 characters', () => {
    const vtt = buildCaptions(timeline(), 'Hei, olen Johanna Mergerolta. Tein tämän videon juuri sinun yrityksellesi.')
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    const cues = parse(vtt)
    expect(cues.length).toBeGreaterThan(8)
    for (const cue of cues) {
      expect(cue.lines.length).toBeGreaterThanOrEqual(1)
      expect(cue.lines.length).toBeLessThanOrEqual(2)
      for (const line of cue.lines) expect(line.length).toBeLessThanOrEqual(42)
      expect(cue.end).toBeGreaterThan(cue.start)
    }
    expect(cues.map((c) => c.id)).toEqual(cues.map((_, i) => String(i + 1)))
  })

  it('times cues inside the speech of each slide', () => {
    const cues = parse(buildCaptions(timeline(), null))
    expect(cues[0]?.start).toBe(30)
    const slide2 = cues.filter((c) => c.start >= 30 && c.end <= 50)
    expect(slide2.at(-1)?.end).toBeCloseTo(49.6)
    for (let i = 1; i < slide2.length; i += 1) expect(slide2[i]?.start).toBeCloseTo(slide2[i - 1]?.end ?? 0)
  })

  it('uses the intro transcript for the face-cam and skips it when missing', () => {
    expect(parse(buildCaptions(timeline(), 'Hei ja tervetuloa.'))[0]).toMatchObject({ start: 0, end: 30, lines: ['Hei ja tervetuloa.'] })
    expect(parse(buildCaptions(timeline(), null))[0]?.start).toBe(30)
  })

  it('escapes markup characters', () => {
    const tl = timeline()
    ;(tl.segments[1] as SlideSegment).script = 'Tom & Jerry <b>Oy</b> --> test'
    expect(buildCaptions(tl, null)).toContain('Tom &amp; Jerry &lt;b&gt;Oy&lt;/b&gt; --&gt; test')
  })

  it('formats hours, minutes and milliseconds', () => {
    const tl = timeline()
    const segment = tl.segments[1] as SlideSegment
    segment.startS = 3723.5
    segment.endS = 3730
    segment.script = 'Lyhyt teksti.'
    expect(buildCaptions(tl, null)).toContain('01:02:03.500 --> 01:02:10.000')
  })

  it('throws without actual times', () => {
    expect(() => buildCaptions(timeline({}, false), null)).toThrow('no start or end time')
  })

  it('splits a long sentence into balanced cues with balanced lines', () => {
    const tl = timeline()
    const segment = tl.segments[1] as SlideSegment
    segment.script =
      'Auf dem Bildschirm sehen Sie einige von ihnen und einige Transaktionen, die wir kürzlich abgeschlossen haben, damit Sie finden.'
    const cues = parse(buildCaptions(tl, null)).filter((cue) => cue.end <= 50)
    expect(cues).toHaveLength(2)
    const lengths = cues.map((cue) => cue.lines.join(' ').length)
    expect(Math.abs((lengths[0] ?? 0) - (lengths[1] ?? 0))).toBeLessThan(15)
    for (const cue of cues) {
      expect(cue.lines).toHaveLength(2)
      expect(Math.abs((cue.lines[0]?.length ?? 0) - (cue.lines[1]?.length ?? 0))).toBeLessThan(15)
    }
  })

  it('gives a short cue at least 1 s and takes the time from the longer cues', () => {
    const tl = timeline()
    const segment = tl.segments[1] as SlideSegment
    segment.script = 'Ja. Mergero hilft Eigentümern von etablierten Unternehmen, den richtigen Käufer zu finden.'
    segment.audio = { ...segment.audio, durationS: 6 }
    const cues = parse(buildCaptions(tl, null)).filter((cue) => cue.end <= 50)
    expect(cues.map((cue) => cue.lines.join(' '))[0]).toBe('Ja.')
    expect((cues[0]?.end ?? 0) - (cues[0]?.start ?? 0)).toBeCloseTo(1)
    expect(cues.at(-1)?.end).toBeCloseTo(36)
  })

  it.each(LANGUAGES)('keeps each cue of the %s fallback scripts readable', (lang) => {
    const tl = timeline({ language: lang })
    const sentences = new Set<string>()
    let startS = 30
    for (const segment of tl.segments) {
      if (segment.template === 'facecam') continue
      const script = fallbackScript(segment.slide, SCRIPT_CONTEXT(lang))
      for (const sentence of script.split(/(?<=[.!?])\s+/u)) sentences.add(sentence)
      const speechS = script.length / CHARACTERS_PER_S
      Object.assign(segment, {
        script,
        audio: { ...segment.audio, durationS: speechS },
        startS,
        endS: startS + speechS + tl.pauseS,
      })
      startS += speechS + tl.pauseS
    }
    const cues = parse(buildCaptions(tl, null))
    expect(cues.length).toBeGreaterThan(14)
    for (const cue of cues) {
      const text = cue.lines.join(' ')
      expect(cue.end - cue.start, text).toBeGreaterThanOrEqual(0.999)
      expect(cue.lines.length, text).toBeLessThanOrEqual(2)
      for (const line of cue.lines) expect(line.length, text).toBeLessThanOrEqual(42)
      if (!text.includes(' ')) expect(sentences.has(text), text).toBe(true)
    }
  })
})

describe('SLIDE_NAMES_EN', () => {
  it('names all 8 slides', () => {
    expect(Object.keys(SLIDE_NAMES_EN)).toHaveLength(8)
    expect(SLIDE_NAMES_EN[5]).toBe('Buyers from Mergero deals')
  })
})
