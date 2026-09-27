import type { Stage } from '@mergero/shared'
import { log } from '../log.ts'
import { ProviderError, fetchFailure, isRetryableStatus } from './errors.ts'
import type {
  PipedriveActivityInput,
  PipedriveClient,
  PipedriveConfig,
  PipedriveDeal,
  PipedriveDealFields,
  PipedriveOrg,
  PipedrivePerson,
  PipedriveUser,
} from './types.ts'

const MAX_ATTEMPTS = 5
const MAX_WAIT_MS = 60_000
const REQUEST_TIMEOUT_MS = 30_000
const PAGE_LIMIT = 500
const LOST_REASON_MAX = 255

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT'
type Query = Record<string, string | number | boolean | undefined>

interface Envelope<T> {
  success?: boolean
  data: T
  additional_data?: { next_cursor?: string | null } | null
  error?: string
  error_info?: string
}

interface V2Deal {
  id: number
  title: string
  owner_id: number
  person_id: number | null
  org_id: number | null
  stage_id: number | null
  status: string
  is_deleted?: boolean
  custom_fields?: Record<string, unknown> | null
}

interface ContactItem {
  value?: string | null
  primary?: boolean
}

interface V2Person {
  id: number
  name: string
  first_name?: string | null
  job_title?: string | null
  emails?: ContactItem[] | null
  phones?: ContactItem[] | null
  custom_fields?: Record<string, unknown> | null
}

interface V2Address {
  value?: string | null
  country?: string | null
  formatted_address?: string | null
}

interface V2Org {
  id: number
  name: string
  website?: string | null
  address?: V2Address | null
  custom_fields?: Record<string, unknown> | null
}

interface V1User {
  id: number
  name: string
  email?: string | null
  active_flag?: boolean
  is_deleted?: boolean
  timezone_name?: string | null
}

export interface RealPipedriveOptions {
  token: string
  domain: string
  config: PipedriveConfig
}

export class RealPipedriveClient implements PipedriveClient {
  readonly mode = 'real' as const
  readonly #token: string
  readonly #base: string
  readonly #config: PipedriveConfig

  constructor(options: RealPipedriveOptions) {
    this.#token = options.token
    this.#base = `https://${companySubdomain(options.domain)}.pipedrive.com`
    this.#config = options.config
  }

  async listUsers(): Promise<PipedriveUser[]> {
    const { data } = await this.#call<V1User[] | null>('GET', '/api/v1/users')
    return (data ?? []).map((user) => ({
      id: user.id,
      name: user.name,
      email: text(user.email),
      active: user.active_flag !== false && user.is_deleted !== true,
      timeZone: text(user.timezone_name),
    }))
  }

  async getDeal(id: number): Promise<PipedriveDeal | null> {
    const deal = await this.#getOrNull<V2Deal>(`/api/v2/deals/${id}`, { custom_fields: this.#config.dealFields.video })
    return deal ? this.#toDeal(deal) : null
  }

