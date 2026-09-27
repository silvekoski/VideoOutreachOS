import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { requireDeal } from '../../src/domain/deals.ts'
import { publish } from '../../src/domain/pipeline.ts'
import { parseRange } from '../../src/http/send-file.ts'
import { T0 } from '../domain/fixtures.ts'
import { MEDIA_BYTES, addRenderedVersion, createHarness, mediaBytes, publishedDeal, writeDealFile } from './harness.ts'
import type { Harness } from './harness.ts'

let h: Harness
let code: string

beforeEach(() => {
  h = createHarness()
  code = publishedDeal(h).linkCode
})

afterEach(() => {
  h.close()
})

async function bytes(res: Response): Promise<Buffer> {
  return Buffer.from(await res.arrayBuffer())
}

describe('GET /v/:code/media/:file', () => {
  it('serves the full file with cache and robots headers', async () => {
    const res = await h.request(`/v/${code}/media/video-720.v1.mp4`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(res.headers.get('content-length')).toBe(String(MEDIA_BYTES))
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect((await bytes(res)).equals(mediaBytes())).toBe(true)
  })

  it('answers range requests with 206 and 416', async () => {
    const first = await h.request(`/v/${code}/media/video-1080.v1.mp4`, { headers: { Range: 'bytes=0-99' } })
    expect(first.status).toBe(206)
    expect(first.headers.get('content-range')).toBe(`bytes 0-99/${MEDIA_BYTES}`)
    expect(first.headers.get('content-length')).toBe('100')
    expect((await bytes(first)).equals(mediaBytes().subarray(0, 100))).toBe(true)

    const suffix = await h.request(`/v/${code}/media/video-1080.v1.mp4`, { headers: { Range: 'bytes=-10' } })
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('content-range')).toBe(`bytes 990-999/${MEDIA_BYTES}`)
    expect((await bytes(suffix)).equals(mediaBytes().subarray(990))).toBe(true)

    const open = await h.request(`/v/${code}/media/video-1080.v1.mp4`, { headers: { Range: 'bytes=900-99999' } })
    expect(open.status).toBe(206)
    expect(open.headers.get('content-range')).toBe(`bytes 900-999/${MEDIA_BYTES}`)
    expect((await bytes(open)).length).toBe(100)

    const beyond = await h.request(`/v/${code}/media/video-1080.v1.mp4`, { headers: { Range: 'bytes=5000-' } })
    expect(beyond.status).toBe(416)
    expect(beyond.headers.get('content-range')).toBe(`bytes */${MEDIA_BYTES}`)
    expect(beyond.headers.get('x-robots-tag')).toBe('noindex, nofollow')

    const multi = await h.request(`/v/${code}/media/video-1080.v1.mp4`, { headers: { Range: 'bytes=0-1,5-6' } })
    expect(multi.status).toBe(200)
    expect((await bytes(multi)).length).toBe(MEDIA_BYTES)
  })

  it('answers HEAD requests without a body', async () => {
    const head = await h.request(`/v/${code}/media/video-720.v1.mp4`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(String(MEDIA_BYTES))
    expect((await bytes(head)).length).toBe(0)
    const ranged = await h.request(`/v/${code}/media/video-720.v1.mp4`, { method: 'HEAD', headers: { Range: 'bytes=10-19' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('content-length')).toBe('10')
    expect((await bytes(ranged)).length).toBe(0)
  })

  it('serves the poster as JPEG', async () => {
    const res = await h.request(`/v/${code}/media/poster.v1.jpg`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })

  it('serves only the files of the version that the page uses', async () => {
    writeDealFile(h.storageDir, 100, 'screenshot.png')
    writeDealFile(h.storageDir, 100, 'video-720.v2.mp4')
    for (const name of ['video-720.v2.mp4', 'screenshot.png', 'og-image.jpg', 'poster.v1.mp4', 'video-720.v01.mp4', '..%2Fog-image.jpg']) {
      expect((await h.request(`/v/${code}/media/${name}`)).status, name).toBe(404)
    }
    const version = addRenderedVersion(h)
    publish(h.db, 100, version, T0)
    expect((await h.request(`/v/${code}/media/video-720.v1.mp4`)).status).toBe(404)
    expect((await h.request(`/v/${code}/media/video-720.v2.mp4`)).status).toBe(200)
  })

  it('returns 410 after expiry and 404 for an unknown code', async () => {
    h.clock.now = new Date(requireDeal(h.db, 100).expiresAt ?? T0)
    expect((await h.request(`/v/${code}/media/video-720.v1.mp4`)).status).toBe(410)
    expect((await h.request('/v/AAAAAAAAAAAAAAAAAAAAAA/media/video-720.v1.mp4')).status).toBe(404)
  })
})

describe('GET /v/:code/og-image.jpg', () => {
  it('serves the preview image', async () => {
    const res = await h.request(`/v/${code}/og-image.jpg`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})

describe('GET /v/:code/captions.v:n.vtt', () => {
  it('builds WebVTT from the published timeline and the intro transcript', async () => {
    const res = await h.request(`/v/${code}/captions.v1.vtt`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    const text = await res.text()
    expect(text.startsWith('WEBVTT\n\n1\n00:00:00.000 --> ')).toBe(true)
    expect(text).toContain('Hei, olen Aino Mergerosta.')
    expect(text).toContain('Script of slide 8.')
    expect((await h.request(`/v/${code}/captions.v2.vtt`)).status).toBe(404)
  })
})

describe('parseRange', () => {
  it('parses single ranges and ignores other forms', () => {
    expect(parseRange('bytes=0-0', 10)).toEqual({ start: 0, end: 0 })
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
    expect(parseRange('bytes=-30', 10)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=4-', 10)).toEqual({ start: 4, end: 9 })
    expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=5-2', 10)).toBeNull()
    expect(parseRange('bytes=-', 10)).toBeNull()
    expect(parseRange('items=0-1', 10)).toBeNull()
  })
})

describe('GET /v/:code/logos/:index', () => {
  const logos = () => path.join(h.storageDir, 'cache', 'logos')

  beforeEach(() => {
    mkdirSync(logos(), { recursive: true })
    writeFileSync(path.join(logos(), 'b1.png'), 'png bytes')
  })

  it('serves the cached logo of the buyer at the index of slide 5', async () => {
    const res = await h.request(`/v/${code}/logos/0`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'")
    expect(res.headers.get('cache-control')).toBe('private, max-age=86400')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await res.text()).toBe('png bytes')
  })

  it('gives 404 for a buyer without a logo, a missing file, an unknown index and a path', async () => {
    for (const index of ['1', '2', '3', '..%2Fb1.png', '-1']) {
      expect((await h.request(`/v/${code}/logos/${index}`)).status, index).toBe(404)
    }
  })
})
