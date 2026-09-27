import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { t } from '@mergero/shared'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DomainError } from '../../src/domain/errors.ts'
import { escapeHtml, scriptJson } from '../../src/html/escape.ts'
import { handleError, handleNotFound } from '../../src/html/errors.ts'
import { preferredLanguage } from '../../src/html/pages.ts'
import { createHtmlRoutes } from '../../src/html/routes.ts'
import { viteAssets } from '../../src/html/vite.ts'

let dist: string

beforeEach(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'mergero-dist-'))
})

afterEach(() => {
  rmSync(dist, { recursive: true, force: true })
})

function writeManifest(manifest: unknown): void {
  mkdirSync(path.join(dist, '.vite'), { recursive: true })
  writeFileSync(path.join(dist, '.vite', 'manifest.json'), JSON.stringify(manifest))
}

const MANIFEST = {
  '_i18n-abc.js': { file: 'assets/i18n-abc.js', name: 'i18n', css: ['assets/i18n-abc.css'], imports: ['_base-def.js'] },
  '_base-def.js': { file: 'assets/base-def.js', imports: ['_i18n-abc.js'] },
  'src/admin/main.tsx': { file: 'assets/admin-1.js', isEntry: true, imports: ['_i18n-abc.js'], css: ['assets/admin-1.css'] },
  'src/video/main.tsx': { file: 'assets/video-2.js', isEntry: true, imports: ['_i18n-abc.js'], css: ['assets/video-2.css'] },
}

describe('viteAssets', () => {
  it('loads the Vite client, the React preamble and the entry in development', () => {
    const tags = viteAssets({ production: false, devUrl: 'http://localhost:5173', distDir: dist })('admin')
    const preamble = tags.indexOf('import RefreshRuntime from "http://localhost:5173/@react-refresh"')
    const client = tags.indexOf('<script type="module" src="http://localhost:5173/@vite/client"></script>')
    const entry = tags.indexOf('<script type="module" src="http://localhost:5173/src/admin/main.tsx"></script>')
    expect(preamble).toBeGreaterThan(-1)
    expect(client).toBeGreaterThan(preamble)
    expect(entry).toBeGreaterThan(client)
    expect(tags).toContain('window.__vite_plugin_react_preamble_installed__ = true')
  })

  it('emits the entry script, its CSS and the modulepreload links in production', () => {
    writeManifest(MANIFEST)
    const assets = viteAssets({ production: true, devUrl: 'http://unused', distDir: dist })
    expect(assets('video').split('\n')).toEqual([
      '<link rel="stylesheet" crossorigin href="/assets/video-2.css">',
      '<link rel="stylesheet" crossorigin href="/assets/i18n-abc.css">',
      '<script type="module" crossorigin src="/assets/video-2.js"></script>',
      '<link rel="modulepreload" crossorigin href="/assets/i18n-abc.js">',
      '<link rel="modulepreload" crossorigin href="/assets/base-def.js">',
    ])
    rmSync(path.join(dist, '.vite'), { recursive: true })
    expect(assets('admin')).toContain('<script type="module" crossorigin src="/assets/admin-1.js"></script>')
  })

  it('preloads the strings chunk of the page language for the video entry', () => {
    writeManifest({
      ...MANIFEST,
      'src/video/main.tsx': { ...MANIFEST['src/video/main.tsx'], dynamicImports: ['../../packages/shared/src/i18n/de.ts'] },
      '../../packages/shared/src/i18n/de.ts': { file: 'assets/de-3.js', name: 'de', isDynamicEntry: true },
      '../../packages/shared/src/i18n/fi.ts': { file: 'assets/fi-4.js', name: 'fi', isDynamicEntry: true },
    })
    const assets = viteAssets({ production: true, devUrl: 'http://unused', distDir: dist })
    const tags = assets('video', { lang: 'de' })
    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/de-3.js">')
    expect(tags).not.toContain('fi-4.js')
    expect(assets('video')).not.toContain('de-3.js')
    expect(assets('video', { lang: 'sv' })).not.toContain('i18n/sv')
  })

  it('fails with a clear message when the manifest or the entry is missing', () => {
    expect(() => viteAssets({ production: true, devUrl: '', distDir: dist })('admin')).toThrow(/pnpm build/u)
    writeManifest({ 'src/admin/main.tsx': MANIFEST['src/admin/main.tsx'] })
    expect(() => viteAssets({ production: true, devUrl: '', distDir: dist })('video')).toThrow(/no entry src\/video\/main.tsx/u)
  })
})

