import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as sleep } from 'node:timers/promises'
import type { Lang } from '../packages/shared/src/types.ts'

export const STATE_ENV = 'MERGERO_E2E_STATE'
export const ADMIN_HEADERS = { 'X-Mergero-Admin': '1' }

export type DealKey = 'fi' | 'de' | 'ch'

export interface E2eDeal {
  id: number
  code: string
  pageLanguage: Lang
}

export interface E2eState {
  baseUrl: string
  storageDir: string
  deals: Record<DealKey, E2eDeal>
}

let cached: E2eState | null = null

export function readState(): E2eState {
  const file = process.env[STATE_ENV]
  if (!file) throw new Error(`${STATE_ENV} is not set. Run the tests with the global setup of playwright.config.ts.`)
  cached ??= JSON.parse(readFileSync(file, 'utf8')) as E2eState
  return cached
}

export class AdminError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AdminError'
    this.status = status
  }
}

export interface AdminClient {
  get<T>(route: string): Promise<T>
  post<T>(route: string, body?: unknown): Promise<T>
}

export function adminClient(baseUrl: string): AdminClient {
  async function send<T>(method: 'GET' | 'POST', route: string, body?: unknown): Promise<T> {
    const form = body instanceof FormData
    const response = await fetch(new URL(route, baseUrl), {
      method,
      headers: form || body === undefined ? ADMIN_HEADERS : { ...ADMIN_HEADERS, 'Content-Type': 'application/json' },
      body: form ? body : body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new AdminError(response.status, `${method} ${route} gave ${response.status}: ${text}`)
    return (text === '' ? undefined : JSON.parse(text)) as T
  }
  return {
    get: (route) => send('GET', route),
    post: (route, body) => send('POST', route, body),
  }
}

export async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  options: { what: string; timeoutMs: number; intervalMs?: number },
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs
  for (;;) {
    const value = await check()
    if (value !== null && value !== undefined && value !== false) return value
    if (Date.now() > deadline) throw new Error(`Timed out after ${options.timeoutMs / 1000} s: ${options.what}`)
    await sleep(options.intervalMs ?? 1000)
  }
}

export function setExpiresAt(state: E2eState, dealId: number, expiresAt: Date): void {
  const db = new DatabaseSync(path.join(state.storageDir, 'data', 'app.sqlite'))
  try {
    db.exec('PRAGMA busy_timeout = 5000')
    db.prepare('UPDATE deals SET expires_at = ? WHERE id = ?').run(expiresAt.toISOString(), dealId)
  } finally {
    db.close()
  }
}

export interface FakePipedriveDeal {
  id: number
  stage: string | null
  status: string
  fields?: Record<string, string | number | null | undefined>
}

export async function fakePipedriveDeal(state: E2eState, dealId: number): Promise<FakePipedriveDeal | undefined> {
  const store = JSON.parse(await readFile(path.join(state.storageDir, 'data', 'fake-pipedrive.json'), 'utf8')) as {
    deals: FakePipedriveDeal[]
  }
  return store.deals.find((deal) => deal.id === dealId)
}
