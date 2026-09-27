import type { DealStatus } from '@mergero/shared'
import { describe, expect, it } from 'vitest'
import { funnelSteps, inFunnelStep } from '../../src/admin/lib/funnel'

const row = (status: DealStatus, reached: DealStatus = status) => ({ status, reached })

const rows = [
  row('review'),
  row('failed'),
  row('link_sent'),
  row('opened'),
  row('form_sent'),
  row('meeting_booked'),
  row('lost', 'opened'),
]

describe('funnelSteps', () => {
  it('counts each deal in every stage that it reached', () => {
    const steps = Object.fromEntries(funnelSteps(rows).map((step) => [step.key, step]))
    expect(steps.all?.count).toBe(7)
    expect(steps.unsent?.count).toBe(2)
    expect(steps.link_sent).toMatchObject({ count: 5, base: 'all', rate: 5 / 7, share: 1 })
    expect(steps.opened).toMatchObject({ count: 4, base: 'sent', rate: 4 / 5 })
    expect(steps.form_sent).toMatchObject({ count: 2, base: 'opened', rate: 2 / 4 })
    expect(steps.meeting_booked).toMatchObject({ count: 1, base: 'opened', rate: 1 / 4, share: 1 / 5 })
    expect(steps.lost?.count).toBe(1)
  })

  it('gives no rate when no link was sent', () => {
    const steps = funnelSteps([row('draft')])
    expect(steps.find((step) => step.key === 'opened')).toMatchObject({ count: 0, rate: null, share: 0 })
  })
})

describe('inFunnelStep', () => {
  it('keeps a lost deal in the stages that it reached', () => {
    expect(inFunnelStep(row('lost', 'opened'), 'opened')).toBe(true)
    expect(inFunnelStep(row('lost', 'opened'), 'form_sent')).toBe(false)
    expect(inFunnelStep(row('lost', 'opened'), 'unsent')).toBe(false)
  })
})
