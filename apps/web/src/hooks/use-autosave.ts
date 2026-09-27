import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface Autosave<T> {
  draft: T
  status: SaveStatus
  error: string | null
  change: (value: T) => void
  flush: () => void
}

interface Options<T> {
  delayMs?: number
  equals?: (a: T, b: T) => boolean
}

export function useAutosave<T>(
  serverValue: T,
  save: (value: T) => Promise<unknown>,
  { delayMs = 1000, equals = Object.is }: Options<T> = {},
): Autosave<T> {
  const [draft, setDraft] = useState(serverValue)
  const [base, setBase] = useState(serverValue)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const draftRef = useRef(serverValue)
  const editRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  const pendingRef = useRef(false)

  useEffect(() => {
    saveRef.current = save
  }, [save])

  if (!equals(serverValue, base)) {
    setBase(serverValue)
    if (!dirty) setDraft(serverValue)
  }

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!pendingRef.current) return
    pendingRef.current = false
    const edit = editRef.current
    setStatus('saving')
    setError(null)
    saveRef.current(draftRef.current).then(
      () => {
        if (editRef.current === edit) setDirty(false)
        setStatus('saved')
      },
      (reason: unknown) => {
        pendingRef.current = true
        setStatus('error')
        setError(reason instanceof Error ? reason.message : 'The change was not saved.')
      },
    )
  }, [])

  const change = useCallback(
    (value: T) => {
      draftRef.current = value
      editRef.current += 1
      pendingRef.current = true
      setDraft(value)
      setDirty(true)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, delayMs)
    },
    [delayMs, flush],
  )

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      if (pendingRef.current) void saveRef.current(draftRef.current).catch(() => undefined)
    },
    [],
  )

  return { draft, status, error, change, flush }
}
