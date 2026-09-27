import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../../src/providers/errors.ts'
import { RealPipedriveClient } from '../../src/providers/pipedrive-real.ts'
import type { PipedriveConfig } from '../../src/providers/types.ts'

const config: PipedriveConfig = {
  pipelineId: 7,
  stages: { link_sent: 71, opened: 72, form_sent: 73, meeting_booked: 74 },
  dealFields: {
    video: 'k_video',
    revenueRange: 'k_revenue',
    profitRange: 'k_profit',
    staffRange: 'k_staff',
    valuationRange: 'k_valuation',
    watchTimeS: 'k_watch',
    stopSlide: 'k_stop',
    replayCount: 'k_replays',
    watchPerSlide: 'k_per_slide',
    linkChannel: 'k_channel',
  },
  orgFields: { businessId: 'k_business_id', nace: 'k_nace' },
  personFields: { role: 'k_role' },
}

interface Recorded {
  method: string
  url: URL
  headers: Headers
  body: unknown
}

type Reply = { status?: number; json?: unknown; text?: string; headers?: Record<string, string> }

let requests: Recorded[]
let routes: ((request: Recorded) => Reply | undefined)[]

function json(data: unknown, extra: Record<string, unknown> = {}): Reply {
  return { json: { success: true, data, ...extra } }
}

