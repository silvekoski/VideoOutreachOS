import type { DealStatus, InboxDto, InboxGroupKey, InboxRow } from '@mergero/shared'

const GROUP_ORDER: InboxGroupKey[] = ['review', 'meeting_today', 'call', 'second_channel']

export const NO_TODO_PRIORITY = GROUP_ORDER.length

export interface TodoItem {
  row: InboxRow
  group: InboxGroupKey
  priority: number
}

export function todoItems(inbox: InboxDto | null): { byDeal: Map<number, TodoItem>; other: TodoItem[] } {
  const byDeal = new Map<number, TodoItem>()
  const other: TodoItem[] = []
  for (const [priority, group] of GROUP_ORDER.entries()) {
    for (const row of inbox?.groups.find((item) => item.key === group)?.rows ?? []) {
      const item = { row, group, priority }
      if (row.dealId === null) other.push(item)
      else if (!byDeal.has(row.dealId)) byDeal.set(row.dealId, item)
    }
  }
  return { byDeal, other }
}

export function dealHref(dealId: number, status: DealStatus | null, action?: InboxRow['action']): string {
  return status === 'review' || action?.kind === 'review' ? `/deals/${dealId}/review` : `/deals/${dealId}`
}
