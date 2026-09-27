import { removeStorage } from './storage-env.ts'
import { stat } from 'node:fs/promises'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getDeal, updateDeal } from '../../src/domain/deals.ts'
import { advance } from '../../src/domain/pipeline.ts'
import { createVersion } from '../../src/domain/timelines.ts'
import { runJob } from '../../src/jobs/runner.ts'
import { normalizeWebsite, rankCompanyPages } from '../../src/jobs/scrape.ts'
import { paths } from '../../src/paths.ts'
import { ScrapeError } from '../../src/providers/errors.ts'
import { claimNext, enqueue, getJob, jobKeys, jobsForDeal } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, SCRAPE_FAILED, T0, insertAnalyst, insertDeal, makeTimeline, snapshot } from '../domain/fixtures.ts'
import { makeContext, page, testPng } from './helpers.ts'
import type { TestContext } from './helpers.ts'

const FINNISH =
  'Acme Oy valmistaa teräsosia ja hitsattuja rakenteita laivanrakennukseen ja konepajateollisuuteen Turussa. ' +
  'Yrityksen ammattilaiset hoitavat koneistuksen, hitsauksen ja kokoonpanon omassa tehtaassaan. ' +
  'Asiakkaat ovat suomalaisia ja ruotsalaisia telakoita sekä koneiden valmistajia, jotka arvostavat laatua ja toimitusvarmuutta. '

const HOME_TEXT = `# Acme Oy\n\n${FINNISH.repeat(3)}`
const ABOUT_TEXT = `# Meistä\n\n${FINNISH.repeat(4)}`

let png: Buffer
let t: TempDb
let ctx: TestContext

beforeAll(async () => {
  png = await testPng()
})

afterAll(removeStorage)

beforeEach(() => {
  t = tempDb()
  ctx = makeContext(t.db, { now: T0 })
  insertAnalyst(t.db)
  insertDeal(t.db)
})

afterEach(() => t.close())

function claim(): AnyJob {
  const job = claimNext(t.db, ctx.now())
  if (!job) throw new Error('No due job')
  return job
}

async function runScrape(): Promise<AnyJob> {
  advance(t.db, DEAL_ID, ctx.now())
  const job = claim()
  expect(job.type).toBe('scrape')
  await runJob(ctx, job)
  return getJob(t.db, job.id) as AnyJob
}

function writeScriptJobs() {
  return jobsForDeal(t.db, DEAL_ID, ['write-script'])
}

const pickAboutPage = (home: string, links: string[]) => rankCompanyPages(home, links, 'Acme Oy')[0] ?? null

describe('rankCompanyPages', () => {
  it('picks the about page of a site under a sub path', () => {
    const home = 'https://acme.fi/fi/'
    const links = [home, `${home}#palvelut`, 'mailto:myynti@acme.fi', `${home}meista/`, 'data:,']
    expect(pickAboutPage(home, links)).toBe(`${home}meista/`)
  })

  it('prefers a page in the site language over a foreign language path and accepts www', () => {
    expect(pickAboutPage('https://acme.fi/', ['https://acme.fi/en/about-us', 'https://www.acme.fi/meista/'])).toBe(
      'https://www.acme.fi/meista/',
    )
  })

  it('prefers the shallow page and ignores other hosts and files', () => {
    const links = [
      'https://other.de/ueber-uns/',
      'https://acme.de/ueber-uns.pdf',
      'https://acme.de/ueber-uns/team',
      'https://acme.de/unternehmen/geschichte',
      'https://acme.de/ueber-uns/',
    ]
    expect(pickAboutPage('https://acme.de/', links)).toBe('https://acme.de/ueber-uns/')
  })

  it('matches a path word inside a longer segment and resolves relative links', () => {
    expect(pickAboutPage('https://acme.se/start', ['produkter', 'om-oss-och-historia', '/kontakt'])).toBe(
      'https://acme.se/om-oss-och-historia',
    )
    expect(pickAboutPage('https://acme.dk/', ['/om-os/', '/om/'])).toBe('https://acme.dk/om-os/')
  })

  it('returns null without an about link', () => {
    expect(pickAboutPage('https://acme.fi/', ['https://acme.fi/', 'https://acme.fi/tuotteet', 'https://acme.fi/#top'])).toBeNull()
  })

  it('ranks top-level pages named after the company below the about page and ignores legal forms', () => {
    const links = ['/rekrytointi/', '/ahlskog-air-cargo/', '/oy/', '/uutiset/ahlskog-messuilla', '/ahlskog-transport/', '/meista/', '/yhteystiedot/']
    expect(rankCompanyPages('https://ahlskog.fi/', links, 'Ab Ahlskog Transport - Kuljetus Oy')).toEqual([
      'https://ahlskog.fi/meista/',
      'https://ahlskog.fi/ahlskog-air-cargo/',
      'https://ahlskog.fi/ahlskog-transport/',
    ])
    expect(rankCompanyPages('https://acme.fi/', ['https://acme.fi/meista', 'https://acme.fi/meista/'], 'Acme Oy')).toEqual(['https://acme.fi/meista'])
    expect(rankCompanyPages('https://moebel.dk/', ['/kobenhavns-historie/'], 'Københavns Møbelsnedkeri ApS')).toEqual([
      'https://moebel.dk/kobenhavns-historie/',
    ])
  })
})

