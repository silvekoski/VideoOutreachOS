import type { FunnelDto } from '@mergero/shared'
import { EmptyState } from '../components/query-state'
import { formatPercent } from '../lib/format'
import { Inspect } from './inspect'
import { MetricsCard } from './metrics-card'

const STEPS: { key: keyof FunnelDto; label: string; color: string }[] = [
  { key: 'sent', label: 'Links sent', color: 'bg-chart-3' },
  { key: 'opened', label: 'Opened', color: 'bg-metric-open' },
  { key: 'completed', label: 'Watched to the end', color: 'bg-viz-5' },
  { key: 'formSent', label: 'Form sent', color: 'bg-metric-form' },
  { key: 'booked', label: 'Meeting booked', color: 'bg-metric-meeting' },
]

export function FunnelCard({ funnel }: { funnel: FunnelDto }) {
  return (
    <MetricsCard
      title="From link to meeting"
      description="Each step shows the number of links and the percentage of the links sent in the date range."
    >
      {funnel.sent === 0 ? (
        <EmptyState>No links sent in this date range.</EmptyState>
      ) : (
        <ol className="grid gap-2">
          {STEPS.map(({ key, label, color }, index) => {
            const share = funnel[key] / funnel.sent
            const before = index === 0 ? null : funnel[STEPS[index - 1]?.key ?? 'sent']
            return (
              <li key={key} className="grid grid-cols-[minmax(8rem,12rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="font-medium">{label}</span>
                <span aria-hidden="true" className="flex h-7 justify-center rounded-md bg-foreground/5">
                  <Inspect
                    className={`h-full min-w-1 rounded-md ${color}`}
                    style={{ width: `${share * 100}%` }}
                    detail={`${label}: ${funnel[key]} links, ${formatPercent(share)} of the links sent${
                      before ? `, ${formatPercent(funnel[key] / before)} of the step before` : ''
                    }`}
                  />
                </span>
                <span className="text-right tabular-nums">
                  {funnel[key]}
                  <span className="ml-2 inline-block w-16 text-muted-foreground">{formatPercent(share)}</span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </MetricsCard>
  )
}
