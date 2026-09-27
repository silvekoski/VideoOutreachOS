import { useEffect, useMemo, useRef } from 'react'
import type { SessionEventsDto } from '@mergero/shared'
import {
  ArrowRightLeft,
  ArrowUpDown,
  CircleCheck,
  EyeOff,
  MousePointerClick,
  Pause,
  Play,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EVENT_LABELS, eventDetail } from '../lib/events'
import { formatClock } from '../lib/format'
import { replayMarkers, type ReplayKind } from '../lib/replay'

const KIND_ICONS: Record<ReplayKind, LucideIcon> = {
  play: Play,
  pause: Pause,
  seek: ArrowRightLeft,
  scroll: ArrowUpDown,
  tap: MousePointerClick,
  field: TextCursorInput,
  complete: CircleCheck,
  page_hide: EyeOff,
}

interface SessionEventListProps {
  data: SessionEventsDto
  currentAt?: number | null
  onSeek?: (at: number) => void
}

export function SessionEventList({ data, currentAt = null, onSeek }: SessionEventListProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const markers = useMemo(() => replayMarkers(data.session.startedAt, data.events), [data])
  const current =
    currentAt === null
      ? null
      : (markers.findLast((marker) => marker.clientMs !== null && marker.clientMs <= currentAt)?.id ?? null)

  useEffect(() => {
    const list = listRef.current
    const row = current === null ? null : list?.querySelector<HTMLElement>(`[data-marker="${current}"]`)
    if (list && row) list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2
  }, [current])

  if (markers.length === 0) {
    return <p className="text-sm text-muted-foreground">This session has no player or page events.</p>
  }
  return (
    <ol
      ref={listRef}
      className="relative max-h-72 divide-y overflow-y-auto rounded-lg border text-sm"
      aria-label="Events in order"
    >
      {markers.map((marker) => {
        const Icon = KIND_ICONS[marker.kind]
        const from = marker.kind === 'seek' && typeof marker.data.from === 'number' ? `from ${formatClock(marker.data.from)}` : null
        const detail = [from, eventDetail(marker.data, from ? ['from'] : [])].filter(Boolean).join(', ')
        const seekAt = onSeek ? marker.clientMs : null
        const Row = seekAt === null ? 'div' : 'button'
        return (
          <li key={marker.id} data-marker={marker.id} aria-current={current === marker.id ? 'time' : undefined}>
            <Row
              {...(seekAt === null ? {} : { type: 'button', onClick: () => onSeek?.(seekAt) })}
              className={cn(
                'grid w-full grid-cols-[3.5rem_1fr_auto] items-start gap-2 px-3 py-1.5 text-left outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                seekAt !== null && 'cursor-pointer hover:bg-muted',
                current === marker.id && 'bg-muted',
              )}
            >
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {marker.offsetS !== null ? `+${formatClock(marker.offsetS)}` : ''}
              </span>
              <span className="min-w-0">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Icon aria-hidden="true" className="size-3.5" />
                  {(EVENT_LABELS as Record<string, string>)[marker.type] ?? marker.type}
                </span>
                {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
              </span>
              <span className="text-right text-xs tabular-nums">
                {`${marker.estimated ? 'about ' : ''}${formatClock(marker.videoTime)}`}
                {marker.slide ? <span className="block text-muted-foreground">{`slide ${marker.slide}`}</span> : null}
              </span>
            </Row>
          </li>
        )
      })}
    </ol>
  )
}
