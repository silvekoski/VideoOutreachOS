import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANGUAGES } from '@mergero/shared'
import { STRINGS } from '@mergero/shared/i18n'
import { HttpError, bookedMeetingAt, isConflict, pageUrl, requestJson } from '../../src/video/api.ts'

const MEETING_AT = '2026-09-28T06:30:00.000Z'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isConflict', () => {
  it('is true only for an HTTP 409', () => {
    expect(isConflict(new HttpError(409))).toBe(true)
    expect(isConflict(new HttpError(502))).toBe(false)
    expect(isConflict(new TypeError('Failed to fetch'))).toBe(false)
  })
})

describe('requestJson', () => {
  it('keeps the detail of a JSON error body', async () => {
    const body = { error: 'A meeting is already booked', detail: { meetingAt: MEETING_AT } }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body, { status: 409 })))
    const error = await requestJson('/v/code/book', { method: 'POST', body: {} }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 409, detail: { meetingAt: MEETING_AT } })
  })

  it('gives no detail when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<p>Bad gateway</p>', { status: 502 })))
    const error = await requestJson('/v/code/book').catch((caught: unknown) => caught)
    expect(error).toMatchObject({ status: 502, detail: undefined })
  })
})

describe('bookedMeetingAt', () => {
  it('gives the existing meeting only for a 409 with a meeting time', () => {
    expect(bookedMeetingAt(new HttpError(409, { meetingAt: MEETING_AT }))).toBe(MEETING_AT)
    expect(bookedMeetingAt(new HttpError(409))).toBeNull()
    expect(bookedMeetingAt(new HttpError(409, [{ path: 'start', message: 'Invalid' }]))).toBeNull()
    expect(bookedMeetingAt(new HttpError(409, { meetingAt: 42 }))).toBeNull()
    expect(bookedMeetingAt(new HttpError(400, { meetingAt: MEETING_AT }))).toBeNull()
    expect(bookedMeetingAt(new TypeError('Failed to fetch'))).toBeNull()
  })

  it('has a page message in each language that is not the own booking and not the missing times', () => {
    for (const lang of LANGUAGES) {
      const page = STRINGS[lang].page
      expect(page.alreadyBooked, lang).toContain('{date}')
      expect(page.alreadyBooked, lang).toContain('{analyst}')
      expect(page.alreadyBooked, lang).not.toBe(page.booked)
      expect(page.alreadyBooked, lang).not.toBe(page.noSlots)
    }
  })
})

describe('pageUrl', () => {
  it('adds preview=1 only in preview mode', () => {
    expect(pageUrl('AbCdEfGhIjKlMnOpQrStUv', 'form')).toBe('/v/AbCdEfGhIjKlMnOpQrStUv/form')
    expect(pageUrl('AbCdEfGhIjKlMnOpQrStUv', 'book', true)).toBe('/v/AbCdEfGhIjKlMnOpQrStUv/book?preview=1')
  })
})
