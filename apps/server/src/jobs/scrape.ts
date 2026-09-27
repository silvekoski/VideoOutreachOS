import { countWords, detectLanguage, normalizeLang } from '@mergero/shared'
import type { ScrapeFailure, ScrapeResult } from '@mergero/shared'
import type { DealRow } from '../db/rows.ts'
import { getDeal, requireDeal, updateDeal } from '../domain/deals.ts'
import { advance } from '../domain/pipeline.ts'
import { log } from '../log.ts'
import { ogImage } from '../media/ffmpeg.ts'
import { paths } from '../paths.ts'
import { ScrapeError, isRetryableStatus } from '../providers/errors.ts'
import type { ScrapePageResult } from '../providers/types.ts'
import { errorText } from '../queue/index.ts'
import { writeFileAtomic } from './storage.ts'
import type { JobContext, JobHandler } from './types.ts'

const MIN_WORDS = 200
const MAX_MARKDOWN_CHARS = 50_000
const DEPTH_PENALTY = 10
const FOREIGN_LANGUAGE_PENALTY = 30
const COMPANY_NAME_WEIGHT = 60
const MAX_EXTRA_PAGES = 3

const ABOUT_WORDS: readonly [word: string, weight: number][] = [
  ['about-us', 100],
  ['who-we-are', 100],
  ['ueber-uns', 100],
  ['uber-uns', 100],
  ['über-uns', 100],
  ['om-oss', 100],
  ['om-os', 100],
  ['meista', 100],
  ['meistä', 100],
  ['about', 90],
  ['yritys', 80],
  ['yhtio', 80],
  ['yhtiö', 80],
  ['company', 70],
  ['unternehmen', 70],
  ['firma', 60],
  ['om', 50],
]

const LEGAL_FORMS = new Set(['gmbh', 'aktiebolag', 'osakeyhtio', 'aktieselskab', 'aksjeselskap', 'limited', 'comp', 'group', 'holding'])

const LANGUAGE_SEGMENTS = new Set(['en', 'fi', 'sv', 'se', 'de', 'da', 'dk', 'nb', 'no', 'nn', 'fr', 'es', 'it', 'nl', 'pl', 'ru', 'et'])
const FILE_LINK = /\.(?:pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|pptx?|mp4|mp3)$/iu
const PAGE_SUFFIX = /\.(?:html?|php|aspx?)$/iu

function hostKey(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./u, '')
}

function segmentsOf(pathname: string): string[] {
  return pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment).toLowerCase()
      } catch {
        return segment.toLowerCase()
      }
    })
}

function fold(text: string): string {
  return text.toLowerCase().replaceAll('ø', 'o').replaceAll('æ', 'ae').replaceAll('ß', 'ss').normalize('NFKD').replace(/\p{M}/gu, '')
}

function nameTokens(company: string): Set<string> {
  return new Set(fold(company).split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 4 && !LEGAL_FORMS.has(token)))
}

function segmentTokens(segment: string): string[] {
  return segment.replace(PAGE_SUFFIX, '').split(/[-_.]+/u).filter(Boolean)
}

function segmentScore(segment: string): number {
  const name = segment.replace(PAGE_SUFFIX, '')
  const tokens = segmentTokens(segment)
  let best = 0
  for (const [word, weight] of ABOUT_WORDS) {
    if (name === word) best = Math.max(best, weight)
    const parts = word.split('-')
    const contains = tokens.some((_, start) => parts.every((part, offset) => tokens[start + offset] === part))
    if (contains) best = Math.max(best, weight / 2)
  }
  return best
}

function isLanguageSegment(segment: string | undefined): boolean {
  return segment !== undefined && LANGUAGE_SEGMENTS.has(segment.split(/[-_]/u)[0] ?? '')
}

export function rankCompanyPages(
  homeUrl: string,
  links: readonly string[],
  company: string,
  extraHomes: readonly string[] = [],
): string[] {
  let home: URL
  try {
    home = new URL(homeUrl)
  } catch {
    return []
  }
  const names = nameTokens(company)
  const hosts = new Set([home, ...extraHomes.flatMap((url) => (URL.canParse(url) ? [new URL(url)] : []))].map(hostKey))
  const base = home.pathname.endsWith('/') ? home.pathname : home.pathname.slice(0, home.pathname.lastIndexOf('/') + 1)
  const ranked: { url: string; score: number; length: number }[] = []
  const seen = new Set<string>()
  for (const link of links) {
    let url: URL
    try {
      url = new URL(link, home)
    } catch {
      continue
    }
    url.hash = ''
    if (!/^https?:$/u.test(url.protocol) || !hosts.has(hostKey(url)) || FILE_LINK.test(url.pathname)) continue
    const key = url.href.replace(/\/$/u, '')
    if (seen.has(key)) continue
    seen.add(key)
    const relative = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname
    const segments = segmentsOf(relative)
    if (segments.length === 0) continue
    const [top] = segments
    const named = segments.length === 1 && top !== undefined && segmentTokens(top).some((token) => names.has(fold(token)))
    const words = Math.max(named ? COMPANY_NAME_WEIGHT : 0, ...segments.map(segmentScore))
    if (words <= 0) continue
    const foreign = segments.length > 1 && isLanguageSegment(segments[0]) ? FOREIGN_LANGUAGE_PENALTY : 0
    const score = words - foreign - DEPTH_PENALTY * (segments.length - 1)
    if (score > 0) ranked.push({ url: url.href, score, length: url.pathname.length })
  }
  return ranked.sort((a, b) => b.score - a.score || a.length - b.length).map((item) => item.url)
}

