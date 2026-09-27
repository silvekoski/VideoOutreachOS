export interface LocalDate {
  year: number
  month: number
  day: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, format)
  }
  return format
}

function wallClockMs(instant: number, timeZone: string): number {
  const parts = new Map<string, number>()
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') parts.set(part.type, Number(part.value))
  }
  const get = (type: string) => parts.get(type) ?? 0
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function localDate(date: Date, timeZone: string): LocalDate {
  const wall = new Date(wallClockMs(date.getTime(), timeZone))
  return { year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1, day: wall.getUTCDate() }
}

export function localDay(date: Date, timeZone: string): string {
  const { year, month, day } = localDate(date, timeZone)
  return `${year}-${pad(month)}-${pad(day)}`
}

export function shiftDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }
}

export function weekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
}

export function zonedTime(date: LocalDate, minuteOfDay: number, timeZone: string): Date {
  const wall = Date.UTC(date.year, date.month - 1, date.day, 0, minuteOfDay)
  const guess = wall - (wallClockMs(wall, timeZone) - wall)
  return new Date(wall - (wallClockMs(guess, timeZone) - guess))
}
