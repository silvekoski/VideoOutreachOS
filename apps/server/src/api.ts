import path from 'node:path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { closeDb, getDb } from './db/index.ts'
import { syncAnalysts } from './domain/analysts.ts'
import { env } from './env.ts'
import { handleError, handleNotFound } from './html/errors.ts'
import { createHtmlRoutes } from './html/routes.ts'
import { viteAssets } from './html/vite.ts'
import { log } from './log.ts'
import { createProviders } from './providers/index.ts'
import { adminRoutes, configureAdmin } from './routes/admin/index.ts'
import { createMockRoutes } from './routes/mock/index.ts'
import { createVideoRoutes } from './routes/video/index.ts'

const SHUTDOWN_GRACE_MS = 5000

const assets = viteAssets({ production: env.production, devUrl: env.viteDevUrl, distDir: env.webDistDir })
if (env.production) {
  try {
    assets('admin')
    assets('video')
  } catch (error) {
    log.error('the web build is missing, the API does not start', { error })
    process.exit(1)
  }
}

const db = getDb()
const providers = createProviders()
configureAdmin({ db, providers })

const app = new Hono()
app.use('*', async (c, next) => {
  const started = performance.now()
  await next()
  log.info('request', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms: Math.round(performance.now() - started),
  })
})
app.route('/', adminRoutes)
app.route(
  '/',
  createVideoRoutes({ db, mgx: providers.mgx, storageDir: env.storageDir, publicBaseUrl: env.publicBaseUrl, assets }),
)
app.route('/', createMockRoutes(path.join(env.seedDir, 'asiakastieto.json')))
app.route('/', createHtmlRoutes({ assets, distDir: env.webDistDir }))
app.notFound(handleNotFound)
app.onError(handleError)

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  log.info('api listening', { port: info.port, publicBaseUrl: env.publicBaseUrl, production: env.production })
})
server.on('error', (error) => {
  log.error('the API server failed', { error })
  process.exit(1)
})

syncAnalysts(db, providers.pipedrive)
  .then((analysts) => log.info('analysts synced', { count: analysts.length }))
  .catch((error: unknown) => log.error('the analyst sync failed, the API keeps running', { error }))

let stopping = false

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) {
    log.warn('second stop signal, the API exits now', { signal })
    process.exit(1)
  }
  stopping = true
  log.info('api stopping', { signal })
  const force = setTimeout(() => {
    if ('closeAllConnections' in server) server.closeAllConnections()
  }, SHUTDOWN_GRACE_MS)
  force.unref()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  clearTimeout(force)
  await providers.mgx.close().catch((error: unknown) => log.warn('the MGX client did not close cleanly', { error }))
  closeDb()
  log.info('api stopped')
  process.exit(0)
}

process.on('SIGTERM', (signal) => void shutdown(signal))
process.on('SIGINT', (signal) => void shutdown(signal))
