import { randomInt } from 'node:crypto'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod'
import { log } from './log.ts'
import type { MgxSeed } from './seed.ts'

export const RECENT_DEALS_LIMIT = 10
const RECEIPT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const naceInput = z
  .string()
  .max(16)
  .optional()
  .describe('NACE code, for example "25.62". Matches on the two-digit prefix.')

export const searchBuyersInput = z.object({
  nace: naceInput,
  country: z.string().max(8).optional().describe('ISO 3166-1 alpha-2 code of the seller country, for example "FI".'),
})

export const searchBuyersOutput = z.object({
  buyers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      logoUrl: z.url().nullable(),
      website: z.url().nullable(),
      focus: z.string(),
      name_public: z.boolean(),
    }),
  ),
})

export const listClosedDealsInput = z.object({ nace: naceInput })

export const listClosedDealsOutput = z.object({
  deals: z.array(
    z.object({
      id: z.string(),
      year: z.int(),
      country: z.string(),
      nace: z.string(),
      text: z.string(),
      profitMultiple: z.number(),
    }),
  ),
})

export const submitFormInput = z.object({
  dealId: z.int().positive(),
  values: z.record(z.string(), z.unknown()),
})

export const submitFormOutput = z.object({ receiptId: z.string().regex(/^MGX-[A-Z2-7]{10}$/) })

export type BuyerResult = z.infer<typeof searchBuyersOutput>['buyers'][number]
export type ClosedDealResult = z.infer<typeof listClosedDealsOutput>['deals'][number]

export function nace2(value: string): string | null {
  return /^[A-Za-z]?\s*(\d{2})/.exec(value.trim())?.[1] ?? null
}

const isBlank = (value: string | undefined): value is undefined => value === undefined || value.trim() === ''

export function searchBuyers(
  seed: MgxSeed,
  input: z.infer<typeof searchBuyersInput>,
  logoBaseUrl: string,
): BuyerResult[] {
  const country = isBlank(input.country) ? null : input.country.trim().toUpperCase()
  const code = isBlank(input.nace) ? null : nace2(input.nace)
  if (!isBlank(input.nace) && code === null) return []
  return seed.buyers
    .filter((buyer) => (code === null ? buyer.featured : buyer.nace.some((entry) => nace2(entry) === code)))
    .filter((buyer) => country === null || buyer.countries.includes(country))
    .map((buyer) => ({
      id: buyer.id,
      name: buyer.name,
      logoUrl: buyer.logo === null ? null : `${logoBaseUrl}/logos/${encodeURIComponent(buyer.logo)}`,
      website: buyer.website,
      focus: buyer.focus,
      name_public: buyer.name_public,
    }))
}

export function listClosedDeals(seed: MgxSeed, input: z.infer<typeof listClosedDealsInput>): ClosedDealResult[] {
  const newestFirst = seed.closedDeals.toSorted((a, b) => b.year - a.year || a.id.localeCompare(b.id))
  if (isBlank(input.nace)) return newestFirst.slice(0, RECENT_DEALS_LIMIT)
  const code = nace2(input.nace)
  return code === null ? [] : newestFirst.filter((deal) => nace2(deal.nace) === code)
}

export function newReceiptId(): string {
  return `MGX-${Array.from({ length: 10 }, () => RECEIPT_ALPHABET[randomInt(RECEIPT_ALPHABET.length)]).join('')}`
}

function result(structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }
}

export interface McpContext {
  seed: MgxSeed
  logoBaseUrl: string
  submissionsFile: string
}

export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer({ name: 'mgx-mock', version: '0.1.0' })

  server.registerTool(
    'search_buyers',
    {
      title: 'Search buyers',
      description:
        'Find MGX buyers by NACE code and seller country. Without a NACE code, returns the featured buyers. Returns every match with its name_public flag: show only buyers with name_public true.',
      inputSchema: searchBuyersInput,
      outputSchema: searchBuyersOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const buyers = searchBuyers(ctx.seed, input, ctx.logoBaseUrl)
      log.info('tool call', { tool: 'search_buyers', nace: input.nace ?? null, country: input.country ?? null, results: buyers.length })
      return result({ buyers })
    },
  )

  server.registerTool(
    'list_closed_deals',
    {
      title: 'List closed deals',
      description:
        'List closed MGX deals with the profit multiple, newest first. With a NACE code, returns all deals with the same two-digit code. Without, returns the newest deals of all sectors.',
      inputSchema: listClosedDealsInput,
      outputSchema: listClosedDealsOutput,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const deals = listClosedDeals(ctx.seed, input)
      log.info('tool call', { tool: 'list_closed_deals', nace: input.nace ?? null, results: deals.length })
      return result({ deals })
    },
  )

  server.registerTool(
    'submit_form',
    {
      title: 'Submit form',
      description: 'Send the form values of a seller to MGX. Returns the receipt ID.',
      inputSchema: submitFormInput,
      outputSchema: submitFormOutput,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ dealId, values }) => {
      const receiptId = newReceiptId()
      const line = { receiptId, dealId, values, receivedAt: new Date().toISOString() }
      await mkdir(path.dirname(ctx.submissionsFile), { recursive: true })
      await appendFile(ctx.submissionsFile, `${JSON.stringify(line)}\n`, 'utf8')
      log.info('tool call', { tool: 'submit_form', dealId, receiptId })
      return result({ receiptId })
    },
  )

  return server
}
