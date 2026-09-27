import type { AlertDto } from '@mergero/shared'
import { describe, expect, it } from 'vitest'
import { pickNewAlerts, unreadCount } from '../../src/admin/lib/alerts'

function alert(id: number, at: string, unread = true): AlertDto {
  return { id, dealId: 10, company: 'Oy Example Ab', type: 'open', text: 'Opened on WhatsApp', at, unread }
}

describe('pickNewAlerts', () => {
  it('returns the unread alerts that are not known, oldest first', () => {
    const alerts = [alert(3, '2026-09-26T10:03:00.000Z'), alert(2, '2026-09-26T10:02:00.000Z'), alert(1, '2026-09-26T10:01:00.000Z')]
    expect(pickNewAlerts(new Set([1]), alerts).map((item) => item.id)).toEqual([2, 3])
  })

  it('skips the alerts that the analyst saw', () => {
    expect(pickNewAlerts(new Set(), [alert(4, '2026-09-26T10:04:00.000Z', false)])).toEqual([])
  })
})

describe('unreadCount', () => {
  it('counts only the unread alerts', () => {
    expect(unreadCount([alert(1, '2026-09-26T10:01:00.000Z'), alert(2, '2026-09-26T10:02:00.000Z', false)])).toBe(1)
    expect(unreadCount(undefined)).toBe(0)
  })
})
