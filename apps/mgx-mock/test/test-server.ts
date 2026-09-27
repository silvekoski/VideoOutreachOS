import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadMgxSeed, type MgxSeed } from '../src/seed.ts'
import { createMgxServer } from '../src/server.ts'

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
export const seedDir = path.join(repoRoot, 'seed')

export interface TestServer {
  url: string
  port: number
  seed: MgxSeed
  storageDir: string
  close(): Promise<void>
}

export async function startTestServer(): Promise<TestServer> {
  const seed = await loadMgxSeed(path.join(seedDir, 'mgx.json'))
  const storageDir = await mkdtemp(path.join(os.tmpdir(), 'mgx-mock-'))
  const server = createMgxServer({ seed, seedDir, storageDir, publicUrl: null })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Server has no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    seed,
    storageDir,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
      await rm(storageDir, { recursive: true, force: true })
    },
  }
}
