import { once } from 'node:events'
import { rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { serve } from '@hono/node-server'
import type { TemplatePreviewDto } from '@mergero/shared'
import { Hono } from 'hono'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { paths } = await import('../../src/paths.ts')
const { parseRange } = await import('../../src/http/send-file.ts')
const { adminRoutes } = await import('../../src/routes/admin/index.ts')
const { insertAnalyst, insertDeal } = await import('../domain/fixtures.ts')
const { createHarness, writeStorageFile } = await import('./harness.ts')

const VIDEO = Buffer.from(Array.from({ length: 1000 }, (_, index) => index % 251))

let h: Harness

beforeEach(() => {
  h = createHarness()
  insertAnalyst(h.db)
  insertDeal(h.db, { id: 100 })
  insertDeal(h.db, { id: 101 })
  writeStorageFile('deals/100/video-1080.v1.mp4', VIDEO)
  writeStorageFile('deals/100/audio/slide-2.v1.mp3', 'mp3 data')
  writeStorageFile('deals/100/screenshot.png', 'png data')
  writeStorageFile('deals/100/.video-1080.v2.1a2b3c4d.tmp.mp4', 'partial')
  writeStorageFile('deals/101/video-720.v1.mp4', 'other deal')
  writeStorageFile('analysts/10/intro-fi.mp4', VIDEO)
  writeStorageFile('analysts/10/notes.txt', 'private')
})

afterEach(() => h.close())

afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

const bytes = async (response: Response) => Buffer.from(await response.arrayBuffer())

describe('parseRange', () => {
  it('handles the byte range forms of RFC 9110', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=0-99999', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=5-2', 1000)).toBeNull()
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull()
    expect(parseRange('items=0-1', 1000)).toBeNull()
    expect(parseRange('bytes=-', 1000)).toBeNull()
  })
})

