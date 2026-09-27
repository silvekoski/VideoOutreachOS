import type { MetricsRow } from '@mergero/shared'
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { EmptyState } from '../components/query-state'
import { formatPercent } from '../lib/format'
import { MetricsCard } from './metrics-card'

const config: ChartConfig = {
  linksSent: { label: 'Links sent', color: 'var(--chart-3)' },
  openRate: { label: 'Open rate', color: 'var(--metric-open)' },
  meetingRate: { label: 'Meeting rate', color: 'var(--metric-meeting)' },
}

const percentTick = (value: number) => `${Math.round(value * 100)} %`

export function TrendCard({ weeks }: { weeks: MetricsRow[] }) {
  const reducedMotion = usePrefersReducedMotion()
  return (
    <MetricsCard
      title="Weekly trend"
      description="Links sent per week (bars, right axis), with the open rate and the meeting rate of the links of that week (lines, left axis). A week starts on Monday."
    >
      {weeks.every((week) => week.linksSent === 0) ? (
        <EmptyState>No links sent in this date range.</EmptyState>
      ) : (
        <figure className="grid gap-2">
          <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden="true">
            <ComposedChart data={weeks} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="key" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis yAxisId="rate" width={48} tickLine={false} axisLine={false} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={percentTick} />
              <YAxis yAxisId="links" orientation="right" width={32} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => `Week of ${String(label)}`}
                    formatter={(value, name) =>
                      `${config[String(name)]?.label ?? name}: ${name === 'linksSent' ? String(value) : formatPercent(Number(value))}`
                    }
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar yAxisId="links" dataKey="linksSent" fill="var(--color-linksSent)" fillOpacity={0.35} radius={3} isAnimationActive={!reducedMotion} />
              <Line
                yAxisId="rate"
                dataKey="openRate"
                type="monotone"
                stroke="var(--color-openRate)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={{ r: 2 }}
                connectNulls
                isAnimationActive={!reducedMotion}
              />
              <Line
                yAxisId="rate"
                dataKey="meetingRate"
                type="monotone"
                stroke="var(--color-meetingRate)"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={!reducedMotion}
              />
            </ComposedChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">Solid line: meeting rate. Dashed line: open rate.</p>
          <figcaption className="sr-only">
            <table>
              <caption>Weekly trend</caption>
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">Links sent</th>
                  <th scope="col">Open rate</th>
                  <th scope="col">Meeting rate</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week.key}>
                    <th scope="row">{week.key}</th>
                    <td>{week.linksSent}</td>
                    <td>{formatPercent(week.openRate)}</td>
                    <td>{formatPercent(week.meetingRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figcaption>
        </figure>
      )}
    </MetricsCard>
  )
}
