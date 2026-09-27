import { ADMIN_REQUEST_HEADER } from '@mergero/shared'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { DomainError } from '../../domain/errors.ts'
import { env } from '../../env.ts'
import { analystRoutes } from './analysts.ts'
import { captionRoutes } from './captions.ts'
import { dealRoutes } from './deals.ts'
import { errorResponse } from './http.ts'
import { inboxRoutes } from './inbox.ts'
import { reportRoutes } from './reports.ts'
import { jsonBodyLimit } from './uploads.ts'

export { configureAdmin } from './context.ts'
export type { AdminOptions, AdminProviders } from './context.ts'

const LOCAL_HOST = /^(?:(?:[^.]+\.)*localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:.]+\])$/iu
const READ_METHODS = new Set(['GET', 'HEAD'])

export function allowedAdminHost(hostname: string, adminBaseUrl: string = env.adminBaseUrl): boolean {
  return LOCAL_HOST.test(hostname) || hostname === new URL(adminBaseUrl).hostname
}

function sameOrigin(c: Context): boolean {
  const site = c.req.header('Sec-Fetch-Site')
  if (site !== undefined) return site === 'same-origin'
  const origin = c.req.header('Origin')
  return origin === undefined || origin === new URL(c.req.url).origin
}

async function adminGuard(c: Context, next: Next): Promise<void> {
  if (!allowedAdminHost(new URL(c.req.url).hostname)) {
    throw new HTTPException(403, { message: 'The admin API answers only on localhost, an IP address or the host of ADMIN_BASE_URL' })
  }
  if (!READ_METHODS.has(c.req.method) && (c.req.header(ADMIN_REQUEST_HEADER) !== '1' || !sameOrigin(c))) {
    throw new HTTPException(403, { message: 'The admin API accepts changes only from the admin panel' })
  }
  await next()
}

export const adminRoutes = new Hono()

adminRoutes.onError(errorResponse)
adminRoutes.use('/api/*', adminGuard)
adminRoutes.use('/api/*', jsonBodyLimit)
adminRoutes.route('/api', analystRoutes)
adminRoutes.route('/api', dealRoutes)
adminRoutes.route('/api', captionRoutes)
adminRoutes.route('/api', inboxRoutes)
adminRoutes.route('/api', reportRoutes)
adminRoutes.all('/api/*', () => {
  throw new DomainError(404, 'The API has no such route')
})
