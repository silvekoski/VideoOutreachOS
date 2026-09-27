import { useRef, useState } from 'react'
import type { ReviewDto, SlideNumber } from '@mergero/shared'
import { slideAtTime } from '@mergero/shared'
import { cn } from '@/lib/utils'
import { languageName } from '../lib/brief'
import { formatClock } from '../lib/format'

const RENDER_TEXT: Record<ReviewDto['renderStatus'], string> = {
  pending: 'No render yet. The tool renders the video when the scripts and the audio are ready.',
  rendering: 'The tool renders the video now.',
  rendered: 'The render is done, but the video file is not available.',
  failed: 'The render failed. Retry the job below.',
}

export function VideoPanel({ review }: { review: ReviewDto }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [current, setCurrent] = useState<SlideNumber | null>(null)
  const { video } = review

  if (!video) {
    return (
      <div role="status" className="grid min-h-32 w-full place-items-center rounded-xl border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        {RENDER_TEXT[review.renderStatus]}
      </div>
    )
  }

  const marks = video.slides
  const total = marks.at(-1)?.endS ?? 0
  const names = new Map(review.slides.map((slide) => [slide.slide, slide.name]))

  const seek = (seconds: number) => {
    const element = videoRef.current
    if (!element) return
    element.currentTime = seconds
    void element.play().catch(() => undefined)
  }

  return (
    <div className="grid gap-2">
      <video
        ref={videoRef}
        key={video.url}
        src={video.url}
        controls
        playsInline
        preload="metadata"
        aria-label={`Video version ${video.version}`}
        className="aspect-video w-full rounded-xl bg-black"
        onTimeUpdate={(event) => setCurrent(slideAtTime(marks, event.currentTarget.currentTime))}
      >
        <track kind="captions" src={video.captionsUrl} srcLang={video.language} label={languageName(video.language)} default />
      </video>
      {total > 0 ? (
        <nav aria-label="Slide marks">
          <ol className="flex w-full gap-px overflow-hidden rounded-md">
            {marks.map((mark) => (
              <li key={mark.slide} style={{ width: `${((mark.endS - mark.startS) / total) * 100}%` }} className="min-w-6">
                <button
                  type="button"
                  onClick={() => seek(mark.startS)}
                  aria-current={current === mark.slide ? 'true' : undefined}
                  aria-label={`Slide ${mark.slide}, ${names.get(mark.slide) ?? ''}, at ${formatClock(mark.startS)}`}
                  className={cn(
                    'h-6 w-full bg-muted text-xs tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    current === mark.slide && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                  )}
                >
                  {mark.slide}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {video.version !== review.version ? (
        <p className="text-xs text-muted-foreground">
          {`This is video version ${video.version}. Your edits make version ${review.version} after the render.`}
        </p>
      ) : null}
    </div>
  )
}
