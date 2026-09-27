import path from 'node:path'
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { getMimeType } from 'hono/utils/mime'
import { adminDocument } from './pages.ts'
import { sendFile } from '../http/send-file.ts'
import type { AssetTags } from './vite.ts'

const ADMIN_PATHS = ['/', '/deals', '/deals/:id{[0-9]+}', '/deals/:id{[0-9]+}/review', '/metrics'] as const
const ASSET_NAME = /^[\w.-]+$/u
const IMMUTABLE = 'public, max-age=31536000, immutable'

export const denyFraming: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('X-Frame-Options', 'DENY')
  const policy = c.res.headers.get('Content-Security-Policy')
  c.header('Content-Security-Policy', policy ? `${policy}; frame-ancestors 'none'` : "frame-ancestors 'none'")
}

export function createHtmlRoutes(options: { assets: AssetTags; distDir: string }): Hono {
  const app = new Hono()
  const assetsDir = path.join(options.distDir, 'assets')

  for (const route of ADMIN_PATHS) {
    app.get(route, denyFraming, (c) => {
      c.header('Cache-Control', 'no-store')
      return c.html(adminDocument(options.assets('admin')))
    })
  }

  app.get('/assets/:file', async (c) => {
    const name = c.req.param('file')
    if (!ASSET_NAME.test(name) || name.startsWith('.')) return c.notFound()
    const response = await sendFile(c, path.join(assetsDir, name), {
      contentType: getMimeType(name) ?? 'application/octet-stream',
      cacheControl: IMMUTABLE,
    })
    return response ?? c.notFound()
  })

  return app
}
