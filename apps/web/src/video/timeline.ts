import type { VideoPageData } from '@mergero/shared'
import { fill } from '@mergero/shared/i18n/base'

export type SlideTime = VideoPageData['slides'][number]

export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor(total / 60) % 60
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function progressText(template: string, time: number, duration: number, slideName: string | null): string {
  const text = fill(template, { time: formatClock(time), duration: formatClock(duration) })
  return slideName === null ? text : `${text}, ${slideName}`
}
