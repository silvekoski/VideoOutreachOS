import type { InboxDto, InboxRow } from '@mergero/shared'
import { describe, expect, it } from 'vitest'
import { NO_TODO_PRIORITY, dealHref, todoItems } from '../../src/admin/lib/todo'

const row = (key: string, dealId: number | null): InboxRow => ({
  key,
  dealId,
  company: dealId === null ? 'Your profile' : `Deal ${dealId}`,
  context: 'Context',
  action: { kind: 'brief', label: 'Read meeting brief' },
})

const inbox: InboxDto = {
  groups: [
    { key: 'call', rows: [row('call:1', 1), row('call:2', 2)] },
    { key: 'review', rows: [row('job:1', 1), row('job:9', null)] },
    { key: 'meeting_today', rows: [] },
    { key: 'second_channel', rows: [] },
  ],
}

describe('todoItems', () => {
  it('keeps the first item of each deal in group order and lists the items outside a deal', () => {
    const { byDeal, other } = todoItems(inbox)
    expect(byDeal.get(1)).toMatchObject({ group: 'review', priority: 0 })
    expect(byDeal.get(2)).toMatchObject({ group: 'call', priority: 2 })
    expect(other.map((item) => item.row.key)).toEqual(['job:9'])
    expect(NO_TODO_PRIORITY).toBe(4)
  })

  it('gives no items without an inbox', () => {
    expect(todoItems(null)).toEqual({ byDeal: new Map(), other: [] })
  })
})

describe('dealHref', () => {
  it('opens the review page when the video needs a review', () => {
    expect(dealHref(7, 'review')).toBe('/deals/7/review')
    expect(dealHref(7, 'link_sent', { kind: 'review', label: 'Review new version' })).toBe('/deals/7/review')
    expect(dealHref(7, 'failed', { kind: 'retry', label: 'Retry', jobId: 3 })).toBe('/deals/7')
    expect(dealHref(7, 'opened')).toBe('/deals/7')
  })
})
