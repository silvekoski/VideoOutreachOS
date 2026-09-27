import type { AlertDto } from '@mergero/shared'

export function pickNewAlerts(known: ReadonlySet<number>, alerts: readonly AlertDto[]): AlertDto[] {
  return alerts
    .filter((alert) => alert.unread && !known.has(alert.id))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)
}

export function unreadCount(alerts: readonly AlertDto[] | undefined): number {
  return alerts?.reduce((count, alert) => count + (alert.unread ? 1 : 0), 0) ?? 0
}
