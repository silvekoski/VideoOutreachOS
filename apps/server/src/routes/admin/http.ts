import type { ApiError } from '@mergero/shared'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'
import { DomainError } from '../../domain/errors.ts'
import { log } from '../../log.ts'
import { sendFile } from '../../http/send-file.ts'
import type { SendFileOptions } from '../../http/send-file.ts'
import { ProviderError } from '../../providers/errors.ts'

const ID_PATTERN = /^[1-9]\d{0,15}$/u
const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json\b/iu

export function parseId(value: string | undefined, what: string): number {
  const id = value !== undefined && ID_PATTERN.test(value) ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(id)) throw new DomainError(400, `The ${what} must be a positive whole number`)
  return id
}

export function parseInput<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const issues = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
  const first = issues[0]
  const where = first?.path ? `${first.path}: ` : ''
  throw new DomainError(400, `The ${what} is not valid. ${where}${first?.message ?? 'Check the values.'}`, issues)
}

export async function readJson<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  if (!JSON_TYPE.test(c.req.header('Content-Type') ?? '')) throw new DomainError(400, 'The request body must be JSON')
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new DomainError(400, 'The request body must be JSON')
  }
  return parseInput(schema, body, 'request body')
}

function apiError(error: string, detail?: unknown): ApiError {
  return detail === undefined ? { error } : { error, detail }
}

export function errorResponse(error: unknown, c: Context): Response {
  if (error instanceof DomainError) return c.json(apiError(error.message, error.detail), error.status)
  if (error instanceof HTTPException) return c.json(apiError(error.message || 'The request failed'), error.status)
  if (error instanceof ProviderError) {
    log.warn('provider request failed', { method: c.req.method, path: c.req.path, provider: error.provider, error })
    return c.json(apiError(error.message), 502)
  }
  log.error('admin request failed', { method: c.req.method, path: c.req.path, error })
  return c.json(apiError('The server could not complete the request. Check the server log.'), 500)
}

export async function sendExistingFile(c: Context, file: string, options: SendFileOptions): Promise<Response> {
  const response = await sendFile(c, file, options)
  if (!response) throw new DomainError(404, 'The file does not exist')
  return response
}