describe('GET /api/deals/:id/files/:file', () => {
  const url = '/api/deals/100/files/video-1080.v1.mp4'

  it('serves the whole file with the range and cache headers', async () => {
    const response = await h.request(url)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(response.headers.get('content-length')).toBe('1000')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('cache-control')).toBe('private, max-age=86400, immutable')
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(await bytes(response)).toEqual(VIDEO)
  })

  it('answers range requests with 206 and 416', async () => {
    const first = await h.request(url, { headers: { range: 'bytes=0-99' } })
    expect(first.status).toBe(206)
    expect(first.headers.get('content-range')).toBe('bytes 0-99/1000')
    expect(first.headers.get('content-length')).toBe('100')
    expect(await bytes(first)).toEqual(VIDEO.subarray(0, 100))

    const suffix = await h.request(url, { headers: { range: 'bytes=-100' } })
    expect(await bytes(suffix)).toEqual(VIDEO.subarray(900))

    const open = await h.request(url, { headers: { range: 'bytes=950-' } })
    expect(open.headers.get('content-range')).toBe('bytes 950-999/1000')
    expect(await bytes(open)).toEqual(VIDEO.subarray(950))

    const outside = await h.request(url, { headers: { range: 'bytes=5000-' } })
    expect(outside.status).toBe(416)
    expect(outside.headers.get('content-range')).toBe('bytes */1000')

    const multi = await h.request(url, { headers: { range: 'bytes=0-1,5-6' } })
    expect(multi.status).toBe(200)
    expect(await bytes(multi)).toEqual(VIDEO)
  })

  it('answers HEAD without a body', async () => {
    const head = await h.request(url, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe('1000')
    expect((await bytes(head)).length).toBe(0)
    const ranged = await h.request(url, { method: 'HEAD', headers: { range: 'bytes=10-19' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('content-length')).toBe('10')
  })

  it('sends an attachment with download=1 and serves files in sub folders', async () => {
    const download = await h.request(`${url}?download=1`)
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="deal-100-video-1080.v1.mp4"')
    const audio = await h.request('/api/deals/100/files/audio/slide-2.v1.mp3')
    expect(audio.status).toBe(200)
    expect(audio.headers.get('content-type')).toBe('audio/mpeg')
    const screenshot = await h.request('/api/deals/100/files/screenshot.png')
    expect(screenshot.headers.get('cache-control')).toBe('private, no-cache')
  })

  it('blocks path traversal, hidden files, other deals and unknown deals', async () => {
    const blocked = [
      '/api/deals/100/files/..%2F..%2Fdata%2Fapp.sqlite',
      '/api/deals/100/files/..%2F101%2Fvideo-720.v1.mp4',
      '/api/deals/100/files/audio%2F..%2F..%2F101%2Fvideo-720.v1.mp4',
      '/api/deals/100/files/%2E%2E%2F%2E%2E%2Fdata%2Fapp.sqlite',
      '/api/deals/100/files/.video-1080.v2.1a2b3c4d.tmp.mp4',
      '/api/deals/100/files/audio',
      '/api/deals/100/files/missing.mp4',
      '/api/deals/999/files/video-1080.v1.mp4',
    ]
    for (const path of blocked) {
      const response = await h.request(path)
      expect([path, response.status]).toEqual([path, 404])
      expect(((await response.json()) as { error: string }).error).toBeTypeOf('string')
    }
  })
})

describe('adminRoutes mounted in a parent app over a real socket', () => {
  it('keeps the ApiError handler and serves ranges and HEAD', async () => {
    const app = new Hono()
    app.route('/', adminRoutes)
    app.onError((_error, c) => c.text('parent handler', 500))
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
    await once(server, 'listening')
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const file = `${base}/api/deals/100/files/video-1080.v1.mp4`
    try {
      const ranged = await fetch(file, { headers: { range: 'bytes=10-19' } })
      expect(ranged.status).toBe(206)
      expect(ranged.headers.get('content-range')).toBe('bytes 10-19/1000')
      expect(await bytes(ranged)).toEqual(VIDEO.subarray(10, 20))
      const head = await fetch(file, { method: 'HEAD' })
      expect([head.status, head.headers.get('content-length')]).toEqual([200, '1000'])
      const missing = await fetch(`${base}/api/deals/100/files/missing.mp4`)
      expect([missing.status, await missing.json()]).toEqual([404, { error: 'The file does not exist' }])
      const unknown = await fetch(`${base}/api/nothing`)
      expect([unknown.status, await unknown.json()]).toEqual([404, { error: 'The API has no such route' }])
      const forged = await fetch(`${base}/api/deals/100/approve`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
      expect([forged.status, await forged.json()]).toEqual([403, { error: 'The admin API accepts changes only from the admin panel' }])
    } finally {
      if ('closeAllConnections' in server) server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

describe('analyst files and template previews', () => {
  it('serves the intro with range requests and only the known file names', async () => {
    const intro = await h.request('/api/analysts/10/files/intro-fi.mp4', { headers: { range: 'bytes=0-9' } })
    expect(intro.status).toBe(206)
    expect(await bytes(intro)).toEqual(VIDEO.subarray(0, 10))
    for (const path of [
      '/api/analysts/10/files/notes.txt',
      '/api/analysts/10/files/voice-sample.mp3',
      '/api/analysts/10/files/..%2F..%2Fdata%2Fapp.sqlite',
      '/api/analysts/99/files/intro-fi.mp4',
    ]) {
      expect([path, (await h.request(path)).status]).toEqual([path, 404])
    }
  })

  it('lists the template previews and serves the images', async () => {
    writeStorageFile('templates/slide-1.jpg', 'jpeg')
    const { body } = await h.json<TemplatePreviewDto[]>('/api/templates')
    expect(body).toHaveLength(8)
    expect(body[0]?.imageUrl).toMatch(/^\/api\/templates\/slide-1\.jpg\?v=\d+$/u)
    expect(body.slice(1).every((preview) => preview.imageUrl === null)).toBe(true)
    expect(body[4]).toEqual({ slide: 5, name: 'Buyers from Mergero deals', imageUrl: null })
    const image = await h.request('/api/templates/slide-1.jpg')
    expect(image.status).toBe(200)
    expect(image.headers.get('content-type')).toBe('image/jpeg')
    expect((await h.request('/api/templates/slide-2.jpg')).status).toBe(404)
    expect((await h.request('/api/templates/slide-9.jpg')).status).toBe(404)
    expect((await h.request('/api/templates/..%2Fdata%2Fapp.sqlite')).status).toBe(404)
  })
})
