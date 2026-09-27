import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderKind = 'video' | 'audio'
export type RecorderState = 'idle' | 'requesting' | 'ready' | 'recording' | 'recorded' | 'error'

export interface Recording {
  blob: Blob
  url: string
  mimeType: string
  durationS: number
}

export interface MediaRecorderControls {
  state: RecorderState
  stream: MediaStream | null
  recording: Recording | null
  elapsedS: number
  maxS: number
  error: string | null
  limitReached: boolean
  open: () => Promise<void>
  record: () => void
  stop: () => void
  discard: () => void
  close: () => void
}

const MIME_TYPES: Record<RecorderKind, string[]> = {
  video: ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  audio: ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'],
}

export function pickMimeType(kind: RecorderKind, isSupported: (type: string) => boolean): string | null {
  return MIME_TYPES[kind].find((type) => isSupported(type)) ?? null
}

export function fileExtension(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim() ?? ''
  if (base.endsWith('/mp4')) return base.startsWith('audio') ? 'm4a' : 'mp4'
  if (base.endsWith('/ogg')) return 'ogg'
  return 'webm'
}

function deviceError(error: unknown, kind: RecorderKind): string {
  const device = kind === 'video' ? 'camera and microphone' : 'microphone'
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      return `The browser blocked the ${device}. Allow access in the site settings, or upload a file.`
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return `No ${device} found. Upload a file instead.`
    if (error.name === 'NotReadableError') return `Another app uses the ${device}. Close it and try again.`
  }
  return `Could not start the ${device}. Upload a file instead.`
}

type Ref<T> = { current: T }

function clearTimer(ref: Ref<ReturnType<typeof setInterval> | null>): void {
  if (ref.current !== null) clearInterval(ref.current)
  ref.current = null
}

function revoke(ref: Ref<string | null>): void {
  if (ref.current !== null) URL.revokeObjectURL(ref.current)
  ref.current = null
}

export function useMediaRecorder(kind: RecorderKind, maxS: number): MediaRecorderControls {
  const [state, setState] = useState<RecorderState>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [elapsedS, setElapsedS] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const urlRef = useRef<string | null>(null)
  const sessionRef = useRef(0)

  const close = useCallback(() => {
    sessionRef.current += 1
    clearTimer(timerRef)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
    recorderRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setState((current) => (current === 'recorded' ? current : 'idle'))
  }, [])

  const open = useCallback(async () => {
    if (streamRef.current) {
      setState('ready')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser can record only on https or localhost. Upload a file instead.')
      setState('error')
      return
    }
    setError(null)
    setState('requesting')
    const session = sessionRef.current
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      })
      if (session !== sessionRef.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = media
      setStream(media)
      setState('ready')
    } catch (reason) {
      if (session !== sessionRef.current) return
      setError(deviceError(reason, kind))
      setState('error')
    }
  }, [kind])

  const stop = useCallback(() => {
    clearTimer(timerRef)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  const record = useCallback(() => {
    const media = streamRef.current
    if (!media) return
    const mimeType = pickMimeType(kind, (type) => MediaRecorder.isTypeSupported(type))
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
    } catch {
      setError('This browser cannot record this media type. Upload a file instead.')
      setState('error')
      return
    }
    const chunks: Blob[] = []
    const started = performance.now()
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      clearTimer(timerRef)
      const type = recorder.mimeType || mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm')
      const blob = new Blob(chunks, { type })
      revoke(urlRef)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      const durationS = Math.min(maxS, (performance.now() - started) / 1000)
      setRecording({ blob, url, mimeType: type, durationS })
      setElapsedS(durationS)
      setState(blob.size > 0 ? 'recorded' : 'error')
      if (blob.size === 0) setError('The recording is empty. Try again.')
    }
    recorderRef.current = recorder
    revoke(urlRef)
    setRecording(null)
    setElapsedS(0)
    setLimitReached(false)
    setError(null)
    recorder.start(1000)
    setState('recording')
    timerRef.current = setInterval(() => {
      const elapsed = (performance.now() - started) / 1000
      setElapsedS(Math.min(elapsed, maxS))
      if (elapsed >= maxS) {
        setLimitReached(true)
        clearTimer(timerRef)
        if (recorder.state !== 'inactive') recorder.stop()
      }
    }, 250)
  }, [kind, maxS])

  const discard = useCallback(() => {
    revoke(urlRef)
    setRecording(null)
    setElapsedS(0)
    setLimitReached(false)
    setState(streamRef.current ? 'ready' : 'idle')
  }, [])

  useEffect(
    () => () => {
      sessionRef.current += 1
      clearTimer(timerRef)
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      revoke(urlRef)
    },
    [],
  )

  return { state, stream, recording, elapsedS, maxS, error, limitReached, open, record, stop, discard, close }
}
