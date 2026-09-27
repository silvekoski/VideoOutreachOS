import type { SlideAnalytics, SlideNumber } from '@mergero/shared'

export const SLIDE_NUMBERS: readonly SlideNumber[] = [1, 2, 3, 4, 5, 6, 7, 8]

export interface SlideWatchRow {
  slide: SlideNumber
  watchS: number
  replays: number
}

export function slideWatchRows(perSlide: readonly SlideAnalytics[]): SlideWatchRow[] {
  return SLIDE_NUMBERS.map((slide) => {
    const hit = perSlide.find((entry) => entry.slide === slide)
    return { slide, watchS: Math.max(0, hit?.watchS ?? 0), replays: Math.max(0, hit?.replays ?? 0) }
  })
}