export function normalizeWebsite(website: string): string | null {
  const text = website.trim()
  if (text === '') return null
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//iu.test(text) ? text : `https://${text}`
  try {
    const url = new URL(candidate)
    const host = url.hostname === 'localhost' || url.hostname.includes('.')
    return /^https?:$/u.test(url.protocol) && host ? url.href : null
  } catch {
    return null
  }
}

function assertPageOk(page: ScrapePageResult, requested: string): void {
  const status = page.statusCode
  if (status === null || status < 400) return
  throw new ScrapeError(`${requested} returned HTTP ${status}`, {
    provider: 'scrape',
    status,
    code: `http_${status}`,
    reason: 'http_error',
    retryable: isRetryableStatus(status),
  })
}

function failedResult(reason: ScrapeFailure, error: string, homeUrl: string | null, now: Date): ScrapeResult {
  return {
    ok: false,
    reason,
    error,
    homeUrl,
    pageUrls: [],
    words: 0,
    markdown: null,
    siteLanguage: null,
    screenshot: false,
    scrapedAt: now.toISOString(),
  }
}

async function companyPage(ctx: JobContext, deal: DealRow, url: string): Promise<ScrapePageResult | null> {
  try {
    const page = await ctx.providers.scraper.scrapeMarkdown(url, deal.country)
    assertPageOk(page, url)
    return page
  } catch (error) {
    log.warn('a company page could not be scraped and is skipped', { dealId: deal.id, url, error: errorText(error) })
    return null
  }
}

async function companyPages(ctx: JobContext, deal: DealRow, home: ScrapePageResult, requested: string): Promise<ScrapePageResult[]> {
  const pages: ScrapePageResult[] = []
  let words = countWords(home.markdown)
  for (const url of rankCompanyPages(home.url, home.links, deal.snapshot.company, [requested]).slice(0, MAX_EXTRA_PAGES)) {
    if (pages.length > 0 && words >= MIN_WORDS) break
    const page = await companyPage(ctx, deal, url)
    if (!page) continue
    pages.push(page)
    words += countWords(page.markdown)
  }
  return pages
}

async function scrapeWebsite(ctx: JobContext, deal: DealRow): Promise<ScrapeResult> {
  const now = ctx.now()
  const website = deal.snapshot.website
  if (!website) return failedResult('no_website', 'The organization has no website in Pipedrive', null, now)
  const homeUrl = normalizeWebsite(website)
  if (!homeUrl) return failedResult('error', `The website "${website}" is not a valid web address`, null, now)

  const home = await ctx.providers.scraper.scrapeHome(homeUrl, deal.country)
  assertPageOk(home, homeUrl)
  const pages = await companyPages(ctx, deal, home, homeUrl)
  const markdown = [home, ...pages]
    .map((page) => page.markdown.trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_MARKDOWN_CHARS)
  const words = countWords(markdown)

  let screenshot = false
  if (home.screenshotPng && home.screenshotPng.length > 0) {
    await writeFileAtomic(paths.screenshot(deal.id), home.screenshotPng)
    await ogImage(paths.screenshot(deal.id), paths.ogImage(deal.id))
    screenshot = true
  }
  const ok = words >= MIN_WORDS
  return {
    ok,
    reason: ok ? null : 'too_few_words',
    error: ok ? null : `The website has ${words} words, ${MIN_WORDS} are needed`,
    homeUrl: home.url,
    pageUrls: pages.map((page) => page.url),
    words,
    markdown: markdown || null,
    siteLanguage: normalizeLang(home.language) ?? detectLanguage(markdown),
    screenshot,
    scrapedAt: now.toISOString(),
  }
}

function logResult(dealId: number, result: ScrapeResult): void {
  const fields = {
    dealId,
    ok: result.ok,
    reason: result.reason,
    error: result.error,
    homeUrl: result.homeUrl,
    pageUrls: result.pageUrls,
    words: result.words,
    siteLanguage: result.siteLanguage,
    screenshot: result.screenshot,
  }
  if (result.ok) log.info('scrape result', fields)
  else log.warn('scrape result', fields)
}

export const scrapeHandler: JobHandler<'scrape'> = {
  async run(job, ctx) {
    const deal = requireDeal(ctx.db, job.payload.dealId)
    const result = await scrapeWebsite(ctx, deal)
    updateDeal(ctx.db, deal.id, { scrape: result }, ctx.now())
    logResult(deal.id, result)
    advance(ctx.db, deal.id, ctx.now())
  },

  async onFinalFailure(job, error, ctx) {
    const deal = getDeal(ctx.db, job.payload.dealId)
    if (!deal || deal.scrape?.ok) return
    const reason: ScrapeFailure = error instanceof ScrapeError ? error.reason : 'error'
    const homeUrl = deal.snapshot.website ? normalizeWebsite(deal.snapshot.website) : null
    const result = failedResult(reason, errorText(error), homeUrl, ctx.now())
    updateDeal(ctx.db, deal.id, { scrape: result }, ctx.now())
    logResult(deal.id, result)
  },
}
