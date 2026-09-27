import { z } from 'zod'
import type { AnalystPatch, BookBody, ContactPatch, FormSubmitBody, ReviewPatch, VoiceIdBody } from './api-types.ts'
import {
  CHANNELS,
  LANGUAGES,
  PAGE_EVENT_TYPES,
  PLAYER_EVENT_TYPES,
  SALE_TIMINGS,
  STAFF_RANGES,
} from './types.ts'
import type { EventBatch, RecordingChunk } from './types.ts'

const MAX_EVENTS = 500
const MAX_RECORDING_EVENTS = 20_000
const MAX_DATA_KEYS = 32
const MAX_FREE_TEXT = 2000
const MAX_AMOUNT = 1e12

const slideNumber = z.literal([1, 2, 3, 4, 5, 6, 7, 8])
const freeText = z.string().trim().max(MAX_FREE_TEXT)
const isoTime = z.iso.datetime({ offset: true })

const eventData = z
  .record(z.string().max(64), z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]))
  .refine((data) => Object.keys(data).length <= MAX_DATA_KEYS, `at most ${MAX_DATA_KEYS} data keys`)

const clientEvent = z.object({
  seq: z.int().min(0),
  type: z.enum([...PLAYER_EVENT_TYPES, ...PAGE_EVENT_TYPES]),
  at: isoTime,
  slide: slideNumber.nullable(),
  vt: z.number().min(0).max(86_400).nullable(),
  data: eventData.optional(),
})

const sessionInfo = z.object({
  channel: z.enum([...CHANNELS, 'direct']),
  device: z.enum(['mobile', 'tablet', 'desktop']),
  browser: z.string().trim().max(64),
  os: z.string().trim().max(64),
  screen: z.string().regex(/^\d{1,5}x\d{1,5}$/u),
  version: z.int().min(1),
})

export const eventBatchSchema = z.object({
  sessionId: z.uuid(),
  session: sessionInfo,
  events: z.array(clientEvent).max(MAX_EVENTS),
}) satisfies z.ZodType<EventBatch>

export const recordingChunkSchema = z.object({
  sessionId: z.uuid(),
  session: sessionInfo,
  part: z.int().min(0).max(1_000_000),
  events: z
    .array(z.looseObject({ type: z.int().min(0).max(99), timestamp: z.int().min(0) }))
    .min(1)
    .max(MAX_RECORDING_EVENTS),
}) satisfies z.ZodType<RecordingChunk>

const money = z.number().min(0).max(MAX_AMOUNT)

const amount = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('range'), min: money.nullable(), max: money.nullable() })
    .refine((r) => r.min !== null || r.max !== null, 'a range needs a minimum or a maximum')
    .refine((r) => r.min === null || r.max === null || r.min <= r.max, 'the minimum must not be above the maximum'),
  z.object({ kind: z.literal('exact'), value: money.positive() }),
])

export const formSubmitSchema = z.object({
  revenue: amount.nullable(),
  profit: amount.nullable(),
  staff: z.enum(STAFF_RANGES).nullable(),
  timing: z.enum(SALE_TIMINGS).nullable(),
  notInterestedReason: freeText.nullable(),
  custom: z.array(z.object({ questionId: z.string().min(1).max(64), answer: freeText })).max(20),
  message: freeText.nullable(),
}) satisfies z.ZodType<FormSubmitBody>

export const bookSchema = z.object({
  start: isoTime,
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.email().max(254).nullable(),
  ),
}) satisfies z.ZodType<BookBody>

const days = z.int().min(1).max(365)

export const MAX_SLIDE_BUYERS = 6

export const reviewPatchSchema = z.object({
  scripts: z.partialRecord(z.enum(['2', '3', '4', '5', '6', '7', '8']), z.string().max(MAX_FREE_TEXT)).optional(),
  lines: z.array(z.string().trim().max(300)).max(3).optional(),
  removedBuyers: z.array(z.string().min(1).max(128)).max(200).optional(),
  buyerIds: z
    .array(z.string().min(1).max(128))
    .max(MAX_SLIDE_BUYERS)
    .refine((ids) => new Set(ids).size === ids.length, 'Each buyer can be on the slide once')
    .optional(),
  customQuestions: z
    .array(z.object({ id: z.string().min(1).max(64), text: z.string().trim().min(1).max(500) }))
    .max(10)
    .optional(),
  expiryDays: days.optional(),
  pageLanguage: z.enum(LANGUAGES).optional(),
}) satisfies z.ZodType<ReviewPatch>

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional()

export const contactPatchSchema = z.object({
  company: z.string().trim().min(1).max(200).optional(),
  website: optionalText(300),
  businessId: optionalText(64),
  nace: optionalText(8).refine((value) => !value || /^\d{2}(?:\.\d{1,2})?$/u.test(value), 'expected a NACE code like 25.62'),
  ownerName: z.string().trim().min(1).max(200).optional(),
  ownerRole: optionalText(100),
  ownerEmail: optionalText(200).refine((value) => !value || z.email().safeParse(value).success, 'expected an email address'),
  ownerPhone: optionalText(50),
}) satisfies z.ZodType<ContactPatch>

export function isTimeZone(value: string): boolean {
  if (value !== 'UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/u.test(value)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const analystPatchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  defaultExpiryDays: days.optional(),
  defaultSecondChannel: z.enum(CHANNELS).optional(),
  briefLanguage: z.enum(LANGUAGES).optional(),
  timeZone: z.string().max(64).refine(isTimeZone, 'expected an IANA time zone, for example Europe/Helsinki').optional(),
}) satisfies z.ZodType<AnalystPatch>

export const voiceIdBodySchema = z.object({
  voiceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,64}$/u, 'expected an ElevenLabs voice ID, for example 21m00Tcm4TlvDq8ikWAM')
    .nullable(),
}) satisfies z.ZodType<VoiceIdBody>

export const scriptOutputSchema = z.object({ script: z.string().min(1) })

export const linesOutputSchema = z.object({
  lines: z.array(z.string()).length(3),
})

export const briefOutputSchema = z.object({
  summary: z.string().min(1),
  questions: z.array(z.string().min(1)).min(3).max(5),
})

export const outreachOutputSchema = z.object({
  subject: z.string(),
  message: z.string().min(1),
})

export const translationsOutputSchema = z.object({
  texts: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })),
})

const jsonSchema = (schema: z.ZodType): Record<string, unknown> => z.toJSONSchema(schema, { target: 'draft-7' })

export const scriptOutputJsonSchema = jsonSchema(scriptOutputSchema)
export const linesOutputJsonSchema = jsonSchema(linesOutputSchema)
export const briefOutputJsonSchema = jsonSchema(briefOutputSchema)
export const outreachOutputJsonSchema = jsonSchema(outreachOutputSchema)
export const translationsOutputJsonSchema = jsonSchema(translationsOutputSchema)
