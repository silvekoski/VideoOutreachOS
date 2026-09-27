import type {
  AudioStatus,
  BuyerSlideItem,
  DealSnapshot,
  Lang,
  ScrapeResult,
  ScriptSlideNumber,
  Segment,
  Timeline,
} from '@mergero/shared'
import { nowIso, sql } from '../../src/db/index.ts'
import type { Db } from '../../src/db/index.ts'
import type { AnalystIntro, AnalystRow, DealPatch, DealRow } from '../../src/db/rows.ts'
import { requireAnalyst } from '../../src/domain/analysts.ts'
import { newLinkCode, requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { claimNext, completeJob } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'

export const T0 = new Date('2026-09-26T12:00:00.000Z')
export const later = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000)

export const ANALYST_ID = 10
export const DEAL_ID = 100

export const BUYERS: BuyerSlideItem[] = [
  { id: 'b1', name: 'Nordic Industrial Partners', focus: 'Buys metal workshops', website: 'https://nip.test', logoFile: 'cache/logos/b1.png' },
  { id: 'b2', name: 'Baltic Growth Fund', focus: 'Invests in family firms', website: null, logoFile: null },
  { id: 'b3', name: 'Helsinki Holding', focus: 'Buys industrial service firms', website: 'https://hh.test', logoFile: 'cache/logos/b3.png' },
]

export const SCRAPE_OK: ScrapeResult = {
  ok: true,
  reason: null,
  error: null,
  homeUrl: 'https://acme.test/',
  pageUrls: ['https://acme.test/meista'],
  words: 420,
  markdown: '# Acme Oy\n\nAcme makes steel parts for ships.',
  siteLanguage: 'fi',
  screenshot: true,
  scrapedAt: T0.toISOString(),
}

export const SCRAPE_FAILED: ScrapeResult = {
  ...SCRAPE_OK,
  ok: false,
  reason: 'too_few_words',
  words: 40,
  markdown: 'Welcome',
}

export function readyIntroFor(lang: Lang = 'fi'): AnalystIntro {
  return {
    file: `analysts/${ANALYST_ID}/intro-${lang}.mp4`,
    durationS: 31.2,
    recordedAt: '2026-09-20T09:00:00.000Z',
    transcript: 'Hei, olen Aino Mergerosta.',
    status: 'ready',
  }
}

export function insertAnalyst(
  db: Db,
  options: { id?: number; name?: string; intros?: Partial<Record<Lang, AnalystIntro>>; voiceId?: string | null } = {},
): AnalystRow {
  const id = options.id ?? ANALYST_ID
  const at = nowIso(T0)
  sql(
    db,
    'INSERT INTO analysts (id, name, email, intros, voice_id, clone_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    options.name ?? 'Aino Analyst',
    'aino@mergero.test',
    JSON.stringify(options.intros ?? { fi: readyIntroFor('fi') }),
    options.voiceId === undefined ? 'voice-aino' : options.voiceId,
    options.voiceId === null ? 'none' : 'ready',
    at,
    at,
  )
  return requireAnalyst(db, id)
}

export function snapshot(dealId: number = DEAL_ID): DealSnapshot {
  return {
    pipedriveDealId: dealId,
    title: 'Acme Oy',
    company: 'Acme Oy',
    website: 'https://acme.test/',
    businessId: '1234567-8',
    nace: '25.62',
    country: 'FI',
    ownerName: 'Matti Meikäläinen',
    ownerFirstName: 'Matti',
    ownerRole: 'CEO',
    ownerEmail: 'matti@acme.test',
    ownerPhone: '+358 40 123 4567',
    personId: 30,
    orgId: 20,
    staffCount: 46,
    linkedinLanguages: ['fi', 'en'],
    readAt: T0.toISOString(),
  }
}

export function insertDeal(
  db: Db,
  options: { id?: number; analystId?: number; language?: Lang; patch?: DealPatch } = {},
): DealRow {
  const id = options.id ?? DEAL_ID
  const language = options.language ?? 'fi'
  const at = nowIso(T0)
  sql(
    db,
    `INSERT INTO deals (id, analyst_id, status, link_code, language, page_language, country, snapshot, expiry_days, created_at, updated_at)
     VALUES (?, ?, 'draft', ?, ?, ?, 'FI', ?, 30, ?, ?)`,
  ).run(id, options.analystId ?? ANALYST_ID, newLinkCode(), language, language, JSON.stringify(snapshot(id)), at, at)
  return options.patch ? updateDeal(db, id, options.patch, T0) : requireDeal(db, id)
}

