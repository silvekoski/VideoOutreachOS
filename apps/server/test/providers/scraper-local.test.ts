import { existsSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../../src/env.ts'
import { ScrapeError } from '../../src/providers/errors.ts'
import { LocalScraper } from '../../src/providers/scraper-local.ts'

const home = `<!DOCTYPE html>
<html lang="fi">
<head><meta charset="utf-8"><title>Acme Oy</title>
<style>
  body { margin: 0; font-family: sans-serif; }
  #cookie-banner { position: fixed; inset: auto 0 0 0; height: 200px; background: #222; color: #fff; }
  .hidden { display: none; }
</style></head>
<body>
  <nav><a href="/">Etusivu</a> <a href="/meista">Meistä</a> <a href="mailto:info@acme.test">Sähköposti</a></nav>
  <main>
    <h1>Acme Oy</h1>
    <p>Valmistamme <strong>metallirakenteita</strong> teollisuudelle vuodesta 1985.</p>
    <div>Toimipisteemme ovat Tampereella ja Oulussa.<p>Työllistämme 48 ammattilaista.</p></div>
    <h2>Palvelut</h2>
    <ul>
      <li>Hitsaus<ul><li>MIG</li><li>TIG</li></ul></li>
      <li>Koneistus</li>
    </ul>
    <p class="hidden">Piilotettu teksti</p>
    <a href="https://example.com/partner">Kumppani</a>
  </main>
  <footer>Acme Oy, Y-tunnus 1234567-8</footer>
  <div id="cookie-banner" role="dialog" aria-label="Evästeet">
    Käytämme evästeitä. <button id="accept" type="button">Hyväksy kaikki</button>
  </div>
  <script>
    document.getElementById('accept').addEventListener('click', () => {
      fetch('/consent-accepted')
      document.getElementById('cookie-banner').remove()
    })
  </script>
</body></html>`

const about = `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><title>Meistä</title></head>
<body><main><h1>Meistä</h1><p>Perheyritys kolmannessa polvessa.</p></main></body></html>`

let server: Server
let base: string
const seen: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(req.url ?? '')
    if (req.url === '/') res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(home)
    else if (req.url === '/meista') res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(about)
    else res.writeHead(204).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

describe.skipIf(!existsSync(env.chromePath))('LocalScraper', { timeout: 60_000 }, () => {
  const scraper = new LocalScraper(env.chromePath)

  it('accepts the cookie banner, takes a viewport screenshot and extracts readable Markdown', async () => {
    const page = await scraper.scrapeHome(`${base}/`, 'FI')
    expect(seen).toContain('/consent-accepted')
    expect(page.statusCode).toBe(200)
    expect(page.language).toBe('fi')
    expect(page.url).toBe(`${base}/`)
    expect(page.markdown).toContain('# Acme Oy')
    expect(page.markdown).toContain('Valmistamme metallirakenteita teollisuudelle vuodesta 1985.')
    expect(page.markdown).toContain('Toimipisteemme ovat Tampereella ja Oulussa.')
    expect(page.markdown).toContain('Työllistämme 48 ammattilaista.')
    expect(page.markdown).toContain('## Palvelut')
    expect(page.markdown).toContain('- Hitsaus\n\n- MIG\n\n- TIG\n\n- Koneistus')
    expect(page.markdown).not.toMatch(/Piilotettu|Etusivu|Y-tunnus|evästeitä/)
    expect(page.links).toEqual([`${base}/`, `${base}/meista`, 'https://example.com/partner'])
    const png = page.screenshotPng
    expect(png?.subarray(1, 4).toString()).toBe('PNG')
    expect(png?.readUInt32BE(16)).toBe(1440)
    expect(png?.readUInt32BE(20)).toBe(900)
  })

  it('scrapes a page for Markdown only', async () => {
    const page = await scraper.scrapeMarkdown(`${base}/meista`)
    expect(page.screenshotPng).toBeNull()
    expect(page.markdown).toBe('# Meistä\n\nPerheyritys kolmannessa polvessa.')
  })

  it('throws a retryable http_error when the site does not answer', async () => {
    const error = await scraper.scrapeMarkdown('http://127.0.0.1:9/').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ScrapeError)
    expect(error).toMatchObject({ reason: 'http_error', retryable: true })
  })

  it('throws a non-retryable error when Chrome cannot start', async () => {
    const error = await new LocalScraper('/no/such/chrome').scrapeMarkdown(`${base}/meista`).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'launch_failed', retryable: false })
  })
})
