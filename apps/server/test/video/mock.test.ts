import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../../src/env.ts'
import { handleError, handleNotFound } from '../../src/html/errors.ts'
import { AsiakastietoClient } from '../../src/providers/asiakastieto.ts'
import { createMockRoutes } from '../../src/routes/mock/index.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function app(seedFile: string): Hono {
  const hono = new Hono()
  hono.route('/', createMockRoutes(seedFile))
  hono.notFound(handleNotFound)
  hono.onError(handleError)
  return hono
}

describe('GET /mock/asiakastieto/:businessId', () => {
  const seeded = app(path.join(env.seedDir, 'asiakastieto.json'))

  it('returns the financials of a known business ID from the seed file', async () => {
    const res = await seeded.request('/mock/asiakastieto/0712834-9')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ businessId: '0712834-9', revenue: 7_450_000, profit: 980_000, fiscalYear: 2025 })
  })

  it('returns 404 for an unknown business ID', async () => {
    const res = await seeded.request('/mock/asiakastieto/9999999-9')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No financial data for the business ID 9999999-9' })
    expect((await seeded.request('/mock/asiakastieto/constructor')).status).toBe(404)
  })

  it('works with the Asiakastieto client', async () => {
    const client = new AsiakastietoClient('http://mock.test/mock/asiakastieto')
    const fetchMock = async (input: string | URL | Request) => seeded.request(String(input))
    const original = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      expect(await client.get('1049382-2')).toEqual({ businessId: '1049382-2', revenue: 5_260_000, profit: 720_000, fiscalYear: 2025 })
      expect(await client.get('0000000-0')).toBeNull()
    } finally {
      globalThis.fetch = original
    }
  })

  it('fails with 500 on a broken seed file and reads the file again on the next request', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mergero-mock-'))
    dirs.push(dir)
    const file = path.join(dir, 'asiakastieto.json')
    writeFileSync(file, '{"companies": ')
    const broken = app(file)
    expect((await broken.request('/mock/asiakastieto/1', { headers: { accept: 'application/json' } })).status).toBe(500)
    writeFileSync(file, JSON.stringify({ companies: { '1': { revenue: 1, profit: 2, fiscalYear: 2024 } } }))
    expect((await broken.request('/mock/asiakastieto/1')).status).toBe(200)
  })
})
