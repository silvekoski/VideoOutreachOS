import { removeStorage } from './storage-env.ts'
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import { renderTemplatePreviews, renderTimeline } from '@mergero/scene'
import type { MgxBuyer, SlideSegment } from '@mergero/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { requireDeal } from '../../src/domain/deals.ts'
import { advance, approveDeal } from '../../src/domain/pipeline.ts'
import { newestTimeline } from '../../src/domain/timelines.ts'
import { env } from '../../src/env.ts'
import { runJob } from '../../src/jobs/runner.ts'
import { probeDurationS } from '../../src/media/ffmpeg.ts'
import { paths } from '../../src/paths.ts'
import { FakeSpeech } from '../../src/providers/speech-fake.ts'
import { claimNext } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { ANALYST_ID, DEAL_ID, T0, insertAnalyst, insertDeal, readyIntroFor } from '../domain/fixtures.ts'
import { fakePipedrive, makeContext, page, startLogoServer, testPng, testVideo } from './helpers.ts'
import type { LogoServer, TestContext } from './helpers.ts'

const run = promisify(execFile)

const TEXT =
  'Acme Oy valmistaa teräsosia ja hitsattuja rakenteita laivanrakennukseen ja konepajateollisuuteen Turussa. ' +
  'Yrityksen ammattilaiset hoitavat koneistuksen, hitsauksen ja kokoonpanon omassa tehtaassaan. ' +
  'Asiakkaat ovat suomalaisia ja ruotsalaisia telakoita sekä koneiden valmistajia, jotka arvostavat laatua ja toimitusvarmuutta. '

let t: TempDb
let ctx: TestContext
let logos: LogoServer
let storeFile: string

beforeAll(async () => {
  logos = await startLogoServer()
  t = tempDb()
  const pipedrive = await fakePipedrive()
  storeFile = pipedrive.file
  ctx = makeContext(t.db, {
    now: T0,
    providers: { pipedrive: pipedrive.client, speech: new FakeSpeech() },
    scene: { renderTimeline, renderTemplatePreviews },
  })

  await testVideo(paths.intro(ANALYST_ID, 'fi'), 2, { size: '1280x720' })
  const introS = await probeDurationS(paths.intro(ANALYST_ID, 'fi'))
  insertAnalyst(t.db, { intros: { fi: { ...readyIntroFor('fi'), durationS: introS } } })
  insertDeal(t.db)

  ctx.stub.scraper.pages['https://acme.test/'] = page('https://acme.test/', `# Acme Oy\n\n${TEXT.repeat(3)}`, {
    links: ['https://acme.test/tuotteet', 'https://acme.test/meista/'],
    screenshotPng: await testPng(),
    language: 'fi-FI',
  })
  ctx.stub.scraper.pages['https://acme.test/meista/'] = page('https://acme.test/meista/', `# Meistä\n\n${TEXT.repeat(4)}`)
  ctx.stub.financials.records.set('1234567-8', { businessId: '1234567-8', revenue: 7_450_000, profit: 980_000, fiscalYear: 2025 })
  const buyer = (id: string, name: string, focus: string): MgxBuyer => ({
    id,
    name,
    focus,
    logoUrl: `${logos.url}/${id}.svg`,
    website: `https://${id}.example`,
    namePublic: true,
  })
  ctx.stub.mgx.featured = [buyer('f1', 'Nordic Industrial Partners', 'Buys industrial companies'), buyer('f2', 'Baltic Growth', 'Invests in family firms')]
  ctx.stub.mgx.buyers = [
    buyer('b1', 'Konepaja Holding', 'Buys machining workshops in Finland'),
    buyer('b2', 'Steel Group Nordic', 'Buys metal subcontractors with 20 to 100 staff'),
    { ...buyer('b3', 'Hidden Buyer', 'Buys anything'), namePublic: false },
  ]
  ctx.stub.mgx.recentDeals = [{ id: 'r1', year: 2025, country: 'SE', nace: '28.12', text: 'A Swedish hydraulics maker found a buyer.', profitMultiple: 5 }]
  ctx.stub.mgx.sectorDeals = [{ id: 's1', year: 2024, country: 'FI', nace: '25.62', text: 'A Finnish machining firm joined a Nordic group.', profitMultiple: 6 }]
}, 60_000)

afterAll(async () => {
  t?.close()
  await logos?.close()
  removeStorage()
})

async function runAll(): Promise<AnyJob[]> {
  const jobs: AnyJob[] = []
  for (let job = claimNext(t.db, ctx.now()); job; job = claimNext(t.db, ctx.now())) {
    await runJob(ctx, job)
    jobs.push(job)
  }
  return jobs
}

async function streams(file: string): Promise<string> {
  const { stdout } = await run(env.ffprobePath, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', file])
  return stdout.trim()
}

describe('pipeline end to end with the fake providers and the real scene', () => {
  it('scrapes, writes, speaks and renders a fixture deal, then publishes it after approval', async () => {
    advance(t.db, DEAL_ID, T0)
    const jobs = await runAll()

    expect(jobs.map((job) => job.type)).toEqual(['scrape', 'write-script', 'audio', 'render'])
    const deal = requireDeal(t.db, DEAL_ID)
    expect(deal).toMatchObject({ status: 'review', reviewReasons: [], language: 'fi', scrape: { ok: true } })

    const row = newestTimeline(t.db, DEAL_ID)
    expect(row).toMatchObject({ version: 1, renderStatus: 'rendered', approvedAt: null })
    const slides = row?.timeline.segments.filter((segment): segment is SlideSegment => segment.template !== 'facecam') ?? []
    expect(slides.map((segment) => segment.audio.status)).toEqual(Array(7).fill('ok'))
    for (const segment of row?.timeline.segments ?? []) {
      expect(segment.startS).not.toBeNull()
      expect(segment.endS).toBeGreaterThan(segment.startS ?? 0)
    }

    const video1080 = paths.video1080(DEAL_ID, 1)
    const video720 = paths.video720(DEAL_ID, 1)
    expect(await streams(video1080)).toBe('h264,1920,1080\naac')
    expect(await streams(video720)).toBe('h264,1280,720\naac')
    expect((await stat(paths.poster(DEAL_ID, 1))).size).toBeGreaterThan(0)
    const lastEndS = row?.timeline.segments.at(-1)?.endS ?? 0
    expect(Math.abs((await probeDurationS(video1080)) - lastEndS)).toBeLessThan(0.1)

    approveDeal(t.db, DEAL_ID, T0)
    expect(requireDeal(t.db, DEAL_ID)).toMatchObject({ status: 'link_sent', publishedVersion: 1 })
    expect((await runAll()).map((job) => job.type)).toEqual(['pipedrive-write'])
    const store = JSON.parse(await readFile(storeFile, 'utf8')) as { deals: { id: number; stage: string | null }[] }
    expect(store.deals.find((item) => item.id === DEAL_ID)?.stage).toBe('link_sent')
  }, 300_000)
})
