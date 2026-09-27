import { useId, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { useSearchParams } from 'react-router'
import type { MetricsDto, MetricsRow } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMetrics, type MetricsSource } from '../api'
import { PageHeader } from '../components/page-header'
import { SegmentedFilter } from '../components/segmented-filter'
import { EmptyState, QueryState } from '../components/query-state'
import { formatPercent, isValidRange, lastDaysRange } from '../lib/format'
import { ChannelCard } from '../metrics/channel-card'
import { FunnelCard } from '../metrics/funnel-card'
import { HeatmapCard } from '../metrics/heatmap-card'
import { KpiTiles } from '../metrics/kpi-tiles'
import { BarCell, MetricsCard } from '../metrics/metrics-card'
import { shareOfMax } from '../metrics/share-of-max'
import { RetentionCard } from '../metrics/retention-card'
import { SaleTimingCard } from '../metrics/sale-timing-card'
import { SignalLiftCard } from '../metrics/signal-lift-card'
import { ActionsCard, FollowUpCard, InterestCard } from '../metrics/signal-cards'
import { TimingCard } from '../metrics/timing-card'
import { TrendCard } from '../metrics/trend-card'
import { WatchCard } from '../metrics/watch-card'

const RANGE_DAYS = 90
const SOURCES: { value: MetricsSource; label: string }[] = [
  { value: 'real', label: 'Real data' },
  { value: 'mock', label: 'Mock data' },
]
const MIN_COMPARISON_DEALS = 30

const countOf = (rate: number | null, links: number, action: string) =>
  `${Math.round((rate ?? 0) * links)} of ${links} links ${action}`

function MetricsTable({ title, keyLabel, rows }: { title: string; keyLabel: string; rows: MetricsRow[] }) {
  const links = rows.map((row) => row.linksSent)
  const watch = rows.map((row) => row.avgWatchS)
  return (
    <MetricsCard title={title}>
      {rows.length === 0 ? (
        <EmptyState>No links sent in this date range.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{keyLabel}</TableHead>
                <TableHead scope="col" className="text-right">
                  Links sent
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Open rate
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Average watch time
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Form rate
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Meeting rate
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <BarCell text={String(row.linksSent)} share={shareOfMax(row.linksSent, links)} tone="amount" />
                  <BarCell text={formatPercent(row.openRate)} share={row.openRate} tone="open" detail={countOf(row.openRate, row.linksSent, 'opened')} />
                  <BarCell
                    text={row.avgWatchS === null ? 'No data' : formatDurationS(row.avgWatchS)}
                    share={shareOfMax(row.avgWatchS, watch)}
                    tone="amount"
                  />
                  <BarCell text={formatPercent(row.formRate)} share={row.formRate} tone="form" detail={countOf(row.formRate, row.linksSent, 'sent a form')} />
                  <BarCell
                    text={formatPercent(row.meetingRate)}
                    share={row.meetingRate}
                    tone="meeting"
                    detail={countOf(row.meetingRate, row.linksSent, 'booked a meeting')}
                  />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </MetricsCard>
  )
}

const chartConfig: ChartConfig = {
  video: { label: 'Video sequence', color: 'var(--chart-1)' },
  text: { label: 'Text sequence', color: 'var(--chart-3)' },
}

function lastValue(rows: MetricsDto['comparison'], key: 'video' | 'text'): { n: number; value: number } | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]
    const value = row?.[key]
    if (row && value !== null && value !== undefined) return { n: row.n, value }
  }
  return null
}

