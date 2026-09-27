import { existsSync, rmSync } from 'node:fs'
import { ADMIN_REQUEST_HEADER } from '@mergero/shared'
import type { ApiError } from '@mergero/shared'
import { Hono } from 'hono'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { paths } = await import('../../src/paths.ts')
const { adminRoutes, allowedAdminHost } = await import('../../src/routes/admin/index.ts')
const { PUBLIC_BASE_URL } = await import('./temp-storage.ts')
const { createHarness } = await import('./harness.ts')

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n')
const CHANGE_REFUSED = { error: 'The admin API accepts changes only from the admin panel' }

let h: Harness

beforeEach(async () => {
  h = createHarness()
  expect((await h.request('/api/analysts')).status).toBe(200)
})

afterEach(() => h.close())

afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

async function refused(response: Response): Promise<[number, unknown, string | null]> {
  return [response.status, await response.json(), response.headers.get('access-control-allow-origin')]
}

describe('cross-site request guard', () => {
  it('refuses a change without the admin panel header and does not run it', async () => {
    expect(await refused(await adminRoutes.request('/api/deals/4001/ensure', { method: 'POST' }))).toEqual([403, CHANGE_REFUSED, null])
    expect(
      await refused(
        await adminRoutes.request('/api/alerts/seen', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: JSON.stringify({ analyst: 1001 }),
        }),
      ),
    ).toEqual([403, CHANGE_REFUSED, null])
    expect((await h.request('/api/deals/4001')).status).toBe(404)
  })

  it('refuses a multipart upload from a form on another site', async () => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array(PDF)], 'consent.pdf'))
    form.append('date', '2026-09-20')
    const response = await adminRoutes.request('/api/analysts/1001/consent', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' },
      body: form,
    })
    expect(await refused(response)).toEqual([403, CHANGE_REFUSED, null])
    expect(existsSync(paths.consent(1001))).toBe(false)
  })

  it('refuses the header when the browser reports another site or origin', async () => {
    const cases: Record<string, string>[] = [
      { [ADMIN_REQUEST_HEADER]: '1', 'Sec-Fetch-Site': 'cross-site' },
      { [ADMIN_REQUEST_HEADER]: '1', 'Sec-Fetch-Site': 'same-site' },
      { [ADMIN_REQUEST_HEADER]: '1', 'Sec-Fetch-Site': 'none' },
      { [ADMIN_REQUEST_HEADER]: '1', Origin: 'https://evil.example' },
      { [ADMIN_REQUEST_HEADER]: '0', 'Sec-Fetch-Site': 'same-origin' },
    ]
    for (const headers of cases) {
      const response = await adminRoutes.request('/api/deals/4001/ensure', { method: 'POST', headers })
      expect([headers, response.status]).toEqual([headers, 403])
    }
    expect((await h.request('/api/deals/4001')).status).toBe(404)
  })

  it('refuses a CORS preflight, so no other site can send the header', async () => {
    const response = await adminRoutes.request('/api/deals/4001/approve', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': ADMIN_REQUEST_HEADER },
    })
    expect(await refused(response)).toEqual([403, CHANGE_REFUSED, null])
  })

  it('accepts a change with the header from the same origin', async () => {
    const bySite = await adminRoutes.request('/api/deals/4001/ensure', {
      method: 'POST',
      headers: { [ADMIN_REQUEST_HEADER]: '1', 'Sec-Fetch-Site': 'same-origin', Origin: 'http://localhost' },
    })
    expect(bySite.status).toBe(200)
    const byOrigin = await adminRoutes.request('/api/deals/4001/ensure', {
      method: 'POST',
      headers: { [ADMIN_REQUEST_HEADER]: '1', Origin: 'http://localhost' },
    })
    expect([byOrigin.status, await byOrigin.json()]).toEqual([200, { id: 4001, created: false, refreshed: true, refreshError: null }])
  })

  it('leaves the video page routes to the page and its beacons', async () => {
    const app = new Hono()
    app.route('/', adminRoutes)
    app.post('/v/:code/events', (c) => c.body(null, 204))
    const beacon = await app.request('http://mergero.example/v/AAAAAAAAAAAAAAAAAAAAAA/events', {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8', 'Sec-Fetch-Site': 'same-origin' },
      body: '{}',
    })
    expect(beacon.status).toBe(204)
  })

  it('lets reads through without the header', async () => {
    const response = await adminRoutes.request('/api/deals', { headers: { 'Sec-Fetch-Site': 'cross-site' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('host check against DNS rebinding', () => {
  it('answers only on a local host, an IP address or the admin host', async () => {
    const rebound = await adminRoutes.request('http://rebind.evil.example:3000/api/deals')
    expect([rebound.status, ((await rebound.json()) as ApiError).error]).toEqual([
      403,
      'The admin API answers only on localhost, an IP address or the host of ADMIN_BASE_URL',
    ])
    for (const url of ['http://127.0.0.1:3000/api/deals', 'http://[::1]:3000/api/deals', `${PUBLIC_BASE_URL}/api/deals`]) {
      expect([url, (await adminRoutes.request(url)).status]).toEqual([url, 200])
    }
  })

  it('knows the allowed host names', () => {
    const base = 'http://mergero.lan:3000'
    for (const host of ['localhost', 'admin.localhost', '192.168.1.20', '10.0.0.5', '[::1]', '[fd00::1]', 'mergero.lan']) {
      expect([host, allowedAdminHost(host, base)]).toEqual([host, true])
    }
    for (const host of ['evil.example', 'localhost.evil.example', '192.168.1.20.nip.io', 'mergero.lan.evil.example']) {
      expect([host, allowedAdminHost(host, base)]).toEqual([host, false])
    }
  })
})
