import type { StoredEvent } from '@mergero/shared'
import { eventLabel } from '../lib/events'
import { formatDateTime, timeZoneNote } from '../lib/format'
import { DealCard } from './deal-card'

export function EventsCard({ events, timeZone }: { events: StoredEvent[]; timeZone: string }) {
  return (
    <DealCard id="events" title="Events" description={timeZoneNote(timeZone)}>
      <ol className="grid gap-1.5 text-sm">
        {events.map((event) => (
          <li key={event.id} className="grid grid-cols-[8.5rem_1fr] gap-3">
            <time dateTime={event.at} className="font-mono text-xs text-muted-foreground tabular-nums">
              {formatDateTime(event.at, timeZone)}
            </time>
            <span>{eventLabel(event)}</span>
          </li>
        ))}
      </ol>
    </DealCard>
  )
}
