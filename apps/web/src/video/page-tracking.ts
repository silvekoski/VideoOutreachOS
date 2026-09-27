import type { Recorder } from './recorder.ts'

const SCROLL_THROTTLE_MS = 1000
const SCROLL_STEP = 5
const TAP_REPEAT_MS = 100

function hasValue(element: EventTarget | null): boolean {
  if (element instanceof HTMLInputElement) {
    return element.type === 'radio' || element.type === 'checkbox' ? element.checked : element.value.trim() !== ''
  }
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return element.value.trim() !== ''
  return false
}

function fieldName(element: EventTarget | null): string | null {
  return element instanceof HTMLElement ? (element.dataset.field ?? null) : null
}

export function trackPage(recorder: Recorder, win: Window): () => void {
  const doc = win.document
  const filled = new Set<string>()
  let lastDepth: number | null = null
  let scrollTimer: number | null = null
  let lastTap = { target: '', at: 0 }

  function depth(): number {
    const height = doc.documentElement.scrollHeight
    if (height <= 0) return 100
    return Math.min(100, Math.max(0, Math.round(((win.scrollY + win.innerHeight) / height) * 100)))
  }

  function onScroll(): void {
    if (scrollTimer !== null) return
    scrollTimer = win.setTimeout(() => {
      scrollTimer = null
      const value = depth()
      if (lastDepth !== null && Math.abs(value - lastDepth) < SCROLL_STEP) return
      lastDepth = value
      recorder.record('scroll', { data: { depth: value } })
    }, SCROLL_THROTTLE_MS)
  }

  function onClick(event: MouseEvent): void {
    const element = event.target instanceof Element ? event.target : null
    const target =
      element?.closest<HTMLElement>('[data-track]')?.dataset.track ??
      element?.closest<HTMLElement>('[data-region]')?.dataset.region ??
      'page'
    const at = event.timeStamp
    if (target === lastTap.target && at - lastTap.at < TAP_REPEAT_MS) return
    lastTap = { target, at }
    recorder.record('tap', { data: { target } })
  }

  function onFocus(event: FocusEvent): void {
    const field = fieldName(event.target)
    if (field !== null) recorder.record('field_focus', { data: { field } })
  }

  function onInput(event: Event): void {
    const field = fieldName(event.target)
    if (field === null) return
    if (!hasValue(event.target)) {
      filled.delete(field)
    } else if (!filled.has(field)) {
      filled.add(field)
      recorder.record('field_value', { data: { field } })
    }
  }

  function onVisibility(): void {
    if (doc.visibilityState === 'hidden') recorder.hide()
  }

  win.addEventListener('scroll', onScroll, { passive: true })
  doc.addEventListener('click', onClick, true)
  doc.addEventListener('focusin', onFocus)
  doc.addEventListener('input', onInput)
  doc.addEventListener('change', onInput)
  doc.addEventListener('visibilitychange', onVisibility)
  return () => {
    if (scrollTimer !== null) win.clearTimeout(scrollTimer)
    win.removeEventListener('scroll', onScroll)
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('focusin', onFocus)
    doc.removeEventListener('input', onInput)
    doc.removeEventListener('change', onInput)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}
