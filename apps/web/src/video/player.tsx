import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { SlideNumber, VideoPageData } from '@mergero/shared'
import type { PageStrings } from '@mergero/shared/i18n/base'
import { slideAtTime as slideAt } from '@mergero/shared/timeline'
import {
  Captions,
  CaptionsOff,
  CircleAlert,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { pickVideoSource } from './device.ts'
import type { Platform } from './device.ts'
import { ProgressBar } from './progress-bar.tsx'
import { roundTime } from './recorder.ts'
import { useRecorder } from './recorder-context.ts'
import { SlideList } from './slide-list.tsx'
import { formatClock, progressText } from './timeline.ts'
import type { SlideTime } from './timeline.ts'

const KEY_SEEK_COMMIT_MS = 600
const SLIDE_ENTRY_S = 0.05
const SLIDE_RESTART_S = 3

interface PlayerProps {
  data: VideoPageData
  strings: PageStrings
  locale: string
  title: string
  platform: Platform
  onSlideChange: (slide: SlideNumber | null) => void
}

interface FullscreenDocument {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}

interface FullscreenElement {
  webkitRequestFullscreen?: () => void
}

function fullscreenElement(): Element | null {
  return document.fullscreenElement ?? (document as FullscreenDocument).webkitFullscreenElement ?? null
}

function canFullscreen(platform: Platform): boolean {
  return !platform.iPhone && (document.fullscreenEnabled || (document as FullscreenDocument).webkitFullscreenEnabled === true)
}

function setCaptionMode(video: HTMLVideoElement | null, show: boolean): boolean {
  const track = video?.textTracks[0]
  if (!track) return false
  track.mode = show ? 'showing' : 'hidden'
  return true
}

function ControlButton({
  label,
  track,
  onClick,
  disabled = false,
  className = 'inline-flex',
  children,
}: {
  label: string
  track: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-track={track}
      onClick={onClick}
      disabled={disabled}
      className={`${className} size-10 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/10 focus-visible:outline-white disabled:opacity-40 disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  )
}

export function Player({ data, strings, locale, title, platform, onSlideChange }: PlayerProps) {
  const recorder = useRecorder()
  const videoRef = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [src] = useState(() => pickVideoSource(data.media, (query) => window.matchMedia(query)))
  const [fullscreenSupported] = useState(() => canFullscreen(platform))
  const [captionsLabel] = useState(() => new Intl.DisplayNames([locale], { type: 'language' }).of(data.videoLanguage))
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [failed, setFailed] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(data.durationS)
  const [buffered, setBuffered] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [captions, setCaptions] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const recordedSlide = useRef<SlideNumber | null>(null)
  const shownSlide = useRef<SlideNumber | null>(null)
  const restore = useRef<{ time: number; play: boolean } | null>(null)
  const keySeek = useRef<{ from: number; to: number; timer: number } | null>(null)
  const slides = data.slides

  useEffect(() => {
    recorder.setPlayhead(() => {
      const t = videoRef.current?.currentTime ?? null
      return { slide: t === null ? null : slideAt(slides, t), vt: t }
    })
    return () => recorder.setPlayhead(null)
  }, [recorder, slides])

  useEffect(() => {
    const onVisible = () => {
      const video = videoRef.current
      if (document.visibilityState !== 'visible' || !video || video.paused || video.ended) return
      recorder.record('play', { slide: slideAt(slides, video.currentTime), vt: video.currentTime })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [recorder, slides])

  useEffect(() => {
    const sync = () => setFullscreen(rootRef.current !== null && fullscreenElement() === rootRef.current)
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  useEffect(() => {
    const tracks = videoRef.current?.textTracks
    if (!tracks) return
    const sync = () => setCaptions(Array.from(tracks).some((track) => track.mode === 'showing'))
    tracks.addEventListener('change', sync)
    return () => tracks.removeEventListener('change', sync)
  }, [])

  useEffect(
    () => () => {
      if (keySeek.current !== null) window.clearTimeout(keySeek.current.timer)
    },
    [],
  )

  function showSlide(t: number) {
    const next = slideAt(slides, t)
    if (next === shownSlide.current) return
    shownSlide.current = next
    onSlideChange(next)
  }

  function trackSlide(t: number) {
    const next = slideAt(slides, t)
    const previous = recordedSlide.current
    if (next === previous) return
    if (previous !== null) {
      const end = slides.find((slide) => slide.slide === previous)?.endS
      recorder.record('slide_end', { slide: previous, vt: end !== undefined && t > end ? end : t })
    }
    if (next !== null) recorder.record('slide_start', { slide: next, vt: t })
    recordedSlide.current = next
  }

  function commitSeek(from: number, to: number, restart: boolean) {
    recorder.record('seek', { slide: slideAt(slides, to), vt: to, data: { from: roundTime(from) } })
    if (slideAt(slides, to) === recordedSlide.current && !restart) return
    if (recordedSlide.current !== null) recorder.record('slide_end', { slide: recordedSlide.current, vt: from })
    recordedSlide.current = null
    const video = videoRef.current
    if (video && !video.paused) trackSlide(to)
  }

  function flushKeySeek() {
    const pending = keySeek.current
    if (pending === null) return
    window.clearTimeout(pending.timer)
    keySeek.current = null
    commitSeek(pending.from, pending.to, false)
  }

  function moveTo(video: HTMLVideoElement, to: number): number {
    const target = Math.min(duration, Math.max(0, to))
    video.currentTime = target
    setTime(target)
    showSlide(target)
    if (target < duration) setEnded(false)
    return target
  }

  function seek(to: number, restart = false) {
    const video = videoRef.current
    if (!video || failed) return
    flushKeySeek()
    const from = video.currentTime
    commitSeek(from, moveTo(video, to), restart)
  }

  function keyboardSeek(to: number) {
    const video = videoRef.current
    if (!video || failed) return
    const pending = keySeek.current
    if (pending !== null) window.clearTimeout(pending.timer)
    const from = pending?.from ?? video.currentTime
    const target = moveTo(video, to)
    keySeek.current = {
      from,
      to: target,
      timer: window.setTimeout(() => {
        keySeek.current = null
        commitSeek(from, target, false)
      }, KEY_SEEK_COMMIT_MS),
    }
  }

  function jumpTo(slide: SlideTime) {
    seek(slide.startS + SLIDE_ENTRY_S, true)
    const video = videoRef.current
    if (video && !failed && video.paused) video.play().catch(() => setPlaying(false))
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video || failed) return
    flushKeySeek()
    if (video.ended) seek(0, true)
    if (video.paused) {
      video.play().catch(() => setPlaying(false))
    } else {
      video.pause()
    }
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    if (!video.muted && video.volume === 0) video.volume = 1
  }

  function changeVolume(value: number) {
    const video = videoRef.current
    if (!video) return
    video.volume = value
    video.muted = value === 0
  }

  function toggleCaptions() {
    if (setCaptionMode(videoRef.current, !captions)) setCaptions(!captions)
  }

  function toggleFullscreen() {
    const root = rootRef.current
    if (!root) return
    const doc = document as Document & FullscreenDocument
    if (fullscreenElement() !== null) {
      if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => undefined)
      else doc.webkitExitFullscreen?.()
    } else if (root.requestFullscreen) {
      void root.requestFullscreen().catch(() => undefined)
    } else {
      ;(root as HTMLElement & FullscreenElement).webkitRequestFullscreen?.()
    }
  }

  function retry() {
    const video = videoRef.current
    if (!video) return
    restore.current = { time, play: true }
    setFailed(false)
    setWaiting(true)
    video.load()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target as HTMLElement
    const onPlayerOrSlider = target === event.currentTarget || target.getAttribute('role') === 'slider'
    if (event.key === 'k' || event.key === 'K' || (event.key === ' ' && onPlayerOrSlider)) {
      event.preventDefault()
      togglePlay()
    }
  }

  function handlePlay() {
    const video = videoRef.current
    if (!video) return
    flushKeySeek()
    setPlaying(true)
    setStarted(true)
    setEnded(false)
    const t = video.currentTime
    recorder.record('play', { slide: slideAt(slides, t), vt: t })
    trackSlide(t)
  }

  function handlePause() {
    const video = videoRef.current
    setPlaying(false)
    setWaiting(false)
    if (!video || video.ended) return
    flushKeySeek()
    recorder.record('pause', { slide: slideAt(slides, video.currentTime), vt: video.currentTime })
  }

  function handleEnded() {
    const video = videoRef.current
    if (!video) return
    const t = video.currentTime
    setPlaying(false)
    setEnded(true)
    setTime(t)
    if (recordedSlide.current !== null) recorder.record('slide_end', { slide: recordedSlide.current, vt: t })
    recordedSlide.current = null
    recorder.record('complete', { slide: slideAt(slides, t), vt: t })
  }

  function handleTimeUpdate() {
    const video = videoRef.current
    if (!video) return
    const t = video.currentTime
    setTime(t)
    showSlide(t)
    if (!video.paused && keySeek.current === null) trackSlide(t)
  }

  function handleDuration() {
    const video = videoRef.current
    if (video && Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration)
  }

  function handleMetadata() {
    const video = videoRef.current
    if (!video) return
    handleDuration()
    const pending = restore.current
    if (pending === null) return
    restore.current = null
    if (pending.time > 0) video.currentTime = pending.time
    if (pending.play) video.play().catch(() => setPlaying(false))
  }

  function handleProgress() {
    const video = videoRef.current
    if (!video) return
    const ranges = video.buffered
    let end = 0
    for (let i = 0; i < ranges.length; i += 1) {
      if (ranges.start(i) <= video.currentTime + 0.5) end = Math.max(end, ranges.end(i))
    }
    setBuffered(end)
  }

  function handleError() {
    const video = videoRef.current
    if (playing && video) {
      recorder.record('pause', { slide: slideAt(slides, video.currentTime), vt: video.currentTime })
    }
    setFailed(true)
    setPlaying(false)
    setWaiting(false)
  }

  function handleVolumeChange() {
    const video = videoRef.current
    if (!video) return
    setMuted(video.muted)
    setVolume(video.volume)
  }

  const currentSlide = slideAt(slides, time)
  const slideName = currentSlide === null ? null : strings.slideNames[currentSlide]
  const slideIndex = slides.findIndex((slide) => slide.slide === currentSlide)
  const thisSlide = slides[slideIndex]
  const previousSlide =
    thisSlide !== undefined && time - thisSlide.startS > SLIDE_RESTART_S ? thisSlide : (slides[slideIndex - 1] ?? slides[0])
  const nextSlide = slides[slideIndex + 1]
  const clock = `${formatClock(time)} / ${formatClock(duration)}`
  const silent = muted || volume === 0
  const showOverlay = (!started || ended) && !failed

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="region"
      aria-label={title}
      data-region="player"
      onKeyDown={onKeyDown}
      className={
        fullscreen
          ? 'flex h-full w-full flex-col bg-black'
          : 'overflow-hidden rounded-2xl bg-ink shadow-lg shadow-ink/10 focus-visible:outline-brand'
      }
    >
      <div className={fullscreen ? 'relative min-h-0 flex-1' : 'relative aspect-video'}>
        <video
          ref={videoRef}
          src={src}
          poster={data.media.poster}
          preload="metadata"
          playsInline
          className="absolute inset-0 size-full bg-black object-contain"
          onClick={started && !failed ? togglePlay : undefined}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleMetadata}
          onDurationChange={handleDuration}
          onProgress={handleProgress}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onVolumeChange={handleVolumeChange}
          onError={handleError}
        >
          <track kind="captions" src={data.media.captions} srcLang={data.videoLanguage} label={captionsLabel} />
        </video>
        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/25">
            <button
              type="button"
              aria-label={ended ? strings.replay : strings.play}
              data-track={ended ? 'replay-overlay' : 'play-overlay'}
              onClick={togglePlay}
              className="flex size-20 items-center justify-center rounded-full bg-brand text-white shadow-xl transition-transform hover:scale-105 focus-visible:outline-4 focus-visible:outline-white motion-reduce:hover:scale-100"
            >
              {ended ? <RotateCcw className="size-9" aria-hidden="true" /> : <Play className="ml-1 size-10 fill-current" aria-hidden="true" />}
            </button>
          </div>
        )}
        {waiting && playing && !failed && (
          <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <LoaderCircle className="size-12 text-white motion-safe:animate-spin" aria-hidden="true" />
            <span className="sr-only">{strings.loading}</span>
          </div>
        )}
        {failed && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/90 p-6 text-center text-white"
          >
            <CircleAlert className="size-8" aria-hidden="true" />
            <p className="max-w-md text-sm sm:text-base">{strings.videoError}</p>
            <button
              type="button"
              data-track="retry"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-ink focus-visible:outline-white"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {strings.play}
            </button>
          </div>
        )}
      </div>
      <div className="relative px-3 pt-1 pb-2 text-white">
        <ProgressBar
          time={time}
          duration={duration}
          buffered={buffered}
          slides={slides}
          strings={strings}
          valueText={progressText(strings.progressValue, time, duration, slideName)}
          onSeek={(to) => seek(to)}
          onKeySeek={keyboardSeek}
          onJump={jumpTo}
        />
        <div className="flex items-center gap-1">
          <ControlButton label={playing ? strings.pause : strings.play} track="play" onClick={togglePlay}>
            {playing ? (
              <Pause className="size-5 fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-5 fill-current" aria-hidden="true" />
            )}
          </ControlButton>
          <ControlButton
            label={strings.previousSlide}
            track="previous-slide"
            className="hidden sm:inline-flex"
            disabled={previousSlide === undefined || failed}
            onClick={() => previousSlide && jumpTo(previousSlide)}
          >
            <SkipBack className="size-5 fill-current" aria-hidden="true" />
          </ControlButton>
          <ControlButton
            label={strings.nextSlide}
            track="next-slide"
            className="hidden sm:inline-flex"
            disabled={nextSlide === undefined || failed}
            onClick={() => nextSlide && jumpTo(nextSlide)}
          >
            <SkipForward className="size-5 fill-current" aria-hidden="true" />
          </ControlButton>
          <ControlButton label={silent ? strings.unmute : strings.mute} track="mute" onClick={toggleMute}>
            {silent ? <VolumeX className="size-5" aria-hidden="true" /> : <Volume2 className="size-5" aria-hidden="true" />}
          </ControlButton>
          {!platform.iOS && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label={strings.volume}
              data-track="volume"
              onChange={(event) => changeVolume(Number(event.target.value))}
              className="mr-1 w-16 min-w-0 shrink accent-brand focus-visible:outline-white sm:w-20"
            />
          )}
          <span className="ml-1 shrink-0 text-sm tabular-nums">{clock}</span>
          {slides.length > 0 && <SlideList slides={slides} current={currentSlide} strings={strings} onJump={jumpTo} />}
          <span className="flex-1" />
          <ControlButton
            label={captions ? strings.captionsOff : strings.captionsOn}
            track="captions"
            onClick={toggleCaptions}
          >
            {captions ? <Captions className="size-5" aria-hidden="true" /> : <CaptionsOff className="size-5" aria-hidden="true" />}
          </ControlButton>
          {fullscreenSupported && (
            <ControlButton
              label={fullscreen ? strings.exitFullscreen : strings.fullscreen}
              track="fullscreen"
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize className="size-5" aria-hidden="true" /> : <Maximize className="size-5" aria-hidden="true" />}
            </ControlButton>
          )}
        </div>
      </div>
    </div>
  )
}
