import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScrapeError } from '../../src/providers/errors.ts'
import { FirecrawlScraper } from '../../src/providers/firecrawl.ts'

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const screenshotUrl = 'https://storage.googleapis.com/firecrawl-scrape-media/screenshot-1.png?Expires=1'

type Handler = (url: string, body: Record<string, unknown> | null) => Response

function mockFetch(handler: Handler) {
  const bodies: Record<string, unknown>[] = []
  const fn = vi.fn(async (input: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null
    if (body) bodies.push(body)
    return handler(String(input), body)
  })
  vi.stubGlobal('fetch', fn)
  return { fn, bodies }
}

function scraped(extra: Record<string, unknown> = {}): Response {
  return Response.json({
    success: true,
    data: {
      markdown: '# Acme Oy\n\nValmistamme metallia.',
      links: ['https://acme.fi/', 'https://acme.fi/meista', 'https://acme.fi/'],
      screenshot: screenshotUrl,
      metadata: { url: 'https://acme.fi/', sourceURL: 'https://acme.fi', language: ['fi-FI'], statusCode: 200 },
      ...extra,
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FirecrawlScraper', () => {
  it('scrapes the home page with the consent actions, the location and the screenshot', async () => {
    const { fn, bodies } = mockFetch((url) => (url === screenshotUrl ? new Response(png) : scraped()))
    const page = await new FirecrawlScraper('fc-key').scrapeHome('https://acme.fi', 'fi')
    expect(page).toEqual({
      url: 'https://acme.fi/',
      markdown: '# Acme Oy\n\nValmistamme metallia.',
      links: ['https://acme.fi/', 'https://acme.fi/meista'],
      screenshotPng: png,
      language: 'fi-FI',
      statusCode: 200,
    })
    const [url, init] = fn.mock.calls[0]!
    expect(url).toBe('https://api.firecrawl.dev/v2/scrape')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fc-key')
    const body = bodies[0]!
    expect(body).toMatchObject({
      url: 'https://acme.fi',
      onlyMainContent: true,
      maxAge: 0,
      location: { country: 'FI', languages: ['fi-FI'] },
      formats: ['markdown', 'links', { type: 'screenshot', fullPage: false, viewport: { width: 1440, height: 900 } }],
    })
    expect(body).not.toHaveProperty('blockAds')
    expect(body.excludeTags).toContain('[class*="cookie" i]')
    const actions = body.actions as { type: string; script?: string }[]
    expect(actions.map((action) => action.type)).toEqual(['wait', 'executeJavascript', 'wait', 'executeJavascript'])
    expect(actions[1]?.script?.startsWith('(function consentPage(')).toBe(true)
    expect(() => new Function(actions[1]?.script ?? '')).not.toThrow()
    expect(actions[1]?.script).toContain('"accept"')
    expect(actions[3]?.script).toContain('"cleanup"')
  })

  it('retries once without actions after SCRAPE_ACTION_ERROR', async () => {
    const { bodies } = mockFetch((url, body) => {
      if (url === screenshotUrl) return new Response(png)
      return body?.actions
        ? Response.json({ success: false, code: 'SCRAPE_ACTION_ERROR', error: 'Element not found' }, { status: 500 })
        : scraped()
    })
    const page = await new FirecrawlScraper('fc-key').scrapeHome('https://acme.fi', 'DE')
    expect(page.statusCode).toBe(200)
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).not.toHaveProperty('actions')
    expect(bodies[1]).toMatchObject({ location: { country: 'DE', languages: ['de-DE'] } })
  })

  it('scrapes an about page for Markdown only', async () => {
    const { bodies } = mockFetch(() => scraped({ screenshot: undefined, links: undefined }))
    const page = await new FirecrawlScraper('fc-key').scrapeMarkdown('https://acme.fi/meista')
    expect(page.screenshotPng).toBeNull()
    expect(page.links).toEqual([])
    expect(bodies[0]).toMatchObject({ formats: ['markdown'] })
    expect(bodies[0]).not.toHaveProperty('actions')
    expect(bodies[0]).not.toHaveProperty('location')
  })

  it.each([
    [408, 'SCRAPE_TIMEOUT', 'timeout', true],
    [429, undefined, 'error', true],
    [502, undefined, 'error', true],
    [402, undefined, 'error', false],
    [403, undefined, 'blocked', false],
  ])('maps HTTP %i to a ScrapeError', async (status, code, reason, retryable) => {
    mockFetch(() => Response.json({ success: false, code, error: 'failed' }, { status }))
    const error = await new FirecrawlScraper('k').scrapeMarkdown('https://acme.fi').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ScrapeError)
    expect(error).toMatchObject({ status, reason, retryable })
  })

  it('throws a retryable error when the screenshot download fails', async () => {
    mockFetch((url) => (url === screenshotUrl ? new Response('gone', { status: 503 }) : scraped()))
    await expect(new FirecrawlScraper('k').scrapeHome('https://acme.fi')).rejects.toMatchObject({
      code: 'screenshot_download',
      retryable: true,
    })
  })
})
