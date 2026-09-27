import type { TimingPoint } from '@mergero/shared'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
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

const TASK_AFTER_HOURS = 48
const SUMMARY_HOURS = [24, 48, 168]

const config: ChartConfig = {
  opened: { label: 'Opened', color: 'var(--metric-open)' },
  booked: { label: 'Meeting booked', color: 'var(--metric-meeting)' },
}

const dayLabel = (hours: number) => (hours % 24 === 0 ? `${hours / 24} d` : `${hours} h`)

export function TimingCard({ points }: { points: TimingPoint[] }) {
  const reducedMotion = usePrefersReducedMotion()
  return (
    <MetricsCard
      title="Time to open and book"
      description="The percentage of the links sent in the date range that the owner opened, or booked a meeting from, within the given time after the link was sent. The vertical line is the call task after 2 days."
    >
      {points.every((point) => point.opened === null) ? (
        <EmptyState>No links sent in this date range.</EmptyState>
      ) : (
        <figure className="grid gap-2">
          <ChartContainer config={config} className="aspect-auto h-64 w-full" aria-hidden="true">
            <ComposedChart data={points} margin={{ top: 16, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="hours"
                type="number"
                domain={[0, 168]}
                ticks={[0, 24, 48, 72, 96, 120, 144, 168]}
                tickLine={false}
                axisLine={false}
                tickFormatter={dayLabel}
              />
              <YAxis
                width={48}
                tickLine={false}
                axisLine={false}
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(value: number) => `${Math.round(value * 100)} %`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) => `After ${dayLabel(Number(payload[0]?.payload?.hours ?? 0))}`}
                    formatter={(value, name) => `${config[String(name)]?.label ?? name}: ${formatPercent(Number(value))}`}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <ReferenceLine
                x={TASK_AFTER_HOURS}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                label={{ value: 'Call task', position: 'top', fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
              <Area
                dataKey="opened"
                type="stepAfter"
                stroke="var(--color-opened)"
                strokeWidth={2}
                fill="var(--color-opened)"
                fillOpacity={0.15}
                isAnimationActive={!reducedMotion}
              />
              <Line
                dataKey="booked"
                type="stepAfter"
                stroke="var(--color-booked)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={!reducedMotion}
              />
              <Area
                dataKey="booked"
                type="stepAfter"
                stroke="none"
                fill="var(--color-booked)"
                fillOpacity={0.2}
                legendType="none"
                tooltipType="none"
                isAnimationActive={!reducedMotion}
              />
            </ComposedChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">Shaded area: opened. Line: meeting booked.</p>
          <figcaption className="sr-only">
            {SUMMARY_HOURS.map((hours) => {
              const point = points.find((p) => p.hours === hours)
              return `After ${dayLabel(hours)}: ${formatPercent(point?.opened)} opened, ${formatPercent(point?.booked)} booked. `
            }).join('')}
          </figcaption>
        </figure>
      )}
    </MetricsCard>
  )
}
