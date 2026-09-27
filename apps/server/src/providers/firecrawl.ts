import { z } from 'zod'
import { log } from '../log.ts'
import {
  CONSENT_AFTER_CLICK_MS,
  CONSENT_SETTLE_MS,
  consentScript,
  scrapeLocale,
} from './consent-script.ts'
import { ScrapeError, fetchFailure, isRetryableStatus } from './errors.ts'
import type { ScrapePageResult, ScraperClient } from './types.ts'

const ENDPOINT = 'https://api.firecrawl.dev/v2/scrape'
const MAP_ENDPOINT = 'https://api.firecrawl.dev/v2/map'
const MAP_LIMIT = 500
const API_TIMEOUT_MS = 90_000
const CLIENT_TIMEOUT_MS = 120_000
const DOWNLOAD_TIMEOUT_MS = 30_000
const VIEWPORT = { width: 1440, height: 900 }

const metaText = z.union([z.string(), z.array(z.string())]).optional()

const documentSchema = z.object({
  markdown: z.string().optional(),
  links: z.array(z.string()).optional(),
  screenshot: z.string().optional(),
  actions: z
    .object({ javascriptReturns: z.array(z.object({ type: z.string(), value: z.unknown() })).optional() })
    .optional(),
  metadata: z
    .object({
      url: metaText,
      sourceURL: metaText,
      language: metaText,
      statusCode: z.number().optional(),
      creditsUsed: z.number().optional(),
    })
    .optional(),
})

type FirecrawlDocument = z.infer<typeof documentSchema>

const responseSchema = z.object({ success: z.literal(true), data: documentSchema })

const mapSchema = z.object({ success: z.literal(true), links: z.array(z.object({ url: z.string() })) })

const errorSchema = z.object({ code: z.string().optional(), error: z.string().optional() })

export class FirecrawlScraper implements ScraperClient {
  readonly mode = 'real' as const
  readonly #apiKey: string

  constructor(apiKey: string) {
    this.#apiKey = apiKey
  }

  async scrapeHome(url: string, country?: string): Promise<ScrapePageResult> {
    const siteLinks = this.#map(url)
    const request = {
      ...baseRequest(url, country),
      formats: ['markdown', 'links', { type: 'screenshot', fullPage: true, viewport: VIEWPORT }],
    }
    let doc: FirecrawlDocument
    try {
      doc = await this.#scrape({ ...request, actions: consentActions() })
    } catch (error) {
      if (!(error instanceof ScrapeError && error.code === 'SCRAPE_ACTION_ERROR')) throw error
      log.warn('firecrawl consent actions failed, scraping again without actions', { url, error: error.message })
      doc = await this.#scrape(request)
    }
    const consent = doc.actions?.javascriptReturns?.map((entry) => entry.value) ?? []
    log.info('firecrawl home scraped', {
      url,
      statusCode: doc.metadata?.statusCode ?? null,
      credits: doc.metadata?.creditsUsed ?? null,
      consent,
    })
    const screenshotPng = doc.screenshot ? await this.#download(doc.screenshot, url) : null
    const page = toResult(url, doc, screenshotPng)
    return { ...page, links: [...new Set([...page.links, ...(await siteLinks)])] }
  }

  async scrapeMarkdown(url: string, country?: string): Promise<ScrapePageResult> {
    const doc = await this.#scrape({ ...baseRequest(url, country), formats: ['markdown'] })
    log.info('firecrawl page scraped', { url, statusCode: doc.metadata?.statusCode ?? null })
    return toResult(url, doc, null)
  }

  async #map(url: string): Promise<string[]> {
    try {
      const res = await fetch(MAP_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.#apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url, limit: MAP_LIMIT, includeSubdomains: false }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      })
      const parsed = mapSchema.safeParse(await res.json().catch(() => null))
      if (!res.ok || !parsed.success) throw new Error(`HTTP ${res.status}`)
      return parsed.data.links.map((link) => link.url)
    } catch (error) {
      log.warn('firecrawl map failed, the home page links are used alone', { url, error: error instanceof Error ? error.message : String(error) })
      return []
    }
  }

  async #scrape(body: Record<string, unknown>): Promise<FirecrawlDocument> {
    const url = String(body.url)
    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.#apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      })
    } catch (error) {
      const failure = fetchFailure(error)
      throw new ScrapeError(`Firecrawl ${url}: ${failure.message}`, {
        provider: 'firecrawl',
        code: failure.code,
        reason: failure.code === 'timeout' ? 'timeout' : 'error',
        retryable: true,
        cause: error,
      })
    }
    const json: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const detail = errorSchema.safeParse(json)
      const code = detail.success ? (detail.data.code ?? null) : null
      const message = detail.success ? (detail.data.error ?? res.statusText) : res.statusText
      const timeout = res.status === 408 || code === 'SCRAPE_TIMEOUT'
      throw new ScrapeError(`Firecrawl ${url}: HTTP ${res.status}${code ? ` ${code}` : ''}: ${message}`, {
        provider: 'firecrawl',
        status: res.status,
        code: code ?? `http_${res.status}`,
        reason: timeout ? 'timeout' : res.status === 403 ? 'blocked' : 'error',
        retryable: isRetryableStatus(res.status),
      })
    }
    const parsed = responseSchema.safeParse(json)
    if (!parsed.success) {
      throw new ScrapeError(`Firecrawl ${url}: unexpected response: ${z.prettifyError(parsed.error)}`, {
        provider: 'firecrawl',
        status: res.status,
        code: 'bad_response',
        reason: 'error',
        retryable: true,
      })
    }
    return parsed.data.data
  }

  async #download(screenshotUrl: string, pageUrl: string): Promise<Buffer> {
    const fail = (message: string, retryable: boolean, cause?: unknown) =>
      new ScrapeError(`Firecrawl screenshot of ${pageUrl}: ${message}`, {
        provider: 'firecrawl',
        code: 'screenshot_download',
        reason: 'error',
        retryable,
        cause,
      })
    let res: Response
    try {
      res = await fetch(screenshotUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
    } catch (error) {
      throw fail(fetchFailure(error).message, true, error)
    }
    if (!res.ok) throw fail(`HTTP ${res.status}`, isRetryableStatus(res.status))
    const png = Buffer.from(await res.arrayBuffer())
    if (png.length === 0) throw fail('empty file', true)
    return png
  }
}

function baseRequest(url: string, country: string | undefined): Record<string, unknown> {
  const locale = scrapeLocale(country)
  return {
    url,
    onlyMainContent: true,
    maxAge: 0,
    timeout: API_TIMEOUT_MS,
    ...(locale ? { location: { country: locale.country, languages: [locale.locale] } } : {}),
  }
}

function consentActions(): Record<string, unknown>[] {
  return [
    { type: 'wait', milliseconds: CONSENT_SETTLE_MS },
    { type: 'executeJavascript', script: consentScript('accept') },
    { type: 'wait', milliseconds: CONSENT_AFTER_CLICK_MS },
    { type: 'executeJavascript', script: consentScript('cleanup') },
  ]
}

function firstText(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value
  return text?.trim() || null
}

function toResult(url: string, doc: FirecrawlDocument, screenshotPng: Buffer | null): ScrapePageResult {
  return {
    url: firstText(doc.metadata?.url) ?? firstText(doc.metadata?.sourceURL) ?? url,
    markdown: doc.markdown ?? '',
    links: [...new Set(doc.links ?? [])],
    screenshotPng,
    language: firstText(doc.metadata?.language),
    statusCode: doc.metadata?.statusCode ?? null,
  }
}
