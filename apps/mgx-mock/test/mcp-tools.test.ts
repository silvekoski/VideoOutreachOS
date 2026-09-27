import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  listClosedDealsOutput,
  nace2,
  RECENT_DEALS_LIMIT,
  searchBuyersOutput,
  submitFormOutput,
} from '../src/tools.ts'
import { startTestServer, type TestServer } from './test-server.ts'

let server: TestServer
let client: Client

beforeAll(async () => {
  server = await startTestServer()
  client = new Client({ name: 'mgx-mock-test', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)))
  await client.listTools()
})

afterAll(async () => {
  await client.close()
  await server.close()
})

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args })
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
  return result.structuredContent
}

describe('tool list', () => {
  test('has the three tools, each with an output schema', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual(['list_closed_deals', 'search_buyers', 'submit_form'])
    for (const tool of tools) expect(tool.outputSchema?.type).toBe('object')
  })
})

describe('search_buyers', () => {
  test('without a NACE code returns the featured buyers', async () => {
    const { buyers } = searchBuyersOutput.parse(await call('search_buyers', {}))
    const featured = server.seed.buyers.filter((buyer) => buyer.featured).map((buyer) => buyer.id)
    expect(featured.length).toBeGreaterThan(0)
    expect(buyers.map((buyer) => buyer.id).sort()).toEqual(featured.sort())
  })

  test('treats an empty NACE code as no code and filters the featured buyers by country', async () => {
    const { buyers } = searchBuyersOutput.parse(await call('search_buyers', { nace: ' ', country: 'FI' }))
    const expected = server.seed.buyers.filter((buyer) => buyer.featured && buyer.countries.includes('FI'))
    expect(expected.length).toBeGreaterThan(0)
    expect(buyers.map((buyer) => buyer.id)).toEqual(expected.map((buyer) => buyer.id))
  })

  test('matches the two-digit NACE prefix and the country', async () => {
    const { buyers } = searchBuyersOutput.parse(await call('search_buyers', { nace: '25.62', country: 'fi' }))
    const expected = server.seed.buyers.filter(
      (buyer) => buyer.nace.some((code) => nace2(code) === '25') && buyer.countries.includes('FI'),
    )
    expect(expected.length).toBeGreaterThan(0)
    expect(buyers.map((buyer) => buyer.id)).toEqual(expected.map((buyer) => buyer.id))
  })

  test('accepts other NACE notations', async () => {
    const dotted = searchBuyersOutput.parse(await call('search_buyers', { nace: '25.62' }))
    const lettered = searchBuyersOutput.parse(await call('search_buyers', { nace: 'C25.6' }))
    const plain = searchBuyersOutput.parse(await call('search_buyers', { nace: '2562' }))
    expect(dotted.buyers.length).toBeGreaterThan(0)
    expect(lettered).toEqual(dotted)
    expect(plain).toEqual(dotted)
  })

  test('returns no buyers for an unknown or invalid NACE code', async () => {
    expect(searchBuyersOutput.parse(await call('search_buyers', { nace: '99.99' })).buyers).toEqual([])
    expect(searchBuyersOutput.parse(await call('search_buyers', { nace: 'abc' })).buyers).toEqual([])
  })

  test('gives absolute logo URLs on this server that load as images', async () => {
    const { buyers } = searchBuyersOutput.parse(await call('search_buyers', { nace: '25' }))
    expect(buyers.length).toBeGreaterThan(0)
    for (const buyer of buyers) {
      expect(buyer.logoUrl).toMatch(new RegExp(`^${server.url}/logos/[a-z0-9-]+\\.(svg|png)$`))
      const response = await fetch(buyer.logoUrl ?? '')
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(/^image\/(svg\+xml|png)$/)
    }
  })
})

describe('list_closed_deals', () => {
  test('returns all deals with the same two-digit NACE code, newest first', async () => {
    const { deals } = listClosedDealsOutput.parse(await call('list_closed_deals', { nace: '25.62' }))
    const expected = server.seed.closedDeals.filter((deal) => nace2(deal.nace) === '25')
    expect(deals).toHaveLength(expected.length)
    expect(deals.every((deal) => nace2(deal.nace) === '25')).toBe(true)
    expect(deals.map((deal) => deal.year)).toEqual(deals.map((deal) => deal.year).sort((a, b) => b - a))
  })

  test('without a NACE code returns the newest deals of all sectors', async () => {
    const { deals } = listClosedDealsOutput.parse(await call('list_closed_deals', {}))
    const newestYear = Math.max(...server.seed.closedDeals.map((deal) => deal.year))
    expect(deals).toHaveLength(RECENT_DEALS_LIMIT)
    expect(deals[0]?.year).toBe(newestYear)
    expect(new Set(deals.map((deal) => nace2(deal.nace))).size).toBeGreaterThan(1)
  })

  test('returns no deals for an unknown NACE code', async () => {
    expect(listClosedDealsOutput.parse(await call('list_closed_deals', { nace: '99' })).deals).toEqual([])
  })
})

describe('submit_form', () => {
  test('appends one JSON line per submission and returns a receipt ID', async () => {
    const values = { revenue: { kind: 'range', min: 1000000, max: 3000000 }, staff: '20-49', message: 'Hej' }
    const first = submitFormOutput.parse(await call('submit_form', { dealId: 4001, values }))
    const second = submitFormOutput.parse(await call('submit_form', { dealId: 4007, values: {} }))
    expect(first.receiptId).not.toBe(second.receiptId)

    const file = path.join(server.storageDir, 'data', 'mgx-submissions.jsonl')
    const lines = (await readFile(file, 'utf8')).trimEnd().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ receiptId: first.receiptId, dealId: 4001, values })
    expect(lines[1]).toMatchObject({ receiptId: second.receiptId, dealId: 4007, values: {} })
    expect(Number.isNaN(Date.parse(String(lines[0]?.receivedAt)))).toBe(false)
  })

  test('rejects invalid input with a tool error', async () => {
    const result = await client.callTool({ name: 'submit_form', arguments: { dealId: -1, values: {} } })
    expect(result.isError).toBe(true)
  })
})