describe('createHtmlRoutes', () => {
  function app(): Hono {
    const hono = new Hono()
    hono.route('/', createHtmlRoutes({ assets: viteAssets({ production: false, devUrl: 'http://vite.test', distDir: dist }), distDir: dist }))
    hono.notFound(handleNotFound)
    hono.onError(handleError)
    return hono
  }

  it('serves the admin HTML with the theme script for each client route', async () => {
    for (const route of ['/', '/deals', '/deals/4001', '/deals/4001/review', '/metrics']) {
      const res = await app().request(route)
      expect(res.status, route).toBe(200)
      const html = await res.text()
      expect(html.startsWith('<!DOCTYPE html>\n<html lang="en">')).toBe(true)
      expect(html).toContain('<title>Mergero video tool</title>')
      expect(html).toContain('localStorage.getItem("theme")||"dark"')
      expect(html).toContain('<script type="module" src="http://vite.test/src/admin/main.tsx"></script>')
      expect(html).toContain('<div id="root"></div>')
    }
    expect((await app().request('/deals/abc')).status).toBe(404)
  })

  it('forbids framing of the admin HTML', async () => {
    for (const route of ['/', '/deals/1/review']) {
      const res = await app().request(route)
      expect(res.headers.get('x-frame-options'), route).toBe('DENY')
      expect(res.headers.get('content-security-policy'), route).toBe("frame-ancestors 'none'")
    }
  })

  it('serves built assets with a long cache time', async () => {
    mkdirSync(path.join(dist, 'assets'), { recursive: true })
    writeFileSync(path.join(dist, 'assets', 'admin-1.js'), 'console.log(1)')
    const res = await app().request('/assets/admin-1.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await res.text()).toBe('console.log(1)')
    expect((await app().request('/assets/missing.js')).status).toBe(404)
    expect((await app().request('/assets/..%2F.vite%2Fmanifest.json')).status).toBe(404)
  })
})

describe('error handling', () => {
  const app = new Hono()
  app.get('/api/conflict', () => {
    throw new DomainError(409, 'The video has open review reasons', [{ code: 'script_missing' }])
  })
  app.get('/page/conflict', () => {
    throw new DomainError(409, 'Conflict')
  })
  app.get('/api/crash', () => {
    throw new Error('secret internal detail')
  })
  app.get('/page/crash', () => {
    throw new Error('secret internal detail')
  })
  app.notFound(handleNotFound)
  app.onError(handleError)

  it('returns ApiError JSON for /api and for JSON requests', async () => {
    const conflict = await app.request('/api/conflict')
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toEqual({ error: 'The video has open review reasons', detail: [{ code: 'script_missing' }] })
    const crash = await app.request('/api/crash')
    expect(crash.status).toBe(500)
    expect(await crash.json()).toEqual({ error: 'Internal server error' })
    const missing = await app.request('/api/nothing')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Not found' })
    const accept = await app.request('/page/conflict', { headers: { accept: 'application/json' } })
    expect(await accept.json()).toEqual({ error: 'Conflict' })
  })

  it('returns a plain HTML page elsewhere', async () => {
    const missing = await app.request('/nothing')
    expect(missing.status).toBe(404)
    expect(missing.headers.get('content-type')).toContain('text/html')
    const html = await missing.text()
    expect(html.startsWith('<!DOCTYPE html>\n<html lang="en">')).toBe(true)
    expect(html).toContain(t('en').page.notFoundTitle)
    const crash = await app.request('/page/crash')
    expect(crash.status).toBe(500)
    const text = await crash.text()
    expect(text).toContain('Something went wrong')
    expect(text).not.toContain('secret internal detail')
    expect((await app.request('/page/conflict')).status).toBe(409)
  })
})

describe('HTML helpers', () => {
  it('escapes HTML and script JSON', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;')
    expect(scriptJson({ text: '</script><!--' })).toBe('{"text":"\\u003c/script>\\u003c!--"}')
    expect(JSON.parse(scriptJson({ text: '</script>' }))).toEqual({ text: '</script>' })
  })

  it('picks the preferred supported language from Accept-Language', () => {
    expect(preferredLanguage('fi-FI,fi;q=0.9,en;q=0.8')).toBe('fi')
    expect(preferredLanguage('fr-FR,fr;q=0.9,de;q=0.5,en;q=0.4')).toBe('de')
    expect(preferredLanguage('no')).toBe('nb')
    expect(preferredLanguage('en;q=0,sv-FI;q=0.3')).toBe('sv')
    expect(preferredLanguage('*')).toBe('en')
    expect(preferredLanguage(undefined)).toBe('en')
  })
})
