import { describe, expect, it } from 'vitest'
import {
  analystPatchSchema,
  bookSchema,
  briefOutputJsonSchema,
  eventBatchSchema,
  formSubmitSchema,
  linesOutputJsonSchema,
  reviewPatchSchema,
  scriptOutputJsonSchema,
} from '../src/schemas.ts'

const event = (seq: number) => ({ seq, type: 'play', at: '2026-09-26T10:00:00.000Z', slide: 1, vt: 0 })
const batch = (overrides: Record<string, unknown> = {}) => ({
  sessionId: '0b6f3c1e-8f5a-4b8e-9a0e-2f1d3c4b5a69',
  session: { channel: 'whatsapp', device: 'mobile', browser: 'Safari', os: 'iOS', screen: '390x844', version: 2 },
  events: [event(0), { ...event(1), type: 'field_value', slide: null, vt: null, data: { field: 'revenue' } }],
  ...overrides,
})

describe('eventBatchSchema', () => {
  it('accepts a valid batch', () => {
    expect(eventBatchSchema.safeParse(batch()).success).toBe(true)
  })

  it('accepts 500 events and rejects 501', () => {
    expect(eventBatchSchema.safeParse(batch({ events: Array.from({ length: 500 }, (_, i) => event(i)) })).success).toBe(true)
    expect(eventBatchSchema.safeParse(batch({ events: Array.from({ length: 501 }, (_, i) => event(i)) })).success).toBe(false)
  })

  it.each([
    ['a negative sequence number', { events: [event(-1)] }],
    ['a fractional sequence number', { events: [event(1.5)] }],
    ['an unknown event type', { events: [{ ...event(0), type: 'hack' }] }],
    ['slide 9', { events: [{ ...event(0), slide: 9 }] }],
    ['an infinite video time', { events: [{ ...event(0), vt: Number.POSITIVE_INFINITY }] }],
    ['a bad time', { events: [{ ...event(0), at: 'yesterday' }] }],
    ['a long data value', { events: [{ ...event(0), data: { a: 'x'.repeat(1001) } }] }],
    ['too many data keys', { events: [{ ...event(0), data: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, i])) }] }],
    ['a bad session ID', { sessionId: 'abc' }],
    ['a long browser name', { session: { ...batch().session, browser: 'b'.repeat(65) } }],
    ['a bad screen size', { session: { ...batch().session, screen: 'big' } }],
    ['an unknown channel', { session: { ...batch().session, channel: 'fax' } }],
    ['no video version', { session: { ...batch().session, version: undefined } }],
    ['video version 0', { session: { ...batch().session, version: 0 } }],
    ['a fractional video version', { session: { ...batch().session, version: 1.5 } }],
  ])('rejects %s', (_, overrides) => {
    expect(eventBatchSchema.safeParse(batch(overrides)).success).toBe(false)
  })
})

describe('formSubmitSchema', () => {
  const body = {
    revenue: { kind: 'range', min: 1_000_000, max: 3_000_000 },
    profit: { kind: 'exact', value: 610_000 },
    staff: '20-49',
    timing: 'within_12_months',
    notInterestedReason: null,
    custom: [{ questionId: 'q1', answer: '  My son  ' }],
    message: null,
  }

  it('accepts a valid body and trims free text', () => {
    const result = formSubmitSchema.parse(body)
    expect(result.custom[0]?.answer).toBe('My son')
  })

  it('accepts open ranges and the loss range', () => {
    expect(formSubmitSchema.safeParse({ ...body, revenue: { kind: 'range', min: 50_000_000, max: null } }).success).toBe(true)
    expect(formSubmitSchema.safeParse({ ...body, profit: { kind: 'range', min: null, max: 0 } }).success).toBe(true)
  })

  it.each([
    ['min above max', { revenue: { kind: 'range', min: 3, max: 1 } }],
    ['a range without bounds', { revenue: { kind: 'range', min: null, max: null } }],
    ['a zero exact value', { profit: { kind: 'exact', value: 0 } }],
    ['a negative bound', { revenue: { kind: 'range', min: -1, max: 1 } }],
    ['an infinite value', { profit: { kind: 'exact', value: Number.POSITIVE_INFINITY } }],
    ['an unknown staff range', { staff: '10-20' }],
    ['a message over 2000 characters', { message: 'm'.repeat(2001) }],
    ['an answer over 2000 characters', { custom: [{ questionId: 'q1', answer: 'a'.repeat(2001) }] }],
  ])('rejects %s', (_, overrides) => {
    expect(formSubmitSchema.safeParse({ ...body, ...overrides }).success).toBe(false)
  })
})