describe('normalizeWebsite', () => {
  it('adds a scheme and rejects addresses that are not web sites', () => {
    expect(normalizeWebsite('www.acme.fi')).toBe('https://www.acme.fi/')
    expect(normalizeWebsite(' http://localhost:3100/sites/x/ ')).toBe('http://localhost:3100/sites/x/')
    expect(normalizeWebsite('ftp://acme.fi')).toBeNull()
    expect(normalizeWebsite('acme')).toBeNull()
    expect(normalizeWebsite('')).toBeNull()
  })
})

describe('scrape job', () => {
  it('combines the home and about pages, saves the screenshot and the og image, and advances', async () => {
    ctx.stub.scraper.pages['https://acme.test/'] = page('https://acme.test/', HOME_TEXT, {
      links: ['https://acme.test/tuotteet', 'https://acme.test/meista'],
      screenshotPng: png,
      language: 'fi-FI',
    })
    ctx.stub.scraper.pages['https://acme.test/meista'] = page('https://acme.test/meista', ABOUT_TEXT)

    const job = await runScrape()

    expect(job.status).toBe('done')
    expect(ctx.stub.scraper.calls).toEqual([
      { kind: 'home', url: 'https://acme.test/', country: 'FI' },
      { kind: 'markdown', url: 'https://acme.test/meista', country: 'FI' },
    ])
    const scrape = getDeal(t.db, DEAL_ID)?.scrape
    expect(scrape).toMatchObject({ ok: true, reason: null, pageUrls: ['https://acme.test/meista'], siteLanguage: 'fi', screenshot: true })
    expect(scrape?.words).toBeGreaterThanOrEqual(200)
    expect(scrape?.markdown).toContain('# Meistä')
    expect((await stat(paths.screenshot(DEAL_ID))).size).toBeGreaterThan(0)
    expect((await stat(paths.ogImage(DEAL_ID))).size).toBeGreaterThan(0)
    expect(writeScriptJobs().map((item) => item.payload)).toEqual([
      { dealId: DEAL_ID, version: 1, slides: [2, 3, 4, 5, 6, 7, 8], lines: true },
    ])
  })

  it('marks a short site as too_few_words and uses the home page alone when the about page fails', async () => {
    ctx.stub.scraper.pages['https://acme.test/'] = page('https://acme.test/', 'Tervetuloa Acme Oy:n sivuille.', {
      links: ['https://acme.test/yritys/'],
    })
    ctx.stub.scraper.pages['https://acme.test/yritys/'] = page('https://acme.test/yritys/', '', { statusCode: 404 })

    await runScrape()

    expect(getDeal(t.db, DEAL_ID)?.scrape).toMatchObject({
      ok: false,
      reason: 'too_few_words',
      pageUrls: [],
      screenshot: false,
      markdown: 'Tervetuloa Acme Oy:n sivuille.',
    })
    expect(writeScriptJobs()[0]?.payload).toMatchObject({ lines: false })
  })

  it('reads more company pages until the text has enough words', async () => {
    ctx.stub.scraper.pages['https://acme.test/'] = page('https://acme.test/', 'Tervetuloa Acme Oy:n sivuille.', {
      links: ['https://acme.test/acme-teras/', 'https://acme.test/yritys/', 'https://acme.test/acme-hitsaus/', 'https://acme.test/acme-koneet/'],
    })
    ctx.stub.scraper.pages['https://acme.test/yritys/'] = page('https://acme.test/yritys/', '', { statusCode: 404 })
    ctx.stub.scraper.pages['https://acme.test/acme-teras/'] = page('https://acme.test/acme-teras/', FINNISH.repeat(3))
    ctx.stub.scraper.pages['https://acme.test/acme-koneet/'] = page('https://acme.test/acme-koneet/', FINNISH.repeat(3))

    await runScrape()

    expect(ctx.stub.scraper.calls.map((call) => call.url)).toEqual([
      'https://acme.test/',
      'https://acme.test/yritys/',
      'https://acme.test/acme-teras/',
      'https://acme.test/acme-koneet/',
    ])
    expect(getDeal(t.db, DEAL_ID)?.scrape).toMatchObject({
      ok: true,
      pageUrls: ['https://acme.test/acme-teras/', 'https://acme.test/acme-koneet/'],
    })
    expect(writeScriptJobs()[0]?.payload).toMatchObject({ lines: true })
  })

  it('writes no_website without a scrape when the organization has no website', async () => {
    updateDeal(t.db, DEAL_ID, { snapshot: { ...snapshot(), website: null } }, T0)

    await runScrape()

    expect(ctx.stub.scraper.calls).toEqual([])
    expect(getDeal(t.db, DEAL_ID)?.scrape).toMatchObject({ ok: false, reason: 'no_website', homeUrl: null })
    expect(writeScriptJobs()).toHaveLength(1)
  })

  it('fails at once on HTTP 404 and writes the failure so that the analyst can write the lines', async () => {
    ctx.stub.scraper.pages['https://acme.test/'] = page('https://acme.test/', 'Not found', { statusCode: 404 })

    const job = await runScrape()

    expect(job.status).toBe('failed')
    expect(job.error).toContain('HTTP 404')
    expect(getDeal(t.db, DEAL_ID)?.scrape).toMatchObject({ ok: false, reason: 'http_error', homeUrl: 'https://acme.test/' })
    expect(writeScriptJobs()[0]?.payload).toMatchObject({ version: 1, lines: false })
  })

  it('retries a network error and keeps the deal without a scrape result', async () => {
    ctx.stub.scraper.pages['https://acme.test/'] = new ScrapeError('network error: fetch failed', {
      provider: 'firecrawl',
      code: 'network',
      reason: 'error',
      retryable: true,
    })

    const job = await runScrape()

    expect(job).toMatchObject({ status: 'queued', attempts: 1 })
    expect(getDeal(t.db, DEAL_ID)?.scrape).toBeNull()
    expect(writeScriptJobs()).toEqual([])
  })

  it('fills the lines after a successful retry when the version is not approved', async () => {
    updateDeal(t.db, DEAL_ID, { scrape: SCRAPE_FAILED }, T0)
    createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { lines: [], linesSource: null }), T0)
    enqueue(t.db, 'scrape', jobKeys.scrape(DEAL_ID), { dealId: DEAL_ID }, { now: T0 })
    ctx.stub.scraper.pages['https://acme.test/'] = page('https://acme.test/', `${HOME_TEXT}\n\n${ABOUT_TEXT}`)

    await runJob(ctx, claim())

    expect(getDeal(t.db, DEAL_ID)?.scrape?.ok).toBe(true)
    expect(writeScriptJobs().map((item) => item.payload)).toEqual([{ dealId: DEAL_ID, version: 1, slides: [3], lines: true }])
  })
})
