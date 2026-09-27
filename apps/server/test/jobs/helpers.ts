import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { MgxBuyer, MgxClosedDeal } from '@mergero/shared'
import type { Db } from '../../src/db/index.ts'
import { env } from '../../src/env.ts'
import type { JobContext, SceneRenderer } from '../../src/jobs/types.ts'
import { paths } from '../../src/paths.ts'
import { FakeModel } from '../../src/providers/model-fake.ts'
import { FakePipedriveClient } from '../../src/providers/pipedrive-fake.ts'
import type {
  ChatJsonRequest,
  FinancialsClient,
  FinancialsRecord,
  LanguageModelClient,
  MgxClient,
  Providers,
  ScrapePageResult,
  ScraperClient,
  SpeechClient,
  SpeechRequest,
} from '../../src/providers/types.ts'

const run = promisify(execFile)

export async function ffmpeg(args: string[]): Promise<void> {
  await run(env.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args])
}

export async function toneMp3(file: string, seconds: number, frequency = 440): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await ffmpeg([
    '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=44100:duration=${seconds}`,
    '-c:a', 'libmp3lame', '-b:a', '128k', file,
  ])
}

export async function testVideo(file: string, seconds: number, options: { audio?: boolean; size?: string } = {}): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const audio = options.audio ?? true
  await ffmpeg([
    '-f', 'lavfi', '-i', `testsrc2=size=${options.size ?? '640x360'}:rate=30:duration=${seconds}`,
    '-f', 'lavfi', '-i', audio ? `sine=frequency=330:sample_rate=48000:duration=${seconds}` : 'anullsrc=r=48000:cl=stereo',
    '-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file,
  ])
}

export async function testPng(size = '1440x900'): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mergero-png-'))
  try {
    const file = path.join(dir, 'page.png')
    await ffmpeg(['-f', 'lavfi', '-i', `testsrc2=size=${size}:duration=1`, '-frames:v', '1', file])
    return await readFile(file)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export class StubScraper implements ScraperClient {
  readonly mode = 'fake' as const
  readonly calls: { kind: 'home' | 'markdown'; url: string; country: string | undefined }[] = []
  readonly pages: Record<string, ScrapePageResult | Error>

  constructor(pages: Record<string, ScrapePageResult | Error> = {}) {
    this.pages = pages
  }

  async scrapeHome(url: string, country?: string): Promise<ScrapePageResult> {
    this.calls.push({ kind: 'home', url, country })
    return this.#page(url)
  }

  async scrapeMarkdown(url: string, country?: string): Promise<ScrapePageResult> {
    this.calls.push({ kind: 'markdown', url, country })
    return this.#page(url)
  }

  #page(url: string): ScrapePageResult {
    const page = this.pages[url]
    if (!page) throw new Error(`No stub page for ${url}`)
    if (page instanceof Error) throw page
    return page
  }
}

export class StubMgx implements MgxClient {
  featured: MgxBuyer[] = []
  countryFeatured: MgxBuyer[] | null = null
  buyers: MgxBuyer[] = []
  sectorDeals: MgxClosedDeal[] = []
  recentDeals: MgxClosedDeal[] = []
  readonly calls: { tool: string; input: object }[] = []

  async searchBuyers(input: { nace?: string; country?: string }): Promise<MgxBuyer[]> {
    this.calls.push({ tool: 'search_buyers', input })
    if (input.nace !== undefined) return this.buyers
    return input.country === undefined ? this.featured : (this.countryFeatured ?? this.featured)
  }

  async listClosedDeals(input: { nace?: string }): Promise<MgxClosedDeal[]> {
    this.calls.push({ tool: 'list_closed_deals', input })
    return input.nace === undefined ? this.recentDeals : this.sectorDeals
  }

  async submitForm(): Promise<{ receiptId: string }> {
    return { receiptId: 'MGX-TEST' }
  }

  async close(): Promise<void> {}
}

export class StubFinancials implements FinancialsClient {
  readonly records = new Map<string, FinancialsRecord>()

  async get(businessId: string): Promise<FinancialsRecord | null> {
    return this.records.get(businessId) ?? null
  }
}

export class ScriptedModel implements LanguageModelClient {
  readonly mode = 'real' as const
  readonly requests: ChatJsonRequest[] = []
  readonly answers: ((request: ChatJsonRequest) => unknown)[] = []
  readonly #fake = new FakeModel()

