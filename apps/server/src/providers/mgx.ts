import type { MgxBuyer, MgxClosedDeal } from '@mergero/shared'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { log } from '../log.ts'
import { ProviderError } from './errors.ts'
import type { MgxClient } from './types.ts'

const PROVIDER = 'mgx'
const CALL_TIMEOUT_MS = 30_000

const id = z.union([z.string().min(1), z.number()]).transform(String)

const buyersOutput = z.object({
  buyers: z.array(
    z.object({
      id,
      name: z.string(),
      logoUrl: z.string().nullish(),
      website: z.string().nullish(),
      focus: z.string(),
      name_public: z.boolean(),
    }),
  ),
})

const dealsOutput = z.object({
  deals: z.array(
    z.object({
      id,
      year: z.number().int(),
      country: z.string(),
      nace: z.string(),
      text: z.string(),
      profitMultiple: z.number(),
    }),
  ),
})

const submitOutput = z.object({ receiptId: z.string().min(1) })

export class McpMgxClient implements MgxClient {
  readonly #url: URL
  #client: Client | null = null
  #connecting: Promise<Client> | null = null

  constructor(url: string) {
    this.#url = new URL(url)
  }

  async searchBuyers(input: { nace?: string; country?: string }): Promise<MgxBuyer[]> {
    const { buyers } = await this.#call('search_buyers', input, buyersOutput)
    return buyers.map((buyer) => ({
      id: buyer.id,
      name: buyer.name,
      logoUrl: this.#absolute(buyer.logoUrl),
      website: buyer.website?.trim() || null,
      focus: buyer.focus,
      namePublic: buyer.name_public,
    }))
  }

  async listClosedDeals(input: { nace?: string }): Promise<MgxClosedDeal[]> {
    const { deals } = await this.#call('list_closed_deals', input, dealsOutput)
    return deals
  }

  async submitForm(input: { dealId: number; values: Record<string, unknown> }): Promise<{ receiptId: string }> {
    return this.#call('submit_form', input, submitOutput)
  }

  async close(): Promise<void> {
    const client = this.#client
    this.#client = null
    this.#connecting = null
    await client?.close()
  }

  #absolute(url: string | null | undefined): string | null {
    if (!url?.trim()) return null
    try {
      return new URL(url.trim(), this.#url).href
    } catch {
      return null
    }
  }

  async #call<T>(name: string, input: object, schema: z.ZodType<T>): Promise<T> {
    const args = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
    let result: Awaited<ReturnType<Client['callTool']>>
    try {
      result = await this.#invoke(name, args)
    } catch (error) {
      if (!isConnectionError(error)) throw callError(name, error)
      log.warn('mgx connection failed, reconnecting once', { tool: name, error: messageOf(error) })
      await this.close().catch(() => undefined)
      try {
        result = await this.#invoke(name, args)
      } catch (retryError) {
        await this.close().catch(() => undefined)
        throw callError(name, retryError)
      }
    }
    if (result.isError === true) {
      const content = Array.isArray(result.content) ? result.content : []
      const text = content.map((item: { type?: string; text?: string }) => (item.type === 'text' ? item.text : '')).join(' ')
      throw new ProviderError(`MGX ${name} failed: ${text.trim() || 'tool error'}`, {
        provider: PROVIDER,
        code: 'tool_error',
        retryable: false,
      })
    }
    const parsed = schema.safeParse(result.structuredContent)
    if (!parsed.success) {
      throw new ProviderError(`MGX ${name} returned unexpected content: ${z.prettifyError(parsed.error)}`, {
        provider: PROVIDER,
        code: 'bad_output',
        retryable: false,
      })
    }
    return parsed.data
  }

  async #invoke(name: string, args: Record<string, unknown>) {
    const client = await this.#connect()
    return client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS })
  }

  #connect(): Promise<Client> {
    if (this.#client) return Promise.resolve(this.#client)
    this.#connecting ??= (async () => {
      const client = new Client({ name: 'mergero-server', version: '0.1.0' })
      client.onerror = (error) => {
        if (!/abort/i.test(`${error.name} ${error.message}`)) log.warn('mgx transport error', { error: error.message })
      }
      try {
        await client.connect(new StreamableHTTPClientTransport(this.#url))
        this.#client = client
        return client
      } catch (error) {
        await client.close().catch(() => undefined)
        throw error
      } finally {
        this.#connecting = null
      }
    })()
    return this.#connecting
  }
}

function isConnectionError(error: unknown): boolean {
  return (
    (error instanceof TypeError && /fetch failed/i.test(error.message)) ||
    error instanceof StreamableHTTPError ||
    (error instanceof McpError && error.code === ErrorCode.ConnectionClosed)
  )
}

function callError(name: string, error: unknown): ProviderError {
  if (error instanceof ProviderError) return error
  const timeout = error instanceof McpError && error.code === ErrorCode.RequestTimeout
  return new ProviderError(`MGX ${name}: ${messageOf(error)}`, {
    provider: PROVIDER,
    code: timeout ? 'timeout' : isConnectionError(error) ? 'network' : 'mcp_error',
    retryable: timeout || isConnectionError(error),
    cause: error,
  })
}

function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message
}
