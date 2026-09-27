import type { MetricsDto, SlideNumber } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, XAxis, YAxis } from 'recharts'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { EmptyState } from '../components/query-state'
import { formatPercent } from '../lib/format'
import { MetricsCard } from './metrics-card'

const slideNames = t('en').page.slideNames
const config: ChartConfig = { reachRate: { label: 'Reached the slide', color: 'var(--viz-1)' } }
const KEY_SLIDES: ReadonlySet<SlideNumber> = new Set([4, 5])

const slideName = (slide: SlideNumber) => `${slide}. ${slideNames[slide]}`

export function RetentionCard({ retention }: { retention: MetricsDto['retention'] }) {
  const reducedMotion = usePrefersReducedMotion()
  const rows = retention.slides.map((row) => ({ ...row, tick: String(row.slide), name: slideName(row.slide) }))
  return (
    <MetricsCard
      title="Slide retention"
      description={`The percentage of owners who reach each slide, over ${retention.opened} opened links in the date range. The accent color marks slide 4 (the figures) and slide 5 (the buyers).`}
    >
      {retention.opened === 0 ? (
        <EmptyState>No opened links in this date range.</EmptyState>
      ) : (
        <figure className="grid gap-2">
          <ChartContainer config={config} className="aspect-auto h-52 w-full" aria-hidden="true">
            <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tick" tickLine={false} axisLine={false} />
              <YAxis
                width={48}
                tickLine={false}
                axisLine={false}
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(value: number) => `${Math.round(value * 100)} %`}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) => {
                      const row = payload[0]?.payload as (typeof rows)[number] | undefined
                      return row ? `${row.name}, average watch time ${formatDurationS(row.avgWatchS ?? 0)}` : ''
                    }}
                    formatter={(value) => `Reached the slide: ${formatPercent(Number(value))}`}
                  />
                }
              />
              <ReferenceArea x1="4" x2="5" fill="var(--color-reachRate)" fillOpacity={0.1} ifOverflow="extendDomain" />
              <Bar dataKey="reachRate" fill="var(--color-reachRate)" radius={3} isAnimationActive={!reducedMotion}>
                {rows.map((row) => (
                  <Cell key={row.slide} fill={KEY_SLIDES.has(row.slide) ? 'var(--color-reachRate)' : 'var(--chart-3)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
          <figcaption className="sr-only">
            <table>
              <caption>Slide retention</caption>
              <thead>
                <tr>
                  <th scope="col">Slide</th>
                  <th scope="col">Reached the slide</th>
                  <th scope="col">Average watch time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.slide}>
                    <th scope="row">{row.name}</th>
                    <td>{formatPercent(row.reachRate)}</td>
                    <td>{row.avgWatchS === null ? 'No data' : formatDurationS(row.avgWatchS)}</td>
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
