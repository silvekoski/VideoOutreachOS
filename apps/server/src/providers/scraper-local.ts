import { setTimeout as sleep } from 'node:timers/promises'
import { TimeoutError, launch, type Browser, type Page } from 'puppeteer-core'
import { log } from '../log.ts'
import {
  CMP_CONTAINERS,
  CONSENT_AFTER_CLICK_MS,
  CONSENT_HINT_PATTERN,
  CONSENT_SETTLE_MS,
  consentScript,
  scrapeLocale,
  type ConsentOutcome,
} from './consent-script.ts'
import { ScrapeError } from './errors.ts'
import type { ScrapePageResult, ScraperClient } from './types.ts'

const VIEWPORT = { width: 1440, height: 900 }
const LAUNCH_TIMEOUT_MS = 30_000
const PROTOCOL_TIMEOUT_MS = 60_000
const NAVIGATION_TIMEOUT_MS = 30_000
const NETWORK_IDLE_TIMEOUT_MS = 10_000
const MAIN_MIN_CHARS = 200
const MAX_CAPTURE_HEIGHT = 6 * VIEWPORT.height
const PRELOAD_STEP_MS = 150

interface ExtractedPage {
  markdown: string
  links: string[]
  lang: string | null
}

export class LocalScraper implements ScraperClient {
  readonly mode = 'fake' as const
  readonly #chromePath: string

  constructor(chromePath: string) {
    this.#chromePath = chromePath
  }

  scrapeHome(url: string, country?: string): Promise<ScrapePageResult> {
    return this.#scrape(url, country, true)
  }

  scrapeMarkdown(url: string, country?: string): Promise<ScrapePageResult> {
    return this.#scrape(url, country, false)
  }

