import { useState } from 'react'
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
import { layoutReplay, type ReplayKind } from '../lib/replay'

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

const KIND_LEGEND: [ReplayKind, string][] = [
  ['play', 'Play'],
  ['pause', 'Pause'],
  ['seek', 'Seek'],
  ['scroll', 'Scroll'],
  ['tap', 'Tap'],
  ['field', 'Form field'],
  ['complete', 'End'],
  ['page_hide', 'Page hidden'],
]

const LANE_PX = 20
const BAR_TOP = 22

export function ReplayTimeline({ data }: { data: SessionEventsDto }) {
  const [active, setActive] = useState<number | null>(null)
  const layout = layoutReplay({
    startedAt: data.session.startedAt,
    durationS: data.durationS,
    slides: data.slides,
    events: data.events,
  })
  const height = BAR_TOP + 12 + layout.lanes * LANE_PX

  return (
    <div className="grid gap-4">
      <div aria-hidden="true" className="relative w-full select-none" style={{ height }}>
        {layout.slides.map((slide) => (
          <div
            key={slide.slide}
            className="absolute top-0 border-l border-foreground/40 pl-1 text-[10px] leading-4 text-muted-foreground"
            style={{ left: `${slide.leftPct}%`, width: `${slide.widthPct}%` }}
          >
            {slide.slide}
          </div>
        ))}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted" style={{ top: BAR_TOP - 8 }} />
        {layout.slides.map((slide) => (
          <div
            key={`mark-${slide.slide}`}
            className="absolute w-px bg-foreground/50"
            style={{ left: `${slide.leftPct}%`, top: BAR_TOP - 12, height: 14 }}
          />
        ))}
        {layout.markers.map((marker) => {
          const Icon = KIND_ICONS[marker.kind]
          const top = BAR_TOP + 4 + marker.lane * LANE_PX
          const from = marker.fromPct
          return (
            <div key={marker.id}>
              {from !== null ? (
                <div
                  className="absolute h-px border-t border-dashed border-foreground/50"
                  style={{
                    left: `${Math.min(from, marker.leftPct)}%`,
                    width: `${Math.abs(marker.leftPct - from)}%`,
                    top: top + 8,
                  }}
                />
              ) : null}
              <div
                className={cn(
                  'absolute grid size-4 -translate-x-1/2 place-items-center rounded-sm bg-background text-foreground ring-1 ring-border',
                  marker.estimated && 'text-muted-foreground',
                  active === marker.id && 'z-10 bg-primary text-primary-foreground ring-2 ring-ring',
                )}
                style={{ left: `${marker.leftPct}%`, top }}
              >
                <Icon className="size-3" />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground" aria-hidden="true">
        <span>0:00</span>
        <span>{formatClock(layout.durationS)}</span>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {KIND_LEGEND.map(([kind, label]) => {
          const Icon = KIND_ICONS[kind]
          return (
            <li key={kind} className="inline-flex items-center gap-1">
              <Icon aria-hidden="true" className="size-3" />
              {label}
            </li>
          )
        })}
      </ul>
      {layout.markers.length === 0 ? (
        <p className="text-sm text-muted-foreground">This session has no player or page events.</p>
      ) : (
        <ol className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm" aria-label="Events in order">
          {layout.markers.map((marker) => {
            const Icon = KIND_ICONS[marker.kind]
            const from = marker.kind === 'seek' && typeof marker.data.from === 'number' ? `from ${formatClock(marker.data.from)}` : null
            const detail = [from, eventDetail(marker.data, from ? ['from'] : [])].filter(Boolean).join(', ')
            return (
              <li
                key={marker.id}
                tabIndex={0}
                onFocus={() => setActive(marker.id)}
                onBlur={() => setActive(null)}
                onMouseEnter={() => setActive(marker.id)}
                onMouseLeave={() => setActive(null)}
                className="grid grid-cols-[3.5rem_1fr_auto] items-start gap-2 px-3 py-1.5 outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
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
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
