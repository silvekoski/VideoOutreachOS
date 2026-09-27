import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { AnalystDto, DealDetailDto } from '../packages/shared/src/api-types.ts'
import type { Lang } from '../packages/shared/src/types.ts'
import { STATE_ENV, adminClient, waitFor } from './stack.ts'
import type { AdminClient, DealKey, E2eDeal, E2eState } from './stack.ts'

const REPO = path.resolve(import.meta.dirname, '..')
const SEED_MGX_ORIGIN = 'http://localhost:3100'
const DEALS: Record<DealKey, number> = { de: 4007, ch: 4009, fi: 4001 }
const INTROS: { analyst: number; lang: Lang; transcript: string }[] = [
  { analyst: 1001, lang: 'fi', transcript: 'Hei, olen Linnea Aaltonen Mergerosta. Katso tämä lyhyt video.' },
  { analyst: 1002, lang: 'de', transcript: 'Hallo, ich bin Jonas Weber von Mergero. Sehen Sie sich dieses kurze Video an.' },
]
const MINIMAL_PDF = [
  '%PDF-1.4',
  '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj',
  'trailer << /Root 1 0 R >>',
  '%%EOF',
  '',
].join('\n')

interface Service {
  name: string
  child: ChildProcess
  exited: Promise<void>
}