  async #scrape(url: string, country: string | undefined, home: boolean): Promise<ScrapePageResult> {
    const locale = scrapeLocale(country)?.locale ?? 'en-US'
    let browser: Browser
    try {
      browser = await launch({
        executablePath: this.#chromePath,
        headless: true,
        timeout: LAUNCH_TIMEOUT_MS,
        protocolTimeout: PROTOCOL_TIMEOUT_MS,
        defaultViewport: VIEWPORT,
        args: [`--lang=${locale}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio'],
      })
    } catch (error) {
      throw new ScrapeError(`Local scraper cannot start Chrome at "${this.#chromePath}" (set CHROME_PATH): ${messageOf(error)}`, {
        provider: 'local-scraper',
        code: 'launch_failed',
        reason: 'error',
        retryable: false,
        cause: error,
      })
    }
    try {
      const page = await browser.newPage()
      page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS)
      await page.setExtraHTTPHeaders({ 'Accept-Language': `${locale},${locale.slice(0, 2)};q=0.9,en;q=0.5` })
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS })
      await page.waitForNetworkIdle({ idleTime: 500, timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined)

      let screenshotPng: Buffer | null = null
      if (home) {
        await sleep(CONSENT_SETTLE_MS)
        const consent = await runConsent(page, url)
        log.info('local scraper consent', { url, ...consent })
        const height = await preloadPage(page)
        screenshotPng = Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: VIEWPORT.width, height } }))
      }
      const extracted = await page.evaluate(extractPage, CONSENT_HINT_PATTERN, CMP_CONTAINERS, MAIN_MIN_CHARS)
      return {
        url: page.url(),
        markdown: extracted.markdown,
        links: extracted.links,
        screenshotPng,
        language: extracted.lang,
        statusCode: response?.status() ?? null,
      }
    } catch (error) {
      throw toScrapeError(url, error)
    } finally {
      await browser.close().catch((error: unknown) => log.warn('local scraper could not close Chrome', { error }))
    }
  }
}

async function runConsent(page: Page, url: string): Promise<{ method: string | null; visibleAfter: string | null }> {
  try {
    const accept = (await page.evaluate(consentScript('accept'))) as ConsentOutcome
    await sleep(CONSENT_AFTER_CLICK_MS)
    const cleanup = (await page.evaluate(consentScript('cleanup'))) as ConsentOutcome
    return { method: accept.method, visibleAfter: cleanup.visibleAfter }
  } catch (error) {
    log.warn('local scraper consent script failed', { url, error: messageOf(error) })
    return { method: 'error', visibleAfter: null }
  }
}

async function preloadPage(page: Page): Promise<number> {
  const height = await page.evaluate(
    async (maxHeight, step, stepMs) => {
      const bottom = () => Math.min(document.documentElement.scrollHeight, maxHeight)
      for (let y = step; y < bottom(); y += step) {
        window.scrollTo(0, y)
        await new Promise((resolve) => setTimeout(resolve, stepMs))
      }
      window.scrollTo(0, 0)
      return bottom()
    },
    MAX_CAPTURE_HEIGHT,
    VIEWPORT.height / 2,
    PRELOAD_STEP_MS,
  )
  await page.waitForNetworkIdle({ idleTime: 500, timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined)
  return Math.max(VIEWPORT.height, height)
}

function toScrapeError(url: string, error: unknown): ScrapeError {
  if (error instanceof ScrapeError) return error
  const message = messageOf(error)
  if (error instanceof TimeoutError) {
    return new ScrapeError(`Local scraper ${url}: timed out: ${message}`, {
      provider: 'local-scraper',
      code: 'timeout',
      reason: 'timeout',
      retryable: true,
      cause: error,
    })
  }
  const netError = /net::ERR_[A-Z_]+/.exec(message)?.[0]
  return new ScrapeError(`Local scraper ${url}: ${message}`, {
    provider: 'local-scraper',
    code: netError ?? 'error',
    reason: netError ? 'http_error' : 'error',
    retryable: true,
    cause: error,
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function extractPage(hintPattern: string, containers: string[], mainMinChars: number): ExtractedPage {
  const hint = new RegExp(hintPattern, 'i')
  const skipTags = new Set([
    'NAV', 'FOOTER', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT',
    'VIDEO', 'AUDIO', 'BUTTON', 'SELECT', 'TEXTAREA', 'INPUT', 'FORM',
  ])
  const paragraphTags = new Set(['P', 'BLOCKQUOTE', 'FIGCAPTION', 'DD', 'DT', 'TD', 'TH', 'CAPTION', 'ADDRESS', 'PRE'])
  const containerSelector = containers.join(',')
  const blocks: string[] = []
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
  const push = (text: string) => {
    const value = clean(text)
    if (value && blocks[blocks.length - 1] !== value) blocks.push(value)
  }
  const skipped = (el: HTMLElement) => {
    if (skipTags.has(el.tagName)) return true
    const role = el.getAttribute('role')
    if (role === 'navigation' || role === 'contentinfo' || el.getAttribute('aria-hidden') === 'true') return true
    const names = `${el.id} ${typeof el.className === 'string' ? el.className : ''} ${el.getAttribute('aria-label') ?? ''}`
    return hint.test(names) || (containerSelector !== '' && el.matches(containerSelector))
  }
  const shown = (el: HTMLElement) => {
    const cs = getComputedStyle(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' ? cs.display : null
  }
  const listItem = (el: HTMLElement) => {
    let text = ''
    const nested: HTMLElement[] = []
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? ''
      else if (child instanceof HTMLElement && !skipped(child) && shown(child)) {
        if (child.tagName === 'UL' || child.tagName === 'OL') nested.push(child)
        else text += ` ${child.innerText} `
      }
    }
    const value = clean(text)
    if (value) push(`- ${value}`)
    for (const list of nested) walk(list)
  }
  const block = (el: HTMLElement) => {
    if (/^H[1-6]$/.test(el.tagName)) {
      const value = clean(el.innerText)
      if (value) push(`${'#'.repeat(Number(el.tagName[1]))} ${value}`)
    } else if (el.tagName === 'LI') listItem(el)
    else if (paragraphTags.has(el.tagName)) push(el.innerText)
    else walk(el)
  }
  const walk = (node: HTMLElement) => {
    let inline = ''
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        inline += child.textContent ?? ''
        continue
      }
      if (!(child instanceof HTMLElement) || skipped(child)) continue
      const display = shown(child)
      if (!display) continue
      if (child.tagName === 'BR') inline += ' '
      else if (display.startsWith('inline')) inline += ` ${child.innerText} `
      else {
        push(inline)
        inline = ''
        block(child)
      }
    }
    push(inline)
  }

  const main = document.querySelector<HTMLElement>('main, [role="main"]')
  const root = main && clean(main.innerText).length >= mainMinChars ? main : document.body
  if (root) walk(root)

  const links: string[] = []
  const seen = new Set<string>()
  for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
    let href: string
    try {
      href = new URL(anchor.getAttribute('href') ?? '', document.baseURI).href
    } catch {
      continue
    }
    if (!/^https?:/i.test(href) || seen.has(href)) continue
    seen.add(href)
    links.push(href)
  }

  return { markdown: blocks.join('\n\n'), links, lang: document.documentElement.getAttribute('lang') || null }
}
