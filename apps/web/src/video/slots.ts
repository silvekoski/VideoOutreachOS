import type { SlotDto } from '@mergero/shared'

export interface SlotChoice {
  start: string
  label: string
}

export interface SlotDay {
  key: string
  label: string
  short: string
  slots: SlotChoice[]
}

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function groupSlotsByDay(slots: readonly SlotDto[], locale: string, timeZone?: string): SlotDay[] {
  const keyFormat = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const longFormat = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', day: 'numeric', month: 'long' })
  const shortFormat = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short', day: 'numeric', month: 'short' })
  const timeFormat = new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' })
  const starts = new Map<number, string>()
  for (const slot of slots) {
    const at = Date.parse(slot.start)
    if (Number.isFinite(at) && !starts.has(at)) starts.set(at, slot.start)
  }
  const days = new Map<string, SlotDay>()
  for (const [at, start] of [...starts].sort((a, b) => a[0] - b[0])) {
    const date = new Date(at)
    const parts = Object.fromEntries(keyFormat.formatToParts(date).map((part) => [part.type, part.value]))
    const key = `${parts.year}-${parts.month}-${parts.day}`
    let day = days.get(key)
    if (day === undefined) {
      day = { key, label: longFormat.format(date), short: shortFormat.format(date), slots: [] }
      days.set(key, day)
    }
    day.slots.push({ start, label: timeFormat.format(date) })
  }
  return [...days.values()]
}

export function formatMeeting(iso: string, locale: string, timeZone: string = viewerTimeZone()): string {
  const text = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
  return `${text} (${timeZone})`
}