function run(command: string, args: string[], what: string): void {
  const result = spawnSync(command, args, { cwd: REPO, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${what} failed:\n${result.stdout}\n${result.stderr}`)
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No free port'))))
    })
  })
}

function start(name: string, script: string, env: NodeJS.ProcessEnv, logDir: string): Service {
  const log = createWriteStream(path.join(logDir, `${name}.log`))
  const child = spawn(process.execPath, [path.join(REPO, script)], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.pipe(log)
  child.stderr?.pipe(log)
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return { name, child, exited }
}

async function stop(service: Service): Promise<void> {
  if (service.child.exitCode !== null || service.child.signalCode !== null) return
  service.child.kill('SIGTERM')
  const force = setTimeout(() => service.child.kill('SIGKILL'), 5000)
  await service.exited
  clearTimeout(force)
}

function assertRunning(services: Service[], logDir: string): void {
  const stopped = services.find((service) => service.child.exitCode !== null || service.child.signalCode !== null)
  if (stopped) throw new Error(`The ${stopped.name} process stopped. See ${path.join(logDir, `${stopped.name}.log`)}`)
}

async function reachable(url: string): Promise<boolean> {
  return fetch(url).then(
    (response) => response.ok,
    () => false,
  )
}

async function writeFakePipedrive(storageDir: string, mgxOrigin: string): Promise<void> {
  const seed = await readFile(path.join(REPO, 'seed', 'pipedrive.json'), 'utf8')
  await mkdir(path.join(storageDir, 'data'), { recursive: true })
  await writeFile(path.join(storageDir, 'data', 'fake-pipedrive.json'), seed.replaceAll(SEED_MGX_ORIGIN, mgxOrigin))
}

async function makeMedia(dir: string): Promise<{ intro: Blob; voice: Blob; consent: Blob }> {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
  const intro = path.join(dir, 'intro.mp4')
  const voice = path.join(dir, 'voice.mp3')
  const quiet = ['-hide_banner', '-loglevel', 'error', '-y']
  const introArgs = [
    ...['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=3'],
    ...['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3'],
    ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'],
  ]
  run(ffmpeg, [...quiet, ...introArgs, intro], 'The intro video')
  const voiceArgs = ['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=5', '-c:a', 'libmp3lame', '-b:a', '128k']
  run(ffmpeg, [...quiet, ...voiceArgs, voice], 'The voice sample')
  return {
    intro: new Blob([await readFile(intro)], { type: 'video/mp4' }),
    voice: new Blob([await readFile(voice)], { type: 'audio/mpeg' }),
    consent: new Blob([MINIMAL_PDF], { type: 'application/pdf' }),
  }
}

async function prepareAnalysts(admin: AdminClient, media: { intro: Blob; voice: Blob; consent: Blob }): Promise<void> {
  const consentDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  await admin.get('/api/analysts')
  for (const { analyst, lang, transcript } of INTROS) {
    const intro = new FormData()
    intro.set('file', media.intro, 'intro.mp4')
    intro.set('transcript', transcript)
    await admin.post(`/api/analysts/${analyst}/intros/${lang}`, intro)
    const voice = new FormData()
    voice.set('file', media.voice, 'voice.mp3')
    await admin.post(`/api/analysts/${analyst}/voice`, voice)
    const consent = new FormData()
    consent.set('file', media.consent, 'consent.pdf')
    consent.set('date', consentDate)
    await admin.post(`/api/analysts/${analyst}/consent`, consent)
  }
}

function analystsReady(analysts: AnalystDto[]): boolean {
  return INTROS.every(({ analyst, lang }) => {
    const row = analysts.find((item) => item.id === analyst)
    const intro = row?.intros.find((item) => item.language === lang)
    if (row?.voice.cloneStatus === 'failed' || intro?.status === 'failed') {
      throw new Error(`The intro or the voice clone of analyst ${analyst} failed`)
    }
    return row?.voice.cloneStatus === 'ready' && intro?.status === 'ready'
  })
}

async function publish(admin: AdminClient, id: number, services: Service[], logDir: string): Promise<E2eDeal> {
  await waitFor(
    async () => {
      assertRunning(services, logDir)
      const deal = await admin.get<DealDetailDto>(`/api/deals/${id}`)
      if (deal.status === 'failed' || deal.failedJobs.length > 0) {
        throw new Error(`Deal ${id} failed: ${JSON.stringify(deal.failedJobs)}. See ${logDir}`)
      }
      if (deal.status !== 'review' || deal.pipeline.running) return null
      if (deal.reviewReasons.length > 0) throw new Error(`Deal ${id} is blocked: ${JSON.stringify(deal.reviewReasons)}`)
      return deal
    },
    { what: `deal ${id} in review`, timeoutMs: 600_000 },
  )
  await admin.post(`/api/deals/${id}/approve`)
  const deal = await admin.get<DealDetailDto>(`/api/deals/${id}`)
  if (deal.link === null) throw new Error(`Deal ${id} is approved but not published: ${deal.status}`)
  return { id, code: new URL(deal.link).pathname.split('/').at(-1) ?? '', pageLanguage: deal.pageLanguage }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const started = Date.now()
  run('pnpm', ['--filter', '@mergero/web', 'build'], 'The web build')

  const storageDir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'mergero-e2e-')))
  const logDir = path.join(storageDir, 'logs')
  await mkdir(logDir, { recursive: true })
  const [apiPort, mgxPort] = [await freePort(), await freePort()]
  const baseUrl = `http://localhost:${apiPort}`
  const mgxOrigin = `http://localhost:${mgxPort}`
  await writeFakePipedrive(storageDir, mgxOrigin)

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    STORAGE_DIR: storageDir,
    PORT: String(apiPort),
    PUBLIC_BASE_URL: baseUrl,
    ADMIN_BASE_URL: baseUrl,
    ASIAKASTIETO_URL: `${baseUrl}/mock/asiakastieto`,
    MGX_MCP_URL: `${mgxOrigin}/mcp`,
    MGX_PORT: String(mgxPort),
    MGX_PUBLIC_URL: '',
    PIPEDRIVE_API_TOKEN: '',
    PIPEDRIVE_COMPANY_DOMAIN: '',
    FIRECRAWL_API_KEY: '',
    FEATHERLESS_API_KEY: '',
    ELEVENLABS_API_KEY: '',
  }
  const services = [
    start('mgx', 'apps/mgx-mock/src/main.ts', env, logDir),
    start('api', 'apps/server/src/api.ts', env, logDir),
    start('worker', 'apps/server/src/worker.ts', env, logDir),
  ]
  const stopAll = () => Promise.all(services.map(stop)).then(() => undefined)

  try {
    for (const url of [`${mgxOrigin}/health`, `${baseUrl}/api/status`]) {
      await waitFor(
        async () => {
          assertRunning(services, logDir)
          return reachable(url)
        },
        { what: url, timeoutMs: 30_000, intervalMs: 250 },
      )
    }
    const admin = adminClient(baseUrl)
    await prepareAnalysts(admin, await makeMedia(storageDir))
    await waitFor(
      async () => {
        assertRunning(services, logDir)
        return analystsReady(await admin.get<AnalystDto[]>('/api/analysts'))
      },
      { what: 'the intros and the voice clones', timeoutMs: 120_000 },
    )
    const keys = Object.keys(DEALS) as DealKey[]
    for (const key of keys) await admin.post(`/api/deals/${DEALS[key]}/ensure`)
    const deals: Partial<Record<DealKey, E2eDeal>> = {}
    for (const key of keys) deals[key] = await publish(admin, DEALS[key], services, logDir)
    const state: E2eState = { baseUrl, storageDir, deals: deals as Record<DealKey, E2eDeal> }
    const stateFile = path.join(storageDir, 'e2e-state.json')
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
    process.env[STATE_ENV] = stateFile
    console.log(`The e2e stack is ready at ${baseUrl} after ${Math.round((Date.now() - started) / 1000)} s`)
  } catch (error) {
    await stopAll()
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`The e2e setup failed: ${reason}\nThe logs are in ${logDir}.`, { cause: error })
  }

  return async () => {
    await stopAll()
    if (process.env.MERGERO_E2E_KEEP !== '1') await rm(storageDir, { recursive: true, force: true })
  }
}
