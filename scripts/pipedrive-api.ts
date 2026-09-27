import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import type { Env } from '../apps/server/src/env.ts'
import type { PipedriveConfig } from '../apps/server/src/providers/types.ts'

type Method = 'GET' | 'POST' | 'PATCH'
type ApiPath = `/api/v1/${string}` | `/api/v2/${string}`
type Query = Record<string, string | number | undefined>

interface Envelope<T> {
  success?: boolean
  data?: T
  error?: string
  error_info?: string
  additional_data?: { next_cursor?: string | null } | null
}

export interface PipedriveApi {
  request<T>(method: Method, apiPath: ApiPath, options?: { query?: Query; body?: unknown }): Promise<T>
  list<T>(apiPath: `/api/v2/${string}`, query?: Query): Promise<T[]>
}

export interface PdDeal {
  id: number
  title: string
  custom_fields?: Record<string, unknown> | null
}

const MIN_INTERVAL_MS = 150
const MAX_RETRIES = 5
const TIMEOUT_MS = 30_000

export async function loadScriptEnv(): Promise<Env> {
  const file = path.resolve(import.meta.dirname, '../.env')
  if (existsSync(file)) {
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (value !== undefined && process.env[key] === undefined) process.env[key] = value
    }
  }
  const { env } = await import('../apps/server/src/env.ts')
  return env
}

export function required(value: string | null, name: string): string {
  if (value === null) {
    console.error(`${name} is not set. Add it to .env or to the environment.`)
    process.exit(1)
  }
  return value
}

export function baseUrlFor(domain: string): string {
  if (/^https?:\/\//.test(domain)) return domain.replace(/\/+$/, '')
  return `https://${domain.replace(/\.pipedrive\.com$/, '')}.pipedrive.com`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get('retry-after'))
  if (retryAfter > 0) return retryAfter * 1000
  const reset = Number(res.headers.get('x-ratelimit-reset'))
  if (reset > 0) return reset * 1000
  return Math.min(2000 * 2 ** attempt, 30_000)
}

export function createPipedriveApi(token: string, baseUrl: string): PipedriveApi {
  let nextRequestAt = 0

  async function send<T>(method: Method, apiPath: ApiPath, options: { query?: Query; body?: unknown }): Promise<Envelope<T>> {
    const url = new URL(baseUrl + apiPath)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    for (let attempt = 0; ; attempt++) {
      await sleep(Math.max(0, nextRequestAt - Date.now()))
      nextRequestAt = Date.now() + MIN_INTERVAL_MS
      const res = await fetch(url, {
        method,
        headers: {
          'x-api-token': token,
          accept: 'application/json',
          ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const delay = retryDelayMs(res, attempt)
        console.warn(`Pipedrive rate limit on ${method} ${apiPath}, retry in ${Math.ceil(delay / 1000)} s`)
        await sleep(delay)
        continue
      }
      const text = await res.text()
      let json: Envelope<T> | null = null
      try {
        json = text ? (JSON.parse(text) as Envelope<T>) : null
      } catch {
        json = null
      }
      if (!res.ok || json === null || json.success === false) {
        const reason = json?.error ? `${json.error}${json.error_info ? ` (${json.error_info})` : ''}` : text.slice(0, 200)
        throw new Error(`Pipedrive ${method} ${apiPath} failed with HTTP ${res.status}: ${reason}`)
      }
      return json
    }
  }

  return {
    request: async <T>(method: Method, apiPath: ApiPath, options: { query?: Query; body?: unknown } = {}) =>
      (await send<T>(method, apiPath, options)).data as T,
    list: async <T>(apiPath: `/api/v2/${string}`, query: Query = {}) => {
      const items: T[] = []
      let cursor: string | undefined
      do {
        const page = await send<T[]>('GET', apiPath, { query: { ...query, limit: 500, cursor } })
        items.push(...(page.data ?? []))
        cursor = page.additional_data?.next_cursor ?? undefined
      } while (cursor)
      return items
    },
  }
}

export async function writeVideoFields(
  api: PipedriveApi,
  config: PipedriveConfig,
  adminBaseUrl: string,
): Promise<{ updated: number; unchanged: number }> {
  const key = config.dealFields.video
  const deals = await api.list<PdDeal>('/api/v2/deals', { custom_fields: key })
  let updated = 0
  for (const deal of deals) {
    const url = `${adminBaseUrl}/deals/${deal.id}`
    if (deal.custom_fields?.[key] === url) continue
    await api.request('PATCH', `/api/v2/deals/${deal.id}`, { body: { custom_fields: { [key]: url } } })
    updated++
  }
  return { updated, unchanged: deals.length - updated }
}
