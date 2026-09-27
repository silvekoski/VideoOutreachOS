import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const PUBLIC_BASE_URL = 'https://video.mergero.test'

const PROVIDER_KEYS = ['PIPEDRIVE_API_TOKEN', 'FIRECRAWL_API_KEY', 'FEATHERLESS_API_KEY', 'ELEVENLABS_API_KEY']

export function useTempStorage(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mergero-admin-'))
  process.env.STORAGE_DIR = dir
  process.env.PUBLIC_BASE_URL = PUBLIC_BASE_URL
  for (const key of PROVIDER_KEYS) delete process.env[key]
  return dir
}
