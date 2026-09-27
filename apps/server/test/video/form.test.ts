import type { FormSubmitBody } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireDeal } from '../../src/domain/deals.ts'
import { listEvents } from '../../src/domain/events.ts'
import { jobsForDeal } from '../../src/queue/index.ts'
import { DEAL_ID, T0, snapshot } from '../domain/fixtures.ts'
import { RECEIPT_ID, createHarness, draftDeal, json, mgxData, publishedDeal } from './harness.ts'
import type { Harness } from './harness.ts'

let h: Harness

beforeEach(() => {
  h = createHarness()
})

afterEach(() => {
  h.close()
})

const BODY: FormSubmitBody = {
  revenue: { kind: 'range', min: 1_000_000, max: 3_000_000 },
  profit: { kind: 'exact', value: 500_000 },
  staff: '20-49',
  timing: 'in_1_3_years',
  notInterestedReason: 'Only for not interested',
  custom: [
    { questionId: 'q1', answer: 'Yes, since 1998' },
    { questionId: 'removed', answer: 'Lost answer' },
  ],
  message: '',
}

function post(code: string, body: unknown): Promise<Response> {
  return h.request(`/v/${code}/form`, json(body, { accept: 'application/json' }))
}

function pipedriveOps(): string[] {
  return jobsForDeal(h.db, DEAL_ID, ['pipedrive-write']).map((job) => job.key)
}

