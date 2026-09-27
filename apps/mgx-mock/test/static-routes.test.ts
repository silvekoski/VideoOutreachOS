import { request } from 'node:http'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { startTestServer, type TestServer } from './test-server.ts'

let server: TestServer

beforeAll(async () => {
  server = await startTestServer()
})

afterAll(async () => {
  await server.close()
})

interface RawResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

function raw(rawPath: string, method = 'GET'): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.port, path: rawPath, method }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

describe('sites', () => {
  test('serves the home page of a site as HTML with CORS', async () => {
    const res = await raw('/sites/kivirannan-konepaja/')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.body.startsWith('<!DOCTYPE html>')).toBe(true)
  })

  test('serves the index file of the about page folder', async () => {
    const res = await raw('/sites/brenner-hydraulik/ueber-uns/')
    expect(res.status).toBe(200)
    expect(res.body).toContain('<html lang="de">')
  })

  test('redirects a folder without a trailing slash and keeps the query', async () => {
    const res = await raw('/sites/kivirannan-konepaja?ref=crm')
    expect(res.status).toBe(301)
    expect(res.headers.location).toBe('/sites/kivirannan-konepaja/?ref=crm')
  })

  test('answers HEAD with headers and no body', async () => {
    const res = await raw('/sites/kivirannan-konepaja/', 'HEAD')
    expect(res.status).toBe(200)
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0)
    expect(res.body).toBe('')
  })

  test('returns 404 for a missing page, a file with a trailing slash and the bare prefix', async () => {
    expect((await raw('/sites/no-such-site/')).status).toBe(404)
    expect((await raw('/sites/kivirannan-konepaja/index.html/')).status).toBe(404)
    expect((await raw('/sites/')).status).toBe(404)
  })

  test('rejects other methods', async () => {
    const res = await raw('/sites/kivirannan-konepaja/', 'POST')
    expect(res.status).toBe(405)
    expect(res.headers.allow).toBe('GET, HEAD')
  })
})

describe('logos', () => {
  test('serves a logo as SVG with CORS', async () => {
    const res = await raw('/logos/taratest.svg')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/svg+xml')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.body).toContain('<svg')
  })

  test('does not list the folder', async () => {
    expect((await raw('/logos/')).status).toBe(404)
  })
})

describe('path traversal', () => {
  test.each([
    '/sites/../mgx.json',
    '/sites/%2e%2e/mgx.json',
    '/sites/..%2fmgx.json',
    '/sites/%2e%2e%2fmgx.json',
    '/sites/%2e%2e%5cmgx.json',
    '/sites/kivirannan-konepaja/..%2f..%2fpipedrive.json',
    '/sites/kivirannan-konepaja/%2e%2e/%2e%2e/pipedrive.json',
    '/logos/.%2e/mgx.json',
    '/logos/..%2f..%2fapps%2fmgx-mock%2fpackage.json',
    '/logos/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '/logos/arvola-industrial.svg%00.png',
    '/sites/.hidden',
    '/sites/%E0%A4%A',
  ])('blocks %s', async (rawPath) => {
    const res = await raw(rawPath)
    expect(res.status).toBe(404)
    expect(res.body).toBe('Not found')
  })
})

describe('other routes', () => {
  test('health returns 200', async () => {
    const res = await raw('/health')
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' })
  })

  test('the MCP endpoint accepts only POST', async () => {
    const res = await raw('/mcp')
    expect(res.status).toBe(405)
    expect(res.headers.allow).toBe('POST')
  })

  test('the MCP endpoint rejects a foreign Origin', async () => {
    const res = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: { origin: 'https://attacker.example', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(403)
  })

  test('an unknown path returns 404', async () => {
    expect((await raw('/nothing-here')).status).toBe(404)
  })
})
