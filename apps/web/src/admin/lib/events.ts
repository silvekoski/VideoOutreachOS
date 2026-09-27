import type { DealEventType, SessionEventType, StoredEvent } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'

const channels: Record<string, string> = t('en').channels

export const EVENT_LABELS: Record<SessionEventType | DealEventType, string> = {
  play: 'Play',
  pause: 'Pause',
  seek: 'Seek',
  slide_start: 'Slide start',
  slide_end: 'Slide end',
  complete: 'Watched to the end',
  page_hide: 'Page hidden',
  open: 'Opened',
  scroll: 'Scroll',
  tap: 'Tap',
  field_focus: 'Field focus',
  field_value: 'Field filled',
  buyer_link_tap: 'Buyer link tap',
  forward: 'Forward',
  calculator_result: 'Calculator result',
  link_sent: 'Link sent',
  form_sent: 'Form sent',
  meeting_booked: 'Meeting booked',
  lost: 'Lost',
  won: 'Won',
  reopened: 'Opened again in Pipedrive',
  brief_written: 'Meeting brief written',
  brief_read: 'Meeting brief read',
  task_created: 'Task created',
  task_done: 'Task done',
}

export const DEAL_TIMELINE_TYPES: ReadonlySet<string> = new Set([
  'link_sent',
  'open',
  'form_sent',
  'meeting_booked',
  'lost',
  'won',
  'reopened',
  'brief_written',
  'brief_read',
  'task_created',
  'task_done',
])

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return channels.direct ?? 'Direct'
  return channels[channel] ?? channel
}

export function eventLabel(event: Pick<StoredEvent, 'type' | 'channel' | 'data'>): string {
  if (event.type === 'open') {
    return !event.channel || event.channel === 'direct'
      ? 'Opened from a direct link'
      : `Opened on ${channelLabel(event.channel)}`
  }
  if (event.type === 'task_created' || event.type === 'task_done') {
    const kind = event.data.type === 'call' ? 'Call task' : event.data.type === 'second_channel' ? 'Second channel task' : 'Task'
    const channel = typeof event.data.channel === 'string' ? ` (${channelLabel(event.data.channel)})` : ''
    return `${kind}${channel} ${event.type === 'task_done' ? 'done' : 'created'}`
  }
  return (EVENT_LABELS as Record<string, string>)[event.type] ?? event.type
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
}

export function eventDetail(data: Record<string, unknown>, skip: readonly string[] = []): string | null {
  const entries = Object.entries(data).filter(
    ([key, value]) =>
      !skip.includes(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'),
  )
  if (entries.length === 0) return null
  return entries
    .map(([key, value]) => `${humanize(key)}: ${typeof value === 'number' ? String(Math.round(value * 10) / 10) : String(value)}`)
    .join(', ')
}

export function dealTimeline(events: readonly StoredEvent[]): StoredEvent[] {
  return events
    .filter((event) => DEAL_TIMELINE_TYPES.has(event.type))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id - a.id)
}
