import type { SlideAnalytics, SlideNumber } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { slideWatchRows } from '../lib/watch'
import { cn } from '@/lib/utils'

interface SlideWatchChartProps {
  perSlide: SlideAnalytics[]
  stopSlide: SlideNumber | null
  slideName: (slide: SlideNumber) => string
  labels: { watch: string; stop: string; slide: string; replays: string }
  className?: string
}

export function SlideWatchChart({ perSlide, stopSlide, slideName, labels, className }: SlideWatchChartProps) {
  const reducedMotion = usePrefersReducedMotion()
  const rows = slideWatchRows(perSlide).map((row) => ({
    ...row,
    tick: String(row.slide),
    name: slideName(row.slide),
    stop: row.slide === stopSlide ? labels.stop : '',
  }))
  const config: ChartConfig = { watchS: { label: labels.watch, color: 'var(--chart-1)' } }

  return (
    <figure className={cn('grid gap-2', className)}>
      <ChartContainer config={config} className="aspect-auto h-44 w-full" aria-hidden="true">
        <BarChart data={rows} margin={{ top: 18, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="tick" tickLine={false} axisLine={false} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(value: number) => `${Math.round(value)} s`}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_label, payload) => {
                  const row = payload[0]?.payload as (typeof rows)[number] | undefined
                  return row?.name ?? ''
                }}
                formatter={(value) => `${labels.watch}: ${formatDurationS(Number(value))}`}
              />
            }
          />
          <Bar dataKey="watchS" fill="var(--color-watchS)" radius={3} isAnimationActive={!reducedMotion}>
            <LabelList dataKey="stop" position="top" className="fill-foreground" fontSize={11} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <figcaption className="sr-only">
        <table>
          <caption>{labels.watch}</caption>
          <thead>
            <tr>
              <th scope="col">{labels.slide}</th>
              <th scope="col">{labels.watch}</th>
              <th scope="col">{labels.replays}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slide}>
                <th scope="row">{`${row.name}${row.stop ? `, ${row.stop}` : ''}`}</th>
                <td>{formatDurationS(row.watchS)}</td>
                <td>{row.replays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  )
}