describe('POST /v/:code/form', () => {
  it('sends the form to MGX, stores it and moves the stage', async () => {
    const deal = publishedDeal(h, { patch: { customQuestions: [{ id: 'q1', text: 'Do you own the building?' }] } })
    const res = await post(deal.linkCode, BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, valuation: null })

    const answers = {
      revenue: BODY.revenue,
      profit: BODY.profit,
      staff: '20-49',
      timing: 'in_1_3_years',
      notInterestedReason: null,
      custom: [{ questionId: 'q1', question: 'Do you own the building?', answer: 'Yes, since 1998' }],
      message: null,
      submittedAt: T0.toISOString(),
    }
    expect(h.mgx.submitForm).toHaveBeenCalledWith({ dealId: DEAL_ID, values: { ...answers, valuation: null } })
    const stored = requireDeal(h.db, DEAL_ID)
    expect(stored).toMatchObject({ form: answers, formSentAt: T0.toISOString(), mgxReceiptId: RECEIPT_ID, valuation: null, status: 'form_sent' })
    const [formEvent] = listEvents(h.db, DEAL_ID, { types: ['form_sent'] })
    expect(formEvent?.data).toEqual({ receiptId: RECEIPT_ID })
    expect(pipedriveOps()).toEqual(
      expect.arrayContaining([`pipedrive-write:${DEAL_ID}:stage:form_sent`, `pipedrive-write:${DEAL_ID}:fields:${RECEIPT_ID}`]),
    )
  })

  it('returns 502 and stores nothing when MGX fails', async () => {
    const deal = publishedDeal(h)
    h.mgx.submitForm.mockRejectedValueOnce(new Error('MGX is down'))
    const res = await post(deal.linkCode, BODY)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'MGX did not accept the form' })
    const stored = requireDeal(h.db, DEAL_ID)
    expect(stored).toMatchObject({ form: null, formSentAt: null, mgxReceiptId: null, valuation: null, status: 'link_sent' })
    expect(listEvents(h.db, DEAL_ID, { types: ['form_sent'] })).toEqual([])
    expect(pipedriveOps()).toEqual([`pipedrive-write:${DEAL_ID}:stage:link_sent`])
  })

  it('computes the valuation range for a DACH deal from the closed deals of the same NACE code', async () => {
    const mgx = mgxData([7, 4, 6, 5])
    mgx.recentDeals = [{ id: 'other', year: 2025, country: 'DE', nace: '10.71', text: 'Bakery', profitMultiple: 20 }]
    const deal = publishedDeal(h, { patch: { country: 'DE', pageLanguage: 'de', mgx } })
    const res = await post(deal.linkCode, { ...BODY, profit: { kind: 'range', min: 500_000, max: 1_000_000 } })
    const valuation = { available: true, low: 2_375_000, high: 6_250_000, p25: 4.75, p75: 6.25, dealCount: 4, nace2: '25' }
    expect(await res.json()).toEqual({ ok: true, valuation })
    expect(requireDeal(h.db, DEAL_ID).valuation).toEqual(valuation)
    expect(h.mgx.submitForm.mock.calls[0]?.[0].values.valuation).toEqual(valuation)
  })

  it('gives no range for a DACH deal with fewer than three closed deals', async () => {
    const deal = publishedDeal(h, { patch: { country: 'CH', pageLanguage: 'de', mgx: mgxData([4, 5]), snapshot: { ...snapshot(), country: 'CH' } } })
    const body = (await (await post(deal.linkCode, BODY)).json()) as { valuation: { available: boolean; dealCount: number } }
    expect(body.valuation).toMatchObject({ available: false, dealCount: 2, low: null, high: null })
  })

  it('sets the deal to lost with the reason when the owner is not interested', async () => {
    const deal = publishedDeal(h)
    await post(deal.linkCode, { ...BODY, timing: 'not_interested', notInterestedReason: 'We keep the company in the family' })
    const stored = requireDeal(h.db, DEAL_ID)
    expect(stored).toMatchObject({ status: 'lost', lostReason: 'We keep the company in the family', lostAt: T0.toISOString() })
    expect(stored.form?.notInterestedReason).toBe('We keep the company in the family')
    expect(listEvents(h.db, DEAL_ID, { types: ['form_sent', 'lost'] }).map((item) => item.type)).toEqual(['form_sent', 'lost'])
    expect(pipedriveOps().some((key) => key.startsWith(`pipedrive-write:${DEAL_ID}:lost:`))).toBe(true)
  })

  it('uses a default lost reason when the owner gives none', async () => {
    const deal = publishedDeal(h)
    await post(deal.linkCode, { ...BODY, timing: 'not_interested', notInterestedReason: null })
    expect(requireDeal(h.db, DEAL_ID).lostReason).toBe('Not interested in a sale')
  })

  it('rejects an empty or invalid form without a call to MGX', async () => {
    const deal = publishedDeal(h)
    const empty = await post(deal.linkCode, { revenue: null, profit: null, staff: null, timing: null, notInterestedReason: null, custom: [{ questionId: 'q9', answer: 'x' }], message: ' ' })
    expect(empty.status).toBe(400)
    const invalid = await post(deal.linkCode, { ...BODY, revenue: { kind: 'range', min: 5, max: 1 } })
    expect(invalid.status).toBe(400)
    expect(((await invalid.json()) as { detail: { path: string }[] }).detail[0]?.path).toBe('revenue')
    expect(h.mgx.submitForm).not.toHaveBeenCalled()
  })

  it('returns 409 for a second form and keeps the first answers', async () => {
    const deal = publishedDeal(h)
    expect((await post(deal.linkCode, BODY)).status).toBe(200)
    const first = requireDeal(h.db, DEAL_ID).form
    h.clock.now = new Date(T0.getTime() + 60_000)
    const res = await post(deal.linkCode, { ...BODY, timing: 'within_12_months', message: 'Second device' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'The form was already sent' })
    expect(h.mgx.submitForm).toHaveBeenCalledTimes(1)
    expect(requireDeal(h.db, DEAL_ID)).toMatchObject({ form: first, formSentAt: T0.toISOString(), mgxReceiptId: RECEIPT_ID })
    expect(listEvents(h.db, DEAL_ID, { types: ['form_sent'] })).toHaveLength(1)
    expect(pipedriveOps().filter((key) => key.includes(':fields:'))).toEqual([`pipedrive-write:${DEAL_ID}:fields:${RECEIPT_ID}`])
  })

  it('sends only one of two parallel forms to MGX', async () => {
    const deal = publishedDeal(h)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    h.mgx.submitForm.mockImplementation(async () => {
      await gate
      return { receiptId: RECEIPT_ID }
    })
    const first = post(deal.linkCode, BODY)
    await vi.waitFor(() => expect(h.mgx.submitForm).toHaveBeenCalledTimes(1))
    const second = await post(deal.linkCode, { ...BODY, message: 'Parallel' })
    expect(second.status).toBe(409)
    release()
    expect((await first).status).toBe(200)
    expect(h.mgx.submitForm).toHaveBeenCalledTimes(1)
    const events = listEvents(h.db, DEAL_ID, { types: ['form_sent'] })
    expect(events).toHaveLength(1)
    expect(events[0]?.data).toEqual({ receiptId: RECEIPT_ID })
    expect(pipedriveOps().filter((key) => key.includes(':fields:'))).toHaveLength(1)
  })

  it('returns 403 for a form from a preview and sends nothing to MGX', async () => {
    const deal = publishedDeal(h)
    const res = await h.request(`/v/${deal.linkCode}/form?preview=1`, json(BODY, { accept: 'application/json' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'A preview does not send anything' })
    expect(h.mgx.submitForm).not.toHaveBeenCalled()
    expect(requireDeal(h.db, DEAL_ID)).toMatchObject({ form: null, formSentAt: null, status: 'link_sent' })
  })

  it('returns 404 for an unpublished deal and 410 after expiry', async () => {
    const draft = draftDeal(h, { id: 101 })
    expect((await post(draft.linkCode, BODY)).status).toBe(404)
    const deal = publishedDeal(h)
    h.clock.now = new Date(requireDeal(h.db, deal.id).expiresAt ?? T0)
    const res = await post(deal.linkCode, BODY)
    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: 'The link has expired' })
    expect(h.mgx.submitForm).not.toHaveBeenCalled()
  })
})