  async getPerson(id: number): Promise<PipedrivePerson | null> {
    const roleKey = this.#config.personFields.role
    const person = await this.#getOrNull<V2Person>(`/api/v2/persons/${id}`, {
      custom_fields: roleKey ?? undefined,
      include_option_labels: roleKey ? true : undefined,
    })
    if (!person) return null
    return {
      id: person.id,
      name: person.name,
      firstName: text(person.first_name),
      jobTitle: text(person.job_title) ?? (roleKey ? text(person.custom_fields?.[roleKey]) : null),
      email: primaryValue(person.emails),
      phone: primaryValue(person.phones),
    }
  }

  async getOrg(id: number): Promise<PipedriveOrg | null> {
    const { businessId, nace } = this.#config.orgFields
    const org = await this.#getOrNull<V2Org>(`/api/v2/organizations/${id}`, { custom_fields: `${businessId},${nace}` })
    if (!org) return null
    return {
      id: org.id,
      name: org.name,
      website: text(org.website),
      countryCode: addressCountryCode(org.address),
      businessId: text(org.custom_fields?.[businessId]),
      nace: text(org.custom_fields?.[nace]),
    }
  }

  async listDealsWithoutVideoField(): Promise<PipedriveDeal[]> {
    const deals: PipedriveDeal[] = []
    let cursor: string | undefined
    do {
      const page = await this.#call<V2Deal[] | null>('GET', '/api/v2/deals', {
        query: { status: 'open', limit: PAGE_LIMIT, custom_fields: this.#config.dealFields.video, cursor },
      })
      for (const raw of page.data ?? []) {
        const deal = this.#toDeal(raw)
        if (!deal.videoUrl) deals.push(deal)
      }
      cursor = page.additional_data?.next_cursor ?? undefined
    } while (cursor)
    return deals
  }

  async setVideoField(dealId: number, url: string): Promise<void> {
    await this.#patchDeal(dealId, { custom_fields: { [this.#config.dealFields.video]: url } })
  }

  async moveStage(dealId: number, stage: Stage): Promise<void> {
    await this.#patchDeal(dealId, { stage_id: this.#config.stages[stage], pipeline_id: this.#config.pipelineId })
  }

  async setLost(dealId: number, reason: string): Promise<void> {
    const lostReason = reason.trim().slice(0, LOST_REASON_MAX)
    await this.#patchDeal(dealId, lostReason ? { status: 'lost', lost_reason: lostReason } : { status: 'lost' })
  }

  async setDealFields(dealId: number, fields: PipedriveDealFields): Promise<void> {
    const customFields: Record<string, string | number | null> = {}
    for (const [name, value] of Object.entries(fields) as [keyof PipedriveDealFields, string | number | null | undefined][]) {
      if (value !== undefined) customFields[this.#config.dealFields[name]] = value
    }
    if (Object.keys(customFields).length > 0) await this.#patchDeal(dealId, { custom_fields: customFields })
  }

  async addActivity(input: PipedriveActivityInput): Promise<number> {
    const { data } = await this.#call<{ id: number }>('POST', '/api/v2/activities', {
      body: {
        subject: input.subject,
        type: input.type,
        owner_id: input.ownerId,
        deal_id: input.dealId,
        due_date: input.dueDate,
        ...(input.note === null ? {} : { note: input.note }),
      },
    })
    return data.id
  }

  async markActivityDone(activityId: number): Promise<void> {
    await this.#call('PATCH', `/api/v2/activities/${activityId}`, { body: { done: true } })
  }

  async upsertNote(dealId: number, noteId: number | null, html: string): Promise<number> {
    if (noteId !== null) {
      try {
        const { data } = await this.#call<{ id: number }>('PUT', `/api/v1/notes/${noteId}`, { body: { content: html } })
        return data.id
      } catch (error) {
        if (!(error instanceof ProviderError && error.status === 404)) throw error
        log.warn('pipedrive note not found, creating a new note', { dealId, noteId })
      }
    }
    const { data } = await this.#call<{ id: number }>('POST', '/api/v1/notes', {
      body: { content: html, deal_id: dealId, pinned_to_deal_flag: 1 },
    })
    return data.id
  }

  dealUrl(dealId: number): string {
    return `${this.#base}/deal/${dealId}`
  }

  #toDeal(deal: V2Deal): PipedriveDeal {
    return {
      id: deal.id,
      title: deal.title,
      ownerId: deal.owner_id,
      personId: deal.person_id ?? null,
      orgId: deal.org_id ?? null,
      stageId: deal.stage_id ?? null,
      status: deal.is_deleted ? 'deleted' : dealStatus(deal.status),
      videoUrl: text(deal.custom_fields?.[this.#config.dealFields.video]),
    }
  }

  async #patchDeal(dealId: number, body: Record<string, unknown>): Promise<void> {
    await this.#call('PATCH', `/api/v2/deals/${dealId}`, { body })
  }

  async #getOrNull<T>(path: string, query: Query): Promise<T | null> {
    try {
      const { data } = await this.#call<T | null>('GET', path, { query })
      return data ?? null
    } catch (error) {
      if (error instanceof ProviderError && (error.status === 404 || error.status === 410)) return null
      throw error
    }
  }

  async #call<T>(method: Method, path: string, options: { query?: Query; body?: unknown } = {}): Promise<Envelope<T>> {
    const url = new URL(path, this.#base)
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(name, String(value))
    }
    const headers: Record<string, string> = { 'x-api-token': this.#token, accept: 'application/json' }
    if (options.body !== undefined) headers['content-type'] = 'application/json'

    for (let attempt = 1; ; attempt++) {
      let res: Response
      try {
        res = await fetch(url, {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        const failure = fetchFailure(error)
        throw new ProviderError(`Pipedrive ${method} ${path}: ${failure.message}`, {
          provider: 'pipedrive',
          code: failure.code,
          retryable: true,
          cause: error,
        })
      }

      if (res.status === 429) {
        const waitMs = retryDelayMs(res.headers, attempt)
        await res.body?.cancel()
        if (attempt >= MAX_ATTEMPTS || waitMs > MAX_WAIT_MS) {
          throw new ProviderError(`Pipedrive ${method} ${path}: rate limited after ${attempt} attempts`, {
            provider: 'pipedrive',
            status: 429,
            code: 'rate_limited',
            retryable: true,
          })
        }
        log.warn('pipedrive rate limited, waiting', { method, path, attempt, waitMs })
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        continue
      }

      let body: string
      try {
        body = await res.text()
      } catch (error) {
        const failure = fetchFailure(error)
        throw new ProviderError(`Pipedrive ${method} ${path}: ${failure.message}`, {
          provider: 'pipedrive',
          status: res.status,
          code: failure.code,
          retryable: true,
          cause: error,
        })
      }
      const json = parseJson(body) as Envelope<T> | null
      if (!res.ok || json === null || json.success === false) {
        const detail = json ? [json.error, json.error_info].filter(Boolean).join(': ') : 'response is not JSON'
        throw new ProviderError(`Pipedrive ${method} ${path}: HTTP ${res.status} ${detail || res.statusText}`, {
          provider: 'pipedrive',
          status: res.status,
          code: `http_${res.status}`,
          retryable: isRetryableStatus(res.status),
        })
      }
      return json
    }
  }
}

function retryDelayMs(headers: Headers, attempt: number): number {
  const retryAfter = headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000
    const at = Date.parse(retryAfter)
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now())
  }
  const reset = Number(headers.get('x-ratelimit-reset'))
  if (Number.isFinite(reset) && reset > 0) return reset * 1000
  return 2000 * 2 ** (attempt - 1)
}