function ComparisonChart({ metrics }: { metrics: MetricsDto }) {
  const reducedMotion = usePrefersReducedMotion()
  const video = lastValue(metrics.comparison, 'video')
  const text = lastValue(metrics.comparison, 'text')
  const summary = [
    video ? `Video sequence: ${formatPercent(video.value)} after ${video.n} deals.` : 'Video sequence: no data.',
    text ? `Text sequence: ${formatPercent(text.value)} after ${text.n} deals.` : 'Text sequence: no data.',
  ].join(' ')
  const fewDeals = Math.min(metrics.videoDeals, metrics.textDeals) < MIN_COMPARISON_DEALS

  return (
    <MetricsCard
      title="Meeting rate: video sequence and text sequence"
      description={`Cumulative meeting rate over the first 100 deals of each sequence (${metrics.videoDeals} video deals, ${metrics.textDeals} text deals). The shaded band is the 95 % confidence interval. The date range does not apply.`}
    >
      {fewDeals && metrics.comparison.length > 0 ? (
        <p role="note" className="text-xs font-medium text-destructive">
          {`A sequence has fewer than ${MIN_COMPARISON_DEALS} deals. The band is wide, so the difference between the sequences is not certain yet.`}
        </p>
      ) : null}
      {metrics.comparison.length === 0 ? (
        <EmptyState>No deals to compare yet.</EmptyState>
      ) : (
        <>
          <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full" aria-hidden="true">
            <ComposedChart data={metrics.comparison} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="n" tickLine={false} axisLine={false} type="number" domain={[1, 100]} ticks={[1, 25, 50, 75, 100]} />
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
                    labelFormatter={(_label, payload) => `Deal ${String(payload[0]?.payload?.n ?? '')}`}
                    formatter={(value, name) => `${chartConfig[String(name)]?.label ?? name}: ${formatPercent(Number(value))}`}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                dataKey="textBand"
                type="linear"
                stroke="none"
                fill="var(--color-text)"
                fillOpacity={0.15}
                legendType="none"
                tooltipType="none"
                isAnimationActive={!reducedMotion}
              />
              <Area
                dataKey="videoBand"
                type="linear"
                stroke="none"
                fill="var(--color-video)"
                fillOpacity={0.2}
                legendType="none"
                tooltipType="none"
                isAnimationActive={!reducedMotion}
              />
              <Line
                dataKey="video"
                type="linear"
                stroke="var(--color-video)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={!reducedMotion}
              />
              <Line
                dataKey="text"
                type="linear"
                stroke="var(--color-text)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={!reducedMotion}
              />
            </ComposedChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">Solid line: video sequence. Dashed line: text sequence.</p>
          <p className="sr-only">{summary}</p>
        </>
      )}
    </MetricsCard>
  )
}

export function MetricsPage() {
  const [range, setRange] = useState(() => lastDaysRange(new Date(), RANGE_DAYS))
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const valid = isValidRange(range.from, range.to)
  const [params, setParams] = useSearchParams()
  const source: MetricsSource = params.get('data') === 'mock' ? 'mock' : 'real'
  const metrics = useMetrics(range.from, range.to, timeZone, source, valid)
  const fromId = useId()
  const toId = useId()
  const errorId = useId()

  return (
    <>
      <PageHeader
        title="Metrics"
        description={`Links sent in the date range: the funnel, the rates per analyst, country and channel, and the video engagement. The days are in the time zone ${timeZone}.`}
      />
      <form role="search" aria-label="Date range" className="flex flex-wrap items-end gap-3" onSubmit={(event) => event.preventDefault()}>
        <div className="grid gap-1.5">
          <Label htmlFor={fromId} className="text-xs">
            From
          </Label>
          <Input
            id={fromId}
            type="date"
            value={range.from}
            max={range.to}
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : errorId}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
            className="h-7 w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={toId} className="text-xs">
            To
          </Label>
          <Input
            id={toId}
            type="date"
            value={range.to}
            min={range.from}
            aria-invalid={!valid}
            aria-describedby={valid ? undefined : errorId}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
            className="h-7 w-40"
          />
        </div>
        {!valid ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            Enter two dates. The first date must not be after the second date.
          </p>
        ) : metrics.isFetching ? (
          <p role="status" className="text-xs text-muted-foreground">
            Loading
          </p>
        ) : null}
        <div className="ml-auto grid gap-1.5">
          <span className="text-xs font-medium">Data</span>
          <SegmentedFilter
            label="Show the real data or the mock data"
            value={source}
            items={SOURCES}
            onChange={(next) => setParams(next === 'mock' ? { data: 'mock' } : {}, { replace: true })}
          />
        </div>
      </form>
      {source === 'mock' ? (
        <Alert role="status">
          <FlaskConical aria-hidden="true" />
          <AlertTitle>Mock data</AlertTitle>
          <AlertDescription>
            The page shows 420 fictional links over the last 180 days, not real deals. The comparison chart uses the real text sequence.
          </AlertDescription>
        </Alert>
      ) : null}
      {valid ? (
        <QueryState query={metrics} label="the metrics">
          {(data) => (
            <div className="grid gap-4">
              <KpiTiles total={data.total} textRate={lastValue(data.comparison, 'text')?.value ?? null} />
              <FunnelCard funnel={data.funnel} />
              <TrendCard weeks={data.byWeek} />
              <MetricsTable title="Per analyst" keyLabel="Analyst" rows={data.byAnalyst} />
              <MetricsTable title="Per country" keyLabel="Country" rows={data.byCountry} />
              <ChannelCard rows={data.byChannel} />
              <HeatmapCard grid={data.openHeatmap} />
              <div className="grid gap-4 lg:grid-cols-2">
                <RetentionCard retention={data.retention} />
                <WatchCard buckets={data.watchHistogram} />
                <ActionsCard actions={data.actions} />
                <SaleTimingCard rows={data.saleTiming} />
                <InterestCard rows={data.byInterest} />
                <FollowUpCard rows={data.followUp} />
              </div>
              <SignalLiftCard rows={data.signalLift} />
              <TimingCard points={data.timing} />
              <ComparisonChart metrics={data} />
            </div>
          )}
        </QueryState>
      ) : null}
    </>
  )
}
