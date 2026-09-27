import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../../..')

function str(name: string, fallback: string): string {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : value
}

function optional(name: string): string | null {
  const value = process.env[name]
  return value === undefined || value === '' ? null : value
}

const port = Number(str('PORT', '3000'))
const publicBaseUrl = str('PUBLIC_BASE_URL', `http://localhost:${port}`).replace(/\/+$/, '')

const production = process.env.NODE_ENV === 'production'

export const env = {
  repoRoot,
  production,
  devBypass: !production && process.env.DEV_BYPASS === '1',
  port,
  publicBaseUrl,
  adminBaseUrl: str('ADMIN_BASE_URL', publicBaseUrl).replace(/\/+$/, ''),
  storageDir: path.resolve(repoRoot, str('STORAGE_DIR', 'storage')),
  pipedriveToken: optional('PIPEDRIVE_API_TOKEN'),
  pipedriveDomain: optional('PIPEDRIVE_COMPANY_DOMAIN'),
  firecrawlKey: optional('FIRECRAWL_API_KEY'),
  featherlessKey: optional('FEATHERLESS_API_KEY'),
  elevenlabsKey: optional('ELEVENLABS_API_KEY'),
  elevenlabsModel: str('ELEVENLABS_MODEL', 'eleven_v3'),
  mgxUrl: str('MGX_MCP_URL', 'http://localhost:3100/mcp'),
  asiakastietoUrl: str('ASIAKASTIETO_URL', `${publicBaseUrl}/mock/asiakastieto`).replace(/\/+$/, ''),
  viteDevUrl: str('VITE_DEV_URL', 'http://localhost:5173').replace(/\/+$/, ''),
  chromePath: str('CHROME_PATH', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  ffmpegPath: str('FFMPEG_PATH', 'ffmpeg'),
  ffprobePath: str('FFPROBE_PATH', 'ffprobe'),
  webDistDir: path.resolve(repoRoot, 'apps/web/dist'),
  configDir: path.resolve(repoRoot, 'config'),
  seedDir: path.resolve(repoRoot, 'seed'),
}

export type Env = typeof env
