const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const DAY_MS = 86_400_000

export function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

export function addDaysToDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }
const TIME_OPTIONS: Intl.DateTimeFormatOptions = { ...DATE_OPTIONS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }

function zonedParts(at: Date | string, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const format = (zone: string) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone }).formatToParts(new Date(at))
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = format(timeZone)
  } catch {
    parts = format('UTC')
  }
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

export function localDate(at: Date | string, timeZone: string): string {
  const p = zonedParts(at, timeZone, DATE_OPTIONS)
  return `${p.year}-${p.month}-${p.day}`
}

export function localDateTime(at: Date | string, timeZone: string): string {
  const p = zonedParts(at, timeZone, TIME_OPTIONS)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} (${timeZone})`
}
