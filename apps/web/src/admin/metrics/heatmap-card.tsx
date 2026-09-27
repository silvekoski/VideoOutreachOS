import { EmptyState } from '../components/query-state'
import { formatPercent, pluralize } from '../lib/format'
import { Inspect } from './inspect'
import { MetricsCard } from './metrics-card'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HOUR_TICKS = new Set([0, 6, 12, 18])
const MAX_TINT = 85
const TOP_SLOTS = 3

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

export function HeatmapCard({ grid }: { grid: number[][] }) {
  const max = Math.max(0, ...grid.flat())
  const total = grid.flat().reduce((sum, opens) => sum + opens, 0)
  const slots = grid
    .flatMap((row, weekday) => row.map((opens, hour) => ({ weekday, hour, opens })))
    .filter((slot) => slot.opens > 0)
    .sort((a, b) => b.opens - a.opens)
    .slice(0, TOP_SLOTS)
  return (
    <MetricsCard
      title="When owners open the link"
      description="The first open of each link in the date range, by weekday and hour in the time zone of the owner country. A stronger color shows more opens."
    >
      {max === 0 ? (
        <EmptyState>No opened links in this date range.</EmptyState>
      ) : (
        <figure className="grid gap-2">
          <div aria-hidden="true" className="overflow-x-auto">
            <div className="grid min-w-[40rem] grid-cols-[3rem_repeat(24,minmax(0,1fr))] gap-0.5 text-[11px] text-muted-foreground">
              <span />
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="text-center">
                  {HOUR_TICKS.has(hour) ? hourLabel(hour) : ''}
                </span>
              ))}
              {grid.map((row, weekday) => (
                <div key={WEEKDAYS[weekday]} className="contents">
                  <span className="self-center">{WEEKDAYS[weekday]?.slice(0, 3)}</span>
                  {row.map((opens, hour) => (
                    <Inspect
                      key={hour}
                      detail={`${WEEKDAYS[weekday]} ${hourLabel(hour)}: ${pluralize(opens, 'first open', 'first opens')}, ${formatPercent(opens / total)} of all`}
                      className="aspect-square rounded-sm bg-foreground/5 hover:ring-2 hover:ring-foreground/60"
                      style={
                        opens > 0
                          ? { backgroundColor: `color-mix(in oklab, var(--metric-open) ${Math.round(15 + (opens / max) * MAX_TINT)}%, transparent)` }
                          : undefined
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <figcaption className="text-xs text-muted-foreground">
            {`Most opens: ${slots.map((slot) => `${WEEKDAYS[slot.weekday]} ${hourLabel(slot.hour)} (${slot.opens})`).join(', ')}.`}
          </figcaption>
        </figure>
      )}
    </MetricsCard>
  )
}
