import { useEffect, useRef } from 'react'
import { Circle, Mic, RotateCcw, Square, Video } from 'lucide-react'
import type { MediaRecorderControls, RecorderKind } from '@/hooks/use-media-recorder'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatClock } from '../lib/format'

interface RecorderPanelProps {
  kind: RecorderKind
  controls: MediaRecorderControls
}

function LivePreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      aria-label="Camera preview"
      className="aspect-video w-full rounded-lg bg-black object-cover [transform:scaleX(-1)]"
    />
  )
}

function announcement(controls: MediaRecorderControls): string {
  const remaining = Math.ceil(controls.maxS - controls.elapsedS)
  if (controls.state === 'recording') return remaining <= 10 ? `${remaining} seconds left` : 'Recording'
  if (controls.state === 'recorded')
    return controls.limitReached ? `Recording stopped at the ${controls.maxS} second limit` : 'Recording stopped'
  if (controls.state === 'ready') return 'Ready to record'
  if (controls.state === 'requesting') return 'Waiting for permission'
  return ''
}

export function RecorderPanel({ kind, controls }: RecorderPanelProps) {
  const { state, stream, recording, elapsedS, maxS, error } = controls
  const remaining = Math.max(0, maxS - elapsedS)
  const remainingBucket = state === 'recording' && remaining <= 10 ? Math.ceil(remaining) : null
  const device = kind === 'video' ? 'camera and microphone' : 'microphone'

  return (
    <div className="grid gap-3">
      <p aria-live="polite" className="sr-only">
        {remainingBucket !== null ? `${remainingBucket} seconds left` : announcement(controls)}
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {stream && kind === 'video' && state !== 'recorded' ? <LivePreview stream={stream} /> : null}
      {recording && state === 'recorded' ? (
        kind === 'video' ? (
          <video src={recording.url} controls playsInline aria-label="Your recording" className="aspect-video w-full rounded-lg bg-black" />
        ) : (
          <audio src={recording.url} controls aria-label="Your recording" className="w-full" />
        )
      ) : null}
      {stream && kind === 'audio' && state !== 'recorded' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mic aria-hidden="true" className="size-4" />
          The microphone is on.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {state === 'idle' || state === 'error' ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void controls.open()}>
            {kind === 'video' ? <Video aria-hidden="true" /> : <Mic aria-hidden="true" />}
            {`Turn on the ${device}`}
          </Button>
        ) : null}
        {state === 'requesting' ? <p className="text-sm text-muted-foreground">Waiting for permission.</p> : null}
        {state === 'ready' ? (
          <Button type="button" size="sm" onClick={controls.record}>
            <Circle aria-hidden="true" className="fill-current" />
            Start recording
          </Button>
        ) : null}
        {state === 'recording' ? (
          <>
            <Button type="button" size="sm" variant="destructive" onClick={controls.stop}>
              <Square aria-hidden="true" className="fill-current" />
              Stop
            </Button>
            <span role="timer" aria-live="off" className="font-mono text-sm tabular-nums">
              {`${formatClock(remaining)} left`}
            </span>
          </>
        ) : null}
        {state === 'recorded' ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                controls.discard()
                void controls.open()
              }}
            >
              <RotateCcw aria-hidden="true" />
              Record again
            </Button>
            {recording ? (
              <span className="text-sm text-muted-foreground">{`Length ${formatClock(recording.durationS)}`}</span>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{`Limit: ${formatClock(maxS)} (${maxS} s).`}</p>
    </div>
  )
}