describe('bookSchema', () => {
  it('accepts a start time and an optional email', () => {
    expect(bookSchema.parse({ start: '2026-09-28T06:00:00.000Z', email: 'owner@example.fi' }).email).toBe('owner@example.fi')
    expect(bookSchema.parse({ start: '2026-09-28T09:00:00+03:00', email: ' ' }).email).toBeNull()
    expect(bookSchema.parse({ start: '2026-09-28T06:00:00.000Z', email: null }).email).toBeNull()
  })

  it('rejects a bad email or time', () => {
    expect(bookSchema.safeParse({ start: '2026-09-28T06:00:00.000Z', email: 'nope' }).success).toBe(false)
    expect(bookSchema.safeParse({ start: 'monday', email: null }).success).toBe(false)
  })
})

describe('reviewPatchSchema', () => {
  it('accepts scripts of slides 2 to 8 and valid fields', () => {
    const patch = { scripts: { 2: 'Uusi teksti' }, lines: ['a', 'b', 'c'], expiryDays: 30, pageLanguage: 'sv' }
    expect(reviewPatchSchema.parse(patch)).toEqual(patch)
  })

  it.each([
    ['a script for slide 1', { scripts: { 1: 'x' } }],
    ['four lines', { lines: ['a', 'b', 'c', 'd'] }],
    ['expiry 0', { expiryDays: 0 }],
    ['expiry 366', { expiryDays: 366 }],
    ['an unknown language', { pageLanguage: 'fr' }],
    ['an empty custom question', { customQuestions: [{ id: 'q1', text: ' ' }] }],
  ])('rejects %s', (_, patch) => {
    expect(reviewPatchSchema.safeParse(patch).success).toBe(false)
  })
})

describe('analystPatchSchema', () => {
  it('accepts IANA time zones', () => {
    expect(analystPatchSchema.safeParse({ timeZone: 'Europe/Helsinki', briefLanguage: 'de' }).success).toBe(true)
    expect(analystPatchSchema.safeParse({ timeZone: 'America/Argentina/Buenos_Aires' }).success).toBe(true)
    expect(analystPatchSchema.safeParse({ timeZone: 'UTC' }).success).toBe(true)
  })

  it('rejects abbreviations, unknown zones and bad values', () => {
    expect(analystPatchSchema.safeParse({ timeZone: 'EET' }).success).toBe(false)
    expect(analystPatchSchema.safeParse({ timeZone: 'Mars/Base' }).success).toBe(false)
    expect(analystPatchSchema.safeParse({ defaultSecondChannel: 'direct' }).success).toBe(false)
    expect(analystPatchSchema.safeParse({ defaultExpiryDays: 1.5 }).success).toBe(false)
  })
})

describe('model output JSON Schemas', () => {
  it('describe the three outputs', () => {
    expect(scriptOutputJsonSchema).toMatchObject({ type: 'object', required: ['script'], additionalProperties: false })
    expect(linesOutputJsonSchema).toMatchObject({
      properties: { lines: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string', maxLength: 90 } } },
    })
    expect(briefOutputJsonSchema).toMatchObject({
      required: ['summary', 'questions'],
      properties: { questions: { minItems: 3, maxItems: 5 } },
    })
  })
})