beforeEach(() => {
  requests = []
  routes = []
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const request: Recorded = {
      method: init.method ?? 'GET',
      url: new URL(String(input)),
      headers: new Headers(init.headers),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    requests.push(request)
    for (const route of routes) {
      const reply = route(request)
      if (!reply) continue
      const body = reply.text ?? JSON.stringify(reply.json ?? null)
      return new Response(body, { status: reply.status ?? 200, headers: reply.headers })
    }
    return new Response(JSON.stringify({ success: false, error: 'not found' }), { status: 404 })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const client = () => new RealPipedriveClient({ token: 'secret-token', domain: 'https://acme.pipedrive.com/', config })

describe('RealPipedriveClient', () => {
  it('reads a deal through API v2 with the token header and maps the Video field', async () => {
    routes.push((r) =>
      r.url.pathname === '/api/v2/deals/12'
        ? json({
            id: 12,
            title: 'Acme Oy',
            owner_id: 3,
            person_id: 5,
            org_id: 9,
            stage_id: 71,
            status: 'open',
            custom_fields: { k_video: 'https://tool.example/deals/12' },
          })
        : undefined,
    )
    const deal = await client().getDeal(12)
    expect(deal).toEqual({
      id: 12,
      title: 'Acme Oy',
      ownerId: 3,
      personId: 5,
      orgId: 9,
      stageId: 71,
      status: 'open',
      videoUrl: 'https://tool.example/deals/12',
    })
    const [request] = requests
    expect(request?.url.origin).toBe('https://acme.pipedrive.com')
    expect(request?.url.searchParams.get('custom_fields')).toBe('k_video')
    expect(request?.headers.get('x-api-token')).toBe('secret-token')
    expect(request?.url.searchParams.has('api_token')).toBe(false)
  })

  it('returns null for an unknown deal', async () => {
    expect(await client().getDeal(404)).toBeNull()
  })

  it('waits for Retry-After on HTTP 429 and tries again', async () => {
    let calls = 0
    routes.push((r) => {
      if (r.url.pathname !== '/api/v2/deals/1') return undefined
      calls++
      return calls === 1
        ? { status: 429, json: { success: false, error: 'Too many requests' }, headers: { 'retry-after': '1' } }
        : json({ id: 1, title: 'Deal', owner_id: 1, person_id: null, org_id: null, stage_id: null, status: 'lost' })
    })
    const started = Date.now()
    const deal = await client().getDeal(1)
    expect(Date.now() - started).toBeGreaterThanOrEqual(950)
    expect(calls).toBe(2)
    expect(deal?.status).toBe('lost')
  })

  it('gives up with a retryable error when the wait is too long', async () => {
    routes.push(() => ({ status: 429, json: { success: false }, headers: { 'retry-after': '3600' } }))
    const error = await client().getDeal(1).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ status: 429, retryable: true })
    expect(requests).toHaveLength(1)
  })

  it('maps the organization custom fields and the country from the address', async () => {
    routes.push((r) =>
      r.url.pathname === '/api/v2/organizations/9'
        ? json({
            id: 9,
            name: 'Acme Oy',
            website: 'https://acme.fi',
            address: { value: 'Mannerheimintie 1, 00100 Helsinki, Finland', country: 'Finland' },
            custom_fields: { k_business_id: '1234567-8', k_nace: '25.62' },
          })
        : r.url.pathname === '/api/v2/organizations/10'
          ? json({ id: 10, name: 'Muster GmbH', address: { value: 'Hauptstraße 1, 10115 Berlin, Deutschland' }, custom_fields: {} })
          : r.url.pathname === '/api/v2/organizations/11'
            ? json({ id: 11, name: 'Nordic AS', address: { country: 'NO' }, custom_fields: null })
            : r.url.pathname === '/api/v2/organizations/12'
              ? json({ id: 12, name: 'Alpen AG', address: { formatted_address: 'Bahnhofstrasse 1, 8001 Zürich, Schweiz' } })
              : undefined,
    )
    const pipedrive = client()
    expect(await pipedrive.getOrg(9)).toEqual({
      id: 9,
      name: 'Acme Oy',
      website: 'https://acme.fi',
      countryCode: 'FI',
      businessId: '1234567-8',
      nace: '25.62',
    })
    expect(requests[0]?.url.searchParams.get('custom_fields')).toBe('k_business_id,k_nace')
    expect(await pipedrive.getOrg(10)).toMatchObject({ countryCode: 'DE', website: null, businessId: null, nace: null })
    expect((await pipedrive.getOrg(11))?.countryCode).toBe('NO')
    expect((await pipedrive.getOrg(12))?.countryCode).toBe('CH')
  })

  it('uses job_title for the role and falls back to the person field', async () => {
    routes.push((r) =>
      r.url.pathname === '/api/v2/persons/5'
        ? json({
            id: 5,
            name: 'Matti Meikäläinen',
            first_name: 'Matti',
            emails: [
              { value: 'other@acme.fi', primary: false },
              { value: 'matti@acme.fi', primary: true },
            ],
            phones: [{ value: '+358401234567', primary: true }],
            custom_fields: { k_role: { id: 4, label: 'CEO' } },
          })
        : r.url.pathname === '/api/v2/persons/6'
          ? json({ id: 6, name: 'Anna', job_title: 'Chair of the board', custom_fields: { k_role: 'CEO' } })
          : undefined,
    )
    const pipedrive = client()
    expect(await pipedrive.getPerson(5)).toEqual({
      id: 5,
      name: 'Matti Meikäläinen',
      firstName: 'Matti',
      jobTitle: 'CEO',
      email: 'matti@acme.fi',
      phone: '+358401234567',
    })
    expect(requests[0]?.url.searchParams.get('custom_fields')).toBe('k_role')
    expect(await pipedrive.getPerson(6)).toMatchObject({ jobTitle: 'Chair of the board', firstName: null, email: null })
  })

  it('writes the deal fields as v2 custom fields', async () => {
    routes.push((r) => (r.method === 'PATCH' ? json({ id: 12 }) : undefined))
    const pipedrive = client()
    await pipedrive.setDealFields(12, {
      revenueRange: '1000000-3000000 EUR',
      valuationRange: null,
      watchTimeS: 95.5,
      stopSlide: undefined,
      watchPerSlide: '1: 31 s, 2: 18 s',
      linkChannel: 'WhatsApp',
    })
    await pipedrive.setDealFields(12, {})
    await pipedrive.moveStage(12, 'form_sent')
    await pipedrive.setLost(12, '  Not selling  ')
    await pipedrive.setVideoField(12, 'https://tool.example/deals/12')
    expect(requests.map((r) => [r.method, r.url.pathname, r.body])).toEqual([
      [
        'PATCH',
        '/api/v2/deals/12',
        {
          custom_fields: {
            k_revenue: '1000000-3000000 EUR',
            k_valuation: null,
            k_watch: 95.5,
            k_per_slide: '1: 31 s, 2: 18 s',
            k_channel: 'WhatsApp',
          },
        },
      ],
      ['PATCH', '/api/v2/deals/12', { stage_id: 73, pipeline_id: 7 }],
      ['PATCH', '/api/v2/deals/12', { status: 'lost', lost_reason: 'Not selling' }],
      ['PATCH', '/api/v2/deals/12', { custom_fields: { k_video: 'https://tool.example/deals/12' } }],
    ])
    expect(requests[0]?.headers.get('content-type')).toBe('application/json')
  })

  it('creates and updates the meeting brief note through API v1', async () => {
    routes.push((r) => {
      if (r.method === 'POST' && r.url.pathname === '/api/v1/notes') return json({ id: 501 })
      if (r.method === 'PUT' && r.url.pathname === '/api/v1/notes/501') return json({ id: 501 })
      return undefined
    })
    const pipedrive = client()
    expect(await pipedrive.upsertNote(12, null, '<p>Brief</p>')).toBe(501)
    expect(await pipedrive.upsertNote(12, 501, '<p>Brief v2</p>')).toBe(501)
    expect(await pipedrive.upsertNote(12, 999, '<p>Brief v3</p>')).toBe(501)
    expect(requests.map((r) => [r.method, r.url.pathname, r.body])).toEqual([
      ['POST', '/api/v1/notes', { content: '<p>Brief</p>', deal_id: 12, pinned_to_deal_flag: 1 }],
      ['PUT', '/api/v1/notes/501', { content: '<p>Brief v2</p>' }],
      ['PUT', '/api/v1/notes/999', { content: '<p>Brief v3</p>' }],
      ['POST', '/api/v1/notes', { content: '<p>Brief v3</p>', deal_id: 12, pinned_to_deal_flag: 1 }],
    ])
  })

  it('adds an activity and marks it done through API v2', async () => {
    routes.push((r) => (r.url.pathname.startsWith('/api/v2/activities') ? json({ id: 88 }) : undefined))
    const pipedrive = client()
    const id = await pipedrive.addActivity({ dealId: 12, ownerId: 3, type: 'call', subject: 'Call Matti', note: null, dueDate: '2026-09-28' })
    await pipedrive.markActivityDone(id)
    expect(requests.map((r) => [r.method, r.url.pathname, r.body])).toEqual([
      ['POST', '/api/v2/activities', { subject: 'Call Matti', type: 'call', owner_id: 3, deal_id: 12, due_date: '2026-09-28' }],
      ['PATCH', '/api/v2/activities/88', { done: true }],
    ])
  })

  it('pages through open deals with the cursor and keeps deals without a Video URL', async () => {
    routes.push((r) => {
      if (r.url.pathname !== '/api/v2/deals') return undefined
      const deal = (id: number, video: string | null) => ({
        id,
        title: `Deal ${id}`,
        owner_id: 1,
        person_id: null,
        org_id: null,
        stage_id: null,
        status: 'open',
        custom_fields: { k_video: video },
      })
      return r.url.searchParams.get('cursor') === 'page-2'
        ? json([deal(3, null)], { additional_data: { next_cursor: null } })
        : json([deal(1, null), deal(2, 'https://tool.example/deals/2')], { additional_data: { next_cursor: 'page-2' } })
    })
    const deals = await client().listDealsWithoutVideoField()
    expect(deals.map((deal) => deal.id)).toEqual([1, 3])
    expect(requests).toHaveLength(2)
    expect(requests[0]?.url.searchParams.get('status')).toBe('open')
    expect(requests[0]?.url.searchParams.get('limit')).toBe('500')
    expect(requests[1]?.url.searchParams.get('cursor')).toBe('page-2')
  })

  it('reads users through API v1', async () => {
    routes.push((r) =>
      r.url.pathname === '/api/v1/users'
        ? json([
            { id: 1, name: 'Aino', email: 'aino@mergero.com', active_flag: true, timezone_name: 'Europe/Berlin' },
            { id: 2, name: 'Old', email: '', active_flag: false },
          ])
        : undefined,
    )
    expect(await client().listUsers()).toEqual([
      { id: 1, name: 'Aino', email: 'aino@mergero.com', active: true, timeZone: 'Europe/Berlin' },
      { id: 2, name: 'Old', email: null, active: false, timeZone: null },
    ])
  })

  it('throws a non-retryable error for a Cloudflare HTML 403 and a retryable one for a 503', async () => {
    routes.push((r) =>
      r.url.pathname === '/api/v2/deals/1'
        ? { status: 403, text: '<html>blocked</html>' }
        : { status: 503, json: { success: false, error: 'unavailable' } },
    )
    const pipedrive = client()
    await expect(pipedrive.getDeal(1)).rejects.toMatchObject({ status: 403, retryable: false })
    await expect(pipedrive.getDeal(2)).rejects.toMatchObject({ status: 503, retryable: true })
  })

  it('builds the Pipedrive deal link from the company domain', () => {
    expect(client().dealUrl(12)).toBe('https://acme.pipedrive.com/deal/12')
    expect(() => new RealPipedriveClient({ token: 't', domain: 'bad domain', config })).toThrow(/PIPEDRIVE_COMPANY_DOMAIN/)
  })
})
