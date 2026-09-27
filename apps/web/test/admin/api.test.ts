import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, apiUrl, errorMessage, isReviewReasonList, request, reviewIsWorking } from '../../src/admin/api'
import { ADMIN_REQUEST_HEADER } from '@mergero/shared'
import type { ReviewDto } from '@mergero/shared'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(response: Response) {
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('apiUrl', () => {
  it('adds only the set query values', () => {
    expect(apiUrl('/api/deals', { analyst: 3, q: '', country: null, status: undefined })).toBe('/api/deals?analyst=3')
    expect(apiUrl('/api/status')).toBe('/api/status')
  })
})

describe('request', () => {
  it('sends JSON and parses the response', async () => {
    const fetch = stubFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await expect(request('PATCH', '/api/analysts/1', { json: { briefLanguage: 'fi' } })).resolves.toEqual({ ok: true })
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"briefLanguage":"fi"}')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('marks each request as a request of the admin panel', async () => {
    const fetch = stubFetch(new Response(null, { status: 204 }))
    const form = new FormData()
    form.append('date', '2026-09-20')
    await request('POST', '/api/deals/1/approve')
    await request('POST', '/api/analysts/1/consent', { form })
    for (const [, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect((init.headers as Record<string, string>)[ADMIN_REQUEST_HEADER]).toBe('1')
    }
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('returns undefined for 204', async () => {
    stubFetch(new Response(null, { status: 204 }))
    await expect(request('POST', '/api/tasks/1/done')).resolves.toBeUndefined()
  })

  it('throws the API error with its detail', async () => {
    const detail = [{ code: 'text_too_long', slide: 5, detail: 'Slide 5, buyer focus: 96 of 80 characters' }]
    stubFetch(new Response(JSON.stringify({ error: 'Blocking review reasons', detail }), { status: 409 }))
    const error = await request('POST', '/api/deals/1/approve').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).status).toBe(409)
    expect((error as ApiRequestError).message).toBe('Blocking review reasons')
    expect(isReviewReasonList((error as ApiRequestError).detail)).toBe(true)
  })

  it('names the HTTP status when the error body is not JSON', async () => {
    stubFetch(new Response('Bad gateway', { status: 502 }))
    await expect(request('GET', '/api/inbox')).rejects.toThrow('HTTP status 502')
  })

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const error = await request('GET', '/api/status').catch((reason: unknown) => reason)
    expect((error as ApiRequestError).status).toBe(0)
  })
})

describe('errorMessage', () => {
  it('reads the message of an error', () => {
    expect(errorMessage(new Error('No such deal'))).toBe('No such deal')
    expect(errorMessage('x')).toBe('Something went wrong. Try again.')
  })
})

describe('reviewIsWorking', () => {
  const base = {
    status: 'review',
    version: 2,
    publishedVersion: null,
    approved: false,
    renderStatus: 'rendered',
    expired: false,
    pipeline: { running: false, step: null },
    failedJobs: [],
    reviewReasons: [],
  } as unknown as ReviewDto

  it('polls while the pipeline runs', () => {
    expect(reviewIsWorking({ ...base, pipeline: { running: true, step: 'audio' } })).toBe(true)
  })

  it('polls after approval until this version is published', () => {
    expect(reviewIsWorking({ ...base, approved: true })).toBe(true)
    expect(reviewIsWorking({ ...base, approved: true, status: 'link_sent', publishedVersion: 1 })).toBe(true)
    expect(reviewIsWorking({ ...base, approved: true, status: 'link_sent', publishedVersion: 2 })).toBe(false)
  })

  it('stops when a job failed or nothing runs', () => {
    expect(reviewIsWorking(base)).toBe(false)
    expect(
      reviewIsWorking({ ...base, approved: true, failedJobs: [{ id: 1, type: 'render', error: 'x', updatedAt: '' }] }),
    ).toBe(false)
    expect(reviewIsWorking(undefined)).toBe(false)
  })

  it('stops for an approved version that a review reason blocks, a lost deal or an expired link', () => {
    const reason = { code: 'model_failed' as const, slide: 5 as const, detail: 'The model failed twice' }
    expect(reviewIsWorking({ ...base, approved: true, renderStatus: 'pending', reviewReasons: [reason] })).toBe(false)
    expect(reviewIsWorking({ ...base, approved: true, status: 'lost' })).toBe(false)
    expect(reviewIsWorking({ ...base, renderStatus: 'rendering', expired: true })).toBe(false)
  })
})
