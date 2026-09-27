import path from 'node:path'
import { log } from './log.ts'
import { loadMgxSeed } from './seed.ts'
import { createMgxServer } from './server.ts'

const repoRoot = path.resolve(import.meta.dirname, '../../..')
const setting = (name: string): string | null => process.env[name]?.trim() || null

const port = Number(setting('MGX_PORT') ?? '3100')
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`MGX_PORT is not a valid port: ${process.env.MGX_PORT}`)
const publicUrl = setting('MGX_PUBLIC_URL')?.replace(/\/+$/, '') ?? null
if (publicUrl !== null && !URL.canParse(publicUrl)) throw new Error(`MGX_PUBLIC_URL is not a valid URL: ${publicUrl}`)
const seedDir = path.join(repoRoot, 'seed')
const storageDir = path.resolve(repoRoot, setting('STORAGE_DIR') ?? 'storage')

const server = createMgxServer({ seed: await loadMgxSeed(path.join(seedDir, 'mgx.json')), seedDir, storageDir, publicUrl })

server.on('error', (error) => {
  log.error('server error', { error })
  process.exit(1)
})

server.listen(port, '127.0.0.1', () => {
  const address = server.address()
  const url = `http://localhost:${typeof address === 'object' && address ? address.port : port}`
  log.info('listening', { mcp: `${url}/mcp`, sites: `${url}/sites/`, storageDir })
})

let stopping = false
function shutdown(signal: NodeJS.Signals): void {
  if (stopping) return
  stopping = true
  log.info('shutting down', { signal })
  server.close((error) => process.exit(error ? 1 : 0))
  setTimeout(() => server.closeAllConnections(), 5000).unref()
}
process.on('SIGINT', shutdown).on('SIGTERM', shutdown)
