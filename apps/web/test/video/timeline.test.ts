import { describe, expect, it } from 'vitest'
import { slideAtTime as slideAt } from '@mergero/shared/timeline'
import { formatClock } from '../../src/video/timeline.ts'
import type { SlideTime } from '../../src/video/timeline.ts'

const slides: SlideTime[] = [
  { slide: 1, startS: 0, endS: 31.2 },
  { slide: 2, startS: 31.2, endS: 48.6 },
  { slide: 3, startS: 48.6, endS: 66 },
  { slide: 4, startS: 66, endS: 80.4 },
  { slide: 5, startS: 80.4, endS: 101 },
  { slide: 6, startS: 101, endS: 117.3 },
  { slide: 7, startS: 117.3, endS: 131 },
  { slide: 8, startS: 131, endS: 146.5 },
]

describe('slideAt', () => {
  it('maps each slide start and the time just before its end to that slide', () => {
    for (const slide of slides) {
      expect(slideAt(slides, slide.startS)).toBe(slide.slide)
      expect(slideAt(slides, slide.endS - 0.001)).toBe(slide.slide)
    }
  })

  it('treats a slide end as the start of the next slide', () => {
    expect(slideAt(slides, 31.2)).toBe(2)
    expect(slideAt(slides, 80.4)).toBe(5)
  })

  it('keeps the last slide at and after the end of the video', () => {
    expect(slideAt(slides, 146.5)).toBe(8)
    expect(slideAt(slides, 500)).toBe(8)
  })

  it('returns null for a time before the first slide, a gap, no slides or a time that is not a number', () => {
    const gapped: SlideTime[] = [
      { slide: 1, startS: 1, endS: 10 },
      { slide: 2, startS: 12, endS: 20 },
    ]
    expect(slideAt(gapped, 0.5)).toBeNull()
    expect(slideAt(gapped, 11)).toBeNull()
    expect(slideAt([], 3)).toBeNull()
    expect(slideAt(slides, Number.NaN)).toBeNull()
  })

  it('does not depend on the order of the slides', () => {
    const shuffled = [...slides].reverse()
    expect(slideAt(shuffled, 90)).toBe(5)
    expect(slideAt(shuffled, 200)).toBe(8)
  })
})

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [5.9, '0:05'],
    [65, '1:05'],
    [600, '10:00'],
    [3605, '1:00:05'],
    [-3, '0:00'],
    [Number.NaN, '0:00'],
    [Number.POSITIVE_INFINITY, '0:00'],
  ])('formats %s seconds as %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text)
  })
})
