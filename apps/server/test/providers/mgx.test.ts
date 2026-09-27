import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ProviderError } from '../../src/providers/errors.ts'
import { McpMgxClient } from '../../src/providers/mgx.ts'

const calls: { tool: string; args: unknown }[] = []

function structured(value: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value }
}

function buildServer(): McpServer {
  const server = new McpServer({ name: 'mgx-test', version: '1.0.0' })
  server.registerTool(
    'search_buyers',
    { inputSchema: { nace: z.string().optional(), country: z.string().optional() } },
    async (args) => {
      calls.push({ tool: 'search_buyers', args })
      return structured({
        buyers: [
          { id: 7, name: 'Nordic Capital', logoUrl: '/logos/nordic.png', website: 'https://nordic.example', focus: 'Industrial services', name_public: true },
          { id: 'b-8', name: 'Hidden Buyer', logoUrl: 'https://cdn.example/hidden.svg', website: null, focus: 'Manufacturing', name_public: false },
          { id: 'b-9', name: 'No Logo Oy', logoUrl: null, website: '', focus: 'Metal', name_public: true },
        ],
      })
    },
  )
  server.registerTool('list_closed_deals', { inputSchema: { nace: z.string().optional() } }, async (args) => {
    calls.push({ tool: 'list_closed_deals', args })
    return structured({ deals: [{ id: 'd-1', year: 2025, country: 'FI', nace: '25.62', text: 'Machining company sold to a strategic buyer', profitMultiple: 6.5 }] })
  })
  server.registerTool(
    'submit_form',
    { inputSchema: { dealId: z.number(), values: z.record(z.string(), z.unknown()) } },
    async (args) => {
      calls.push({ tool: 'submit_form', args })
      if (args.dealId === 13) throw new Error('MGX rejected the form')
      if (args.dealId === 14) return structured({ receipt: 'wrong shape' })
      return structured({ receiptId: `r-${args.dealId}` })
    },
  )
  return server
}

let http: Server
let port = 0

function listen(): Promise<void> {
  http = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end()
      return
    }
    const server = buildServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => void server.close())
    await server.connect(transport)
    await transport.handleRequest(req, res)
  })
  return new Promise((resolve) => {
    http.listen(port, '127.0.0.1', () => {
      port = (http.address() as AddressInfo).port
      resolve()
    })
  })
}

function stop(): Promise<void> {
  http.closeAllConnections()
  return new Promise((resolve) => http.close(() => resolve()))
}

let client: McpMgxClient

beforeAll(async () => {
  await listen()
  client = new McpMgxClient(`http://127.0.0.1:${port}/mcp`)
})

afterAll(async () => {
  await client.close()
  await stop()
})

describe('McpMgxClient', () => {
  it('maps buyers: name_public to namePublic, logo paths to absolute URLs, ids to strings', async () => {
    const buyers = await client.searchBuyers({ nace: '25.62', country: undefined })
    expect(buyers).toEqual([
      { id: '7', name: 'Nordic Capital', logoUrl: `http://127.0.0.1:${port}/logos/nordic.png`, website: 'https://nordic.example', focus: 'Industrial services', namePublic: true },
      { id: 'b-8', name: 'Hidden Buyer', logoUrl: 'https://cdn.example/hidden.svg', website: null, focus: 'Manufacturing', namePublic: false },
      { id: 'b-9', name: 'No Logo Oy', logoUrl: null, website: null, focus: 'Metal', namePublic: true },
    ])
    expect(calls.at(-1)).toEqual({ tool: 'search_buyers', args: { nace: '25.62' } })
  })

  it('lists closed deals and submits the form', async () => {
    expect(await client.listClosedDeals({})).toEqual([
      { id: 'd-1', year: 2025, country: 'FI', nace: '25.62', text: 'Machining company sold to a strategic buyer', profitMultiple: 6.5 },
    ])
    expect(await client.submitForm({ dealId: 12, values: { revenue: '1000000-3000000 EUR' } })).toEqual({ receiptId: 'r-12' })
    expect(calls.at(-1)).toEqual({ tool: 'submit_form', args: { dealId: 12, values: { revenue: '1000000-3000000 EUR' } } })
  })

  it('throws a non-retryable error for a tool error or a wrong output shape', async () => {
    const failed = await client.submitForm({ dealId: 13, values: {} }).catch((caught: unknown) => caught)
    expect(failed).toBeInstanceOf(ProviderError)
    expect(failed).toMatchObject({ code: 'tool_error', retryable: false })
    expect((failed as Error).message).toContain('MGX rejected the form')
    await expect(client.submitForm({ dealId: 14, values: {} })).rejects.toMatchObject({ code: 'bad_output', retryable: false })
  })

  it('throws a retryable error while the server is down and connects again after a restart', async () => {
    await stop()
    const down = await client.listClosedDeals({ nace: '25' }).catch((caught: unknown) => caught)
    expect(down).toBeInstanceOf(ProviderError)
    expect(down).toMatchObject({ provider: 'mgx', retryable: true })
    await listen()
    expect(await client.listClosedDeals({ nace: '25' })).toHaveLength(1)
  })

  it('connects again lazily after close()', async () => {
    await client.close()
    expect(await client.submitForm({ dealId: 21, values: {} })).toEqual({ receiptId: 'r-21' })
  })
})
