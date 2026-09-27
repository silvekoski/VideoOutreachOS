const formatters = new Map<string, Intl.DateTimeFormat>()

function parts(iso: string, timeZone: string | undefined): Record<string, string> | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const key = timeZone ?? ''
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    })
    formatters.set(key, formatter)
  }
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]))
}

export function formatDateTime(iso: string | null | undefined, timeZone?: string): string {
  const p = iso ? parts(iso, timeZone) : null
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` : 'No date'
}

export function formatZonedDateTime(iso: string | null | undefined, timeZone: string): string {
  const p = iso ? parts(iso, timeZone) : null
  return p ? `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} (${timeZone})` : 'No date'
}

export function timeZoneNote(timeZone: string): string {
  return `The times are in the time zone ${timeZone}.`
}

export function formatDate(iso: string | null | undefined, timeZone?: string): string {
  const p = iso ? parts(iso, timeZone) : null
  return p ? `${p.year}-${p.month}-${p.day}` : 'No date'
}

export function formatTime(iso: string | null | undefined, timeZone?: string): string {
  const p = iso ? parts(iso, timeZone) : null
  return p ? `${p.hour}:${p.minute}` : 'No time'
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return 'No data'
  return `${(Math.round(rate * 1000) / 10).toString()} %`
}

export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '0:00'
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function lastDaysRange(today: Date, days: number): { from: string; to: string } {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))
  return { from: localDay(from), to: localDay(today) }
}

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function isValidRange(from: string, to: string): boolean {
  return ISO_DAY.test(from) && ISO_DAY.test(to) && from <= to
}

export function pluralize(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}
