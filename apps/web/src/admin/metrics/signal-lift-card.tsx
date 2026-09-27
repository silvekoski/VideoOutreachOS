import type { SignalLiftRow } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import { EmptyState } from '../components/query-state'
import { formatPercent, pluralize } from '../lib/format'
import { Inspect } from './inspect'
import { MetricsCard } from './metrics-card'

const signalNames = t('en').signals
const NEGATIVE = new Set<SignalLiftRow['key']>(['stopped_early', 'short_watch'])

const position = (rate: number) => `${Math.min(1, Math.max(0, rate)) * 100}%`

function liftText(row: SignalLiftRow): string {
  if (row.withRate === null || row.withoutRate === null) return 'No data'
  const points = Math.round((row.withRate - row.withoutRate) * 100)
  return `${points > 0 ? '+' : ''}${points} points`
}

export function SignalLiftCard({ rows }: { rows: SignalLiftRow[] }) {
  const shown = rows
    .filter((row) => row.deals > 0)
    .sort((a, b) => (b.withRate ?? 0) - (b.withoutRate ?? 0) - ((a.withRate ?? 0) - (a.withoutRate ?? 0)))
  return (
    <MetricsCard
      title="Signal lift"
      description="The meeting rate of opened links with each signal (blue dot, red for a negative signal) and without it (grey dot). A long line to the right shows a signal that predicts a meeting."
    >
      {shown.length === 0 ? (
        <EmptyState>No signals in this date range.</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {shown.map((row) => {
            const low = Math.min(row.withRate ?? 0, row.withoutRate ?? 0)
            const high = Math.max(row.withRate ?? 0, row.withoutRate ?? 0)
            return (
              <li key={row.key} className="grid grid-cols-[minmax(9rem,14rem)_1fr_6rem] items-center gap-3 text-sm">
                <span className="font-medium">
                  {signalNames[row.key]}
                  {NEGATIVE.has(row.key) ? <span className="ml-2 text-xs text-destructive">Negative</span> : null}
                  <span className="block text-xs font-normal text-muted-foreground">{pluralize(row.deals, 'link', 'links')}</span>
                </span>
                <Inspect
                  className="relative h-6 cursor-default"
                  detail={`${signalNames[row.key]}: meeting rate ${formatPercent(row.withRate)} with the signal (${row.deals} links), ${formatPercent(row.withoutRate)} without it`}
                >
                  <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/10" />
                  <span className={`absolute top-1/2 h-1 -translate-y-1/2 rounded-full ${NEGATIVE.has(row.key) ? 'bg-status-critical/60' : 'bg-viz-1/60'}`} style={{ left: position(low), width: `calc(${position(high)} - ${position(low)})` }} />
                  {row.withoutRate === null ? null : (
                    <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-3" style={{ left: position(row.withoutRate) }} />
                  )}
                  {row.withRate === null ? null : (
                    <span className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card ${NEGATIVE.has(row.key) ? 'bg-status-critical' : 'bg-viz-1'}`} style={{ left: position(row.withRate) }} />
                  )}
                </Inspect>
                <span className="text-right tabular-nums">
                  {liftText(row)}
                  <span className="sr-only">{`, meeting rate ${formatPercent(row.withRate)} with the signal and ${formatPercent(row.withoutRate)} without it`}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </MetricsCard>
  )
}
