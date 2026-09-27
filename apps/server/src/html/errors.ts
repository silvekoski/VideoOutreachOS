import { t } from '@mergero/shared'
import type { ApiError } from '@mergero/shared'
import type { Context, ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { DomainError } from '../domain/errors.ts'
import { log } from '../log.ts'
import { messagePage } from './pages.ts'

function wantsJson(c: Context): boolean {
  const { method, path } = c.req
  return (
    path === '/api' ||
    path.startsWith('/api/') ||
    (method !== 'GET' && method !== 'HEAD') ||
    (c.req.header('Accept') ?? '').includes('application/json')
  )
}

function pageText(status: number): { title: string; text: string } {
  const page = t('en').page
  if (status === 404) return { title: page.notFoundTitle, text: page.notFoundText }
  if (status === 410) return { title: page.expiredTitle, text: page.expiredText }
  if (status >= 500) {
    return { title: 'Something went wrong', text: 'Please try again later. If the problem continues, contact Mergero.' }
  }
  return { title: 'The request could not be completed', text: 'Please check the link and try again.' }
}

function respond(c: Context, status: ContentfulStatusCode, body: ApiError): Response {
  c.header('Cache-Control', 'no-store')
  if (wantsJson(c)) return c.json(body, status)
  return c.html(messagePage({ lang: 'en', ...pageText(status) }), status)
}

export const handleNotFound: NotFoundHandler = (c) => respond(c, 404, { error: 'Not found' })

export const handleError: ErrorHandler = (error, c) => {
  if (error instanceof DomainError) {
    return respond(c, error.status, error.detail === undefined ? { error: error.message } : { error: error.message, detail: error.detail })
  }
  if (error instanceof HTTPException) {
    return respond(c, error.status, { error: error.message || 'The request could not be completed' })
  }
  log.error('request failed', { method: c.req.method, path: c.req.path, error })
  return respond(c, 500, { error: 'Internal server error' })
}
