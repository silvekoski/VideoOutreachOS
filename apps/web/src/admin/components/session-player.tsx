import '@rrweb/replay/dist/style.css'
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import type { RecordingEvent } from '@mergero/shared'
import { Replayer } from '@rrweb/replay'
import { EventType } from '@rrweb/types'
import type { eventWithTime } from '@rrweb/types'
import { Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { formatClock } from '../lib/format'
import { EmptyState } from './query-state'
import { SegmentedFilter } from './segmented-filter'

export interface SessionPlayerHandle {
  seek(at: number): void
}

interface PlayerProps {
  events: RecordingEvent[]
  onTime: (at: number) => void
  ref?: Ref<SessionPlayerHandle>
}

const SPEEDS = ['1', '2', '4'] as const
const TICK_MS = 200
const MAX_STAGE_VH = 0.6

function firstViewport(events: RecordingEvent[]): { width: number; height: number } {
  const data = events.find((event) => event.type === EventType.Meta)?.data as { width?: unknown; height?: unknown } | undefined
  const side = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 1)
  return { width: side(data?.width), height: side(data?.height) }
}

function Player({ events, onTime, ref }: PlayerProps) {
  const switchId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const replayerRef = useRef<Replayer | null>(null)
  const onTimeRef = useRef(onTime)
  const [meta, setMeta] = useState({ startTime: 0, totalTime: 0 })
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('1')
  const [skipIdle, setSkipIdle] = useState(true)
  const [viewport, setViewport] = useState(() => firstViewport(events))
  const [boxWidth, setBoxWidth] = useState(0)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    onTimeRef.current = onTime
  })

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const replayer = new Replayer(events as eventWithTime[], {
      root: stage,
      showWarning: false,
      triggerFocus: false,
      skipInactive: true,
      insertStyleRules: ['video::-webkit-media-controls { display: none !important; }'],
    })
    const { startTime, totalTime } = replayer.getMetaData()
    replayer.iframe.title = 'Session recording'
    replayer.on('resize', (size) => setViewport(size as { width: number; height: number }))
    replayer.on('finish', () => {
      setPlaying(false)
      setTime(totalTime)
    })
    replayer.pause(0)
    replayerRef.current = replayer
    setMeta({ startTime, totalTime })
    setTime(0)
    setPlaying(false)
    onTimeRef.current(startTime)
    return () => {
      replayer.destroy()
      replayerRef.current = null
    }
  }, [events])

  useEffect(() => {
    replayerRef.current?.setConfig({ speed: Number(speed), skipInactive: skipIdle, mouseTail: !reducedMotion })
  }, [speed, skipIdle, reducedMotion, events])

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      const current = replayerRef.current?.getCurrentTime() ?? 0
      setTime(current)
      onTimeRef.current(meta.startTime + current)
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [playing, meta.startTime])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => setBoxWidth(entry?.contentRect.width ?? 0))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  function seek(offset: number) {
    const replayer = replayerRef.current
    if (!replayer) return
    const target = Math.min(meta.totalTime, Math.max(0, offset))
    if (playing) replayer.play(target)
    else replayer.pause(target)
    setTime(target)
    onTimeRef.current(meta.startTime + target)
  }

  useImperativeHandle(ref, () => ({ seek: (at: number) => seek(at - meta.startTime) }))

  function togglePlay() {
    const replayer = replayerRef.current
    if (!replayer) return
    if (playing) {
      replayer.pause()
      setTime(replayer.getCurrentTime())
      setPlaying(false)
    } else {
      replayer.play(time >= meta.totalTime ? 0 : time)
      setPlaying(true)
    }
  }

  const scale =
    boxWidth > 0 ? Math.min(boxWidth / viewport.width, (window.innerHeight * MAX_STAGE_VH) / viewport.height) : 0
  const clock = `${formatClock(time / 1000)} / ${formatClock(meta.totalTime / 1000)}`

  return (
    <div className="grid gap-3">
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden rounded-lg border bg-muted"
        style={{ height: viewport.height * scale }}
      >
        <div
          ref={stageRef}
          className="absolute top-0 origin-top-left"
          style={{
            width: viewport.width,
            height: viewport.height,
            left: (boxWidth - viewport.width * scale) / 2,
            transform: `scale(${scale})`,
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={togglePlay} aria-label={playing ? 'Pause the recording' : 'Play the recording'}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {playing ? 'Pause' : 'Play'}
        </Button>
        <input
          type="range"
          min={0}
          max={meta.totalTime}
          step={100}
          value={time}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Recording time"
          aria-valuetext={clock}
          className="min-w-40 flex-1 accent-primary"
        />
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{clock}</span>
        <SegmentedFilter
          label="Playback speed"
          value={speed}
          onChange={setSpeed}
          items={SPEEDS.map((value) => ({ value, label: `${value}x` }))}
        />
        <div className="flex items-center gap-2">
          <Switch id={switchId} checked={skipIdle} onCheckedChange={setSkipIdle} />
          <Label htmlFor={switchId}>Skip idle time</Label>
        </div>
      </div>
    </div>
  )
}

export default function SessionPlayer(props: PlayerProps) {
  if (!props.events.some((event) => event.type === EventType.FullSnapshot)) {
    return <EmptyState>This session has no screen recording. Only the event timeline is available.</EmptyState>
  }
  return <Player {...props} />
}