  async completeJson(request: ChatJsonRequest): Promise<unknown> {
    this.requests.push(request)
    const answer = this.answers.shift()
    return answer ? answer(request) : this.#fake.completeJson(request)
  }
}

export class ToneSpeech implements SpeechClient {
  readonly mode = 'fake' as const
  readonly requests: SpeechRequest[] = []
  readonly failures: Error[] = []
  seconds = 0.8

  async synthesize(request: SpeechRequest): Promise<Buffer> {
    this.requests.push(request)
    const failure = this.failures.shift()
    if (failure) throw failure
    const dir = await mkdtemp(path.join(tmpdir(), 'mergero-tone-'))
    try {
      const file = path.join(dir, 'tone.mp3')
      await toneMp3(file, this.seconds)
      return await readFile(file)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  async cloneVoice(name: string): Promise<{ voiceId: string }> {
    return { voiceId: `voice-${name.toLowerCase().replace(/\s+/gu, '-')}` }
  }
}

export const PIPEDRIVE_SEED = {
  users: [{ id: 10, name: 'Aino Analyst', email: 'aino@mergero.test', active: true }],
  organizations: [
    { id: 20, name: 'Acme Oy', website: 'https://acme.test/', countryCode: 'FI', businessId: '1234567-8', nace: '25.62' },
  ],
  persons: [
    { id: 30, name: 'Matti Meikäläinen', firstName: 'Matti', jobTitle: 'CEO', email: 'matti@acme.test', phone: null, orgId: 20 },
  ],
  deals: [
    { id: 100, title: 'Acme Oy', ownerId: 10, personId: 30, orgId: 20, stage: null, status: 'open', videoUrl: null },
    { id: 101, title: 'Beta Ab', ownerId: 10, personId: null, orgId: null, stage: null, status: 'open', videoUrl: null },
  ],
  activities: [],
  notes: [],
}

let pipedriveStores = 0

export async function fakePipedrive(seed: object = PIPEDRIVE_SEED): Promise<{ client: FakePipedriveClient; file: string }> {
  pipedriveStores++
  const dir = path.join(paths.root, 'pipedrive', String(pipedriveStores))
  await mkdir(dir, { recursive: true })
  const seedFile = path.join(dir, 'seed.json')
  await writeFile(seedFile, JSON.stringify(seed))
  const file = path.join(dir, 'store.json')
  return { client: new FakePipedriveClient({ file, seedFile }), file }
}

export interface TestContext extends JobContext {
  clock: { now: Date }
  stub: { scraper: StubScraper; mgx: StubMgx; financials: StubFinancials }
}

const notStubbed = (name: string) => async () => {
  throw new Error(`${name} is not stubbed in this test`)
}

export function makeContext(
  db: Db,
  options: { providers?: Partial<Providers>; scene?: Partial<SceneRenderer>; now?: Date } = {},
): TestContext {
  const stub = { scraper: new StubScraper(), mgx: new StubMgx(), financials: new StubFinancials() }
  const clock = { now: options.now ?? new Date() }
  const providers: Providers = {
    pipedrive: new FakePipedriveClient({ file: path.join(paths.root, 'unused-pipedrive.json'), seedFile: path.join(paths.root, 'missing-seed.json') }),
    scraper: stub.scraper,
    model: new FakeModel(),
    speech: new ToneSpeech(),
    mgx: stub.mgx,
    financials: stub.financials,
    linkedin: { get: async () => null },
    ...options.providers,
  }
  return {
    db,
    providers,
    scene: {
      renderTimeline: notStubbed('renderTimeline'),
      renderTemplatePreviews: notStubbed('renderTemplatePreviews'),
      ...options.scene,
    },
    now: () => clock.now,
    sleep: async () => undefined,
    clock,
    stub,
  }
}

export interface LogoServer {
  url: string
  requests: string[]
  close: () => Promise<void>
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>Logo</title><rect width="10" height="10"/></svg>'

export async function startLogoServer(): Promise<LogoServer> {
  const requests: string[] = []
  const server = http.createServer((req, res) => {
    requests.push(req.url ?? '')
    if (req.url?.endsWith('.svg') && !req.url.includes('missing')) {
      res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(SVG)
    } else if (req.url?.endsWith('.html')) {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!DOCTYPE html><title>Page</title>')
    } else {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

export function page(url: string, markdown: string, extra: Partial<ScrapePageResult> = {}): ScrapePageResult {
  return { url, markdown, links: [], screenshotPng: null, language: null, statusCode: 200, ...extra }
}