function parseJson(body: string): unknown {
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

function companySubdomain(domain: string): string {
  const host = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/\.pipedrive\.com$/i, '')
  if (!/^[a-z0-9-]+$/i.test(host)) throw new Error(`PIPEDRIVE_COMPANY_DOMAIN is not a valid company domain: "${domain}"`)
  return host.toLowerCase()
}

function dealStatus(status: string): PipedriveDeal['status'] {
  return status === 'won' || status === 'lost' || status === 'deleted' ? status : 'open'
}

function text(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value.trim() || null
  if (value && typeof value === 'object') {
    const record = value as { value?: unknown; label?: unknown }
    return text(record.label ?? record.value)
  }
  return null
}

function primaryValue(items: ContactItem[] | null | undefined): string | null {
  if (!items?.length) return null
  return text((items.find((item) => item.primary) ?? items[0])?.value)
}

const REGION_LOCALES = ['en', 'fi', 'sv', 'nb', 'da', 'de']
let regions: { byName: Map<string, string>; codes: Set<string> } | null = null

function foldName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z]/g, '')
}

function canonicalRegion(code: string): string {
  return Intl.getCanonicalLocales(`und-${code}`)[0]?.slice(4) ?? code
}

function regionTable(): { byName: Map<string, string>; codes: Set<string> } {
  if (regions) return regions
  const byName = new Map<string, string>()
  const codes = new Set<string>()
  const displayNames = REGION_LOCALES.map((locale) => new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' }))
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const code = String.fromCharCode(first, second)
      if (canonicalRegion(code) !== code) continue
      for (const names of displayNames) {
        const label = names.of(code)
        if (!label) continue
        codes.add(code)
        if (!byName.has(foldName(label))) byName.set(foldName(label), code)
      }
    }
  }
  regions = { byName, codes }
  return regions
}

function regionCode(name: string | null | undefined): string | null {
  const value = name?.trim()
  if (!value) return null
  const table = regionTable()
  if (/^[a-z]{2}$/i.test(value)) {
    const code = canonicalRegion(value.toUpperCase())
    return table.codes.has(code) ? code : null
  }
  return table.byName.get(foldName(value)) ?? null
}

function addressCountryCode(address: V2Address | null | undefined): string | null {
  if (!address) return null
  const lastPart = (value: string | null | undefined) => value?.split(',').at(-1)
  return (
    regionCode(address.country) ?? regionCode(lastPart(address.formatted_address)) ?? regionCode(lastPart(address.value))
  )
}