export interface TimelineOptions {
  version?: number
  language?: Lang
  audio?: AudioStatus
  scripts?: Partial<Record<ScriptSlideNumber, string>>
  lines?: string[]
  linesSource?: 'model' | 'analyst' | null
  buyers?: BuyerSlideItem[]
}

export function makeTimeline(dealId: number = DEAL_ID, options: TimelineOptions = {}): Timeline {
  const version = options.version ?? 1
  const status = options.audio ?? 'missing'
  const slide = (n: ScriptSlideNumber, variables: Extract<Segment, { slide: ScriptSlideNumber }>['variables']): Segment => ({
    slide: n,
    template: variables.template,
    variables,
    labels: {},
    script: options.scripts?.[n] ?? `Script of slide ${n}.`,
    scriptSource: 'model',
    audio: {
      file: status === 'ok' ? `deals/${dealId}/audio/slide-${n}.v${version}.mp3` : null,
      durationS: status === 'ok' ? 12 : null,
      status,
      error: null,
    },
    durationS: null,
    startS: null,
    endS: null,
  }) as Segment
  return {
    dealId,
    version,
    language: options.language ?? 'fi',
    fps: 30,
    width: 1920,
    height: 1080,
    pauseS: 0.4,
    segments: [
      {
        slide: 1,
        template: 'facecam',
        variables: { template: 'facecam', videoFile: '', analystName: 'Aino Analyst', transcript: 'Hei, olen Aino Mergerosta.' },
        labels: {},
        durationS: 0,
        startS: null,
        endS: null,
      },
      slide(2, { template: 'who-we-are', buyers: [], deals: [], buyerCount: 2200 }),
      slide(3, {
        template: 'your-company',
        company: 'Acme Oy',
        website: 'https://acme.test/',
        lines: options.lines ?? ['Acme makes steel parts.', 'It has 46 staff.', 'It sells to ship yards.'],
        linesSource: options.linesSource === undefined ? 'model' : options.linesSource,
        screenshotFile: `deals/${dealId}/screenshot.png`,
      }),
      slide(4, { template: 'your-figures', mode: 'ask', calculator: false }),
      slide(5, { template: 'buyers', buyers: options.buyers ?? BUYERS }),
      slide(6, { template: 'what-is-possible', deals: [] }),
      slide(7, { template: 'privacy' }),
      slide(8, { template: 'book-meeting', analystName: 'Aino Analyst', company: 'Acme Oy' }),
    ],
  }
}

export const SLIDE_TIMES = [
  { slide: 1, startS: 0, endS: 31.2 },
  { slide: 2, startS: 31.2, endS: 43.6 },
  { slide: 3, startS: 43.6, endS: 56 },
  { slide: 4, startS: 56, endS: 68.4 },
  { slide: 5, startS: 68.4, endS: 80.8 },
  { slide: 6, startS: 80.8, endS: 93.2 },
  { slide: 7, startS: 93.2, endS: 105.6 },
  { slide: 8, startS: 105.6, endS: 118 },
] as const

export function claimAll(db: Db, now: Date): AnyJob[] {
  const jobs: AnyJob[] = []
  for (let job = claimNext(db, now); job; job = claimNext(db, now)) jobs.push(job)
  return jobs
}

export function claim(db: Db, type: AnyJob['type'], now: Date): AnyJob {
  for (let job = claimNext(db, now); job; job = claimNext(db, now)) {
    if (job.type === 'pipedrive-write' && type !== 'pipedrive-write') {
      completeJob(db, job.id, now)
      continue
    }
    if (job.type !== type) throw new Error(`Claimed ${job.type}, expected ${type}`)
    return job
  }
  throw new Error(`No due job, expected ${type}`)
}

export function finish(db: Db, job: AnyJob, now: Date): void {
  if (!completeJob(db, job.id, now)) throw new Error(`Job ${job.id} was not running`)
}
