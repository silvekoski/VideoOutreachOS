import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { fill } from '@mergero/shared/i18n/base'
import type { PageStrings } from '@mergero/shared/i18n/base'
import type { SlideTime } from './timeline.ts'

const KEY_STEP_S = 5
const PAGE_STEP_S = 30

interface ProgressBarProps {
  time: number
  duration: number
  buffered: number
  slides: readonly SlideTime[]
  strings: PageStrings
  valueText: string
  onSeek: (to: number) => void
  onKeySeek: (to: number) => void
  onJump: (slide: SlideTime) => void
}

function percent(value: number, duration: number): number {
  return duration > 0 ? Math.min(100, Math.max(0, (value / duration) * 100)) : 0
}

export function ProgressBar({
  time,
  duration,
  buffered,
  slides,
  strings,
  valueText,
  onSeek,
  onKeySeek,
  onJump,
}: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const shown = scrub ?? time

  function timeAt(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrub(timeAt(event.clientX))
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (scrub !== null) setScrub(timeAt(event.clientX))
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (scrub === null) return
    setScrub(null)
    onSeek(timeAt(event.clientX))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowRight: KEY_STEP_S,
      ArrowUp: KEY_STEP_S,
      ArrowLeft: -KEY_STEP_S,
      ArrowDown: -KEY_STEP_S,
      PageUp: PAGE_STEP_S,
      PageDown: -PAGE_STEP_S,
    }
    const step = steps[event.key]
    const target =
      event.key === 'Home' ? 0 : event.key === 'End' ? duration : step === undefined ? null : time + step
    if (target === null) return
    event.preventDefault()
    onKeySeek(Math.min(duration, Math.max(0, target)))
  }

  return (
    <div className="relative h-8 touch-pan-y select-none">
      <div
        role="slider"
        tabIndex={0}
        aria-label={strings.progress}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(Math.min(duration, shown))}
        aria-valuetext={valueText}
        data-track="progress"
        className="group absolute inset-0 cursor-pointer rounded-sm focus-visible:outline-white"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setScrub(null)}
        onKeyDown={onKeyDown}
      >
        <div
          ref={trackRef}
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-[height] group-hover:h-2"
        >
          <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${percent(buffered, duration)}%` }} />
          <div className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${percent(shown, duration)}%` }} />
        </div>
        <div
          aria-hidden="true"
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: `${percent(shown, duration)}%` }}
        />
      </div>
      {slides.map((slide) => {
        const label = fill(strings.jumpToSlide, { n: slide.slide, name: strings.slideNames[slide.slide] })
        return (
          <button
            key={slide.slide}
            type="button"
            aria-label={label}
            title={label}
            data-track={`slide-mark-${slide.slide}`}
            className="absolute top-1/2 z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm focus-visible:outline-white"
            style={{ left: `${percent(slide.startS, duration)}%` }}
            onClick={() => onJump(slide)}
          >
            <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-white/80" />
          </button>
        )
      })}
    </div>
  )
}
