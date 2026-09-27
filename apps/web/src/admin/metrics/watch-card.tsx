import type { WatchBucket } from '@mergero/shared'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { EmptyState } from '../components/query-state'
import { MetricsCard } from './metrics-card'

const SHORT_WATCH_S = 30
const config: ChartConfig = { deals: { label: 'Opened links', color: 'var(--viz-1)' } }

const bucketLabel = (bucket: WatchBucket) => (bucket.toS === null ? `${bucket.fromS} s or more` : `${bucket.fromS} to ${bucket.toS} s`)

export function WatchCard({ buckets }: { buckets: WatchBucket[] }) {
  const reducedMotion = usePrefersReducedMotion()
  const rows = buckets.map((bucket) => ({ ...bucket, name: bucketLabel(bucket), tick: bucket.toS === null ? `${bucket.fromS}+` : String(bucket.fromS) }))
  const total = buckets.reduce((sum, bucket) => sum + bucket.deals, 0)
  const short = buckets.filter((bucket) => bucket.toS !== null && bucket.toS <= SHORT_WATCH_S).reduce((sum, bucket) => sum + bucket.deals, 0)
  return (
    <MetricsCard
      title="Watch time distribution"
      description={`The total watch time of each opened link. The red bars are under ${SHORT_WATCH_S} s, the limit of the "Short watch" signal.`}
    >
      {total === 0 ? (
        <EmptyState>No opened links in this date range.</EmptyState>
      ) : (
        <figure className="grid gap-2">
          <ChartContainer config={config} className="aspect-auto h-52 w-full" aria-hidden="true">
            <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tick" tickLine={false} axisLine={false} tickFormatter={(value: string) => `${value} s`} />
              <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) => String(payload[0]?.payload?.name ?? '')}
                    formatter={(value) => `Opened links: ${String(value)}`}
                  />
                }
              />
              <Bar dataKey="deals" radius={3} isAnimationActive={!reducedMotion}>
                {rows.map((row) => (
                  <Cell key={row.fromS} fill={row.toS !== null && row.toS <= SHORT_WATCH_S ? 'var(--status-critical)' : 'var(--color-deals)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          <figcaption className="text-xs text-muted-foreground">
            {`${short} of ${total} opened links have a watch time under ${SHORT_WATCH_S} s.`}
            <span className="sr-only">{` ${rows.map((row) => `${row.name}: ${row.deals}.`).join(' ')}`}</span>
          </figcaption>
        </figure>
      )}
    </MetricsCard>
  )
}
