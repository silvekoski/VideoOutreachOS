import { useId, useState } from 'react'
import type { MetricsDto, MetricsRow } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMetrics } from '../api'
import { PageHeader } from '../components/page-header'
import { EmptyState, QueryState } from '../components/query-state'
import { formatPercent, isValidRange, lastDaysRange } from '../lib/format'

const RANGE_DAYS = 90

function MetricsTable({ title, keyLabel, rows }: { title: string; keyLabel: string; rows: MetricsRow[] }) {
  const id = useId()
  return (
    <Card size="sm" role="region" aria-labelledby={id}>
      <CardHeader>
        <CardTitle>
          <h2 id={id}>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
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
                    <TableCell className="text-right tabular-nums">{row.linksSent}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(row.openRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.avgWatchS === null ? 'No data' : formatDurationS(row.avgWatchS)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(row.formRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(row.meetingRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
  const id = useId()
  const video = lastValue(metrics.comparison, 'video')
  const text = lastValue(metrics.comparison, 'text')
  const summary = [
    video ? `Video sequence: ${formatPercent(video.value)} after ${video.n} deals.` : 'Video sequence: no data.',
    text ? `Text sequence: ${formatPercent(text.value)} after ${text.n} deals.` : 'Text sequence: no data.',
  ].join(' ')

  return (
    <Card size="sm" role="region" aria-labelledby={id}>
      <CardHeader>
        <CardTitle>
          <h2 id={id}>Meeting rate: video sequence and text sequence</h2>
        </CardTitle>
        <CardDescription>
          {`Cumulative meeting rate over the first 100 deals of each sequence (${metrics.videoDeals} video deals, ${metrics.textDeals} text deals). The date range does not apply.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {metrics.comparison.length === 0 ? (
          <EmptyState>No deals to compare yet.</EmptyState>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full" aria-hidden="true">
              <LineChart data={metrics.comparison} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="n" tickLine={false} axisLine={false} type="number" domain={[1, 100]} ticks={[1, 25, 50, 75, 100]} />
                <YAxis
                  width={48}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 'auto']}
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
              </LineChart>
            </ChartContainer>
            <p className="text-xs text-muted-foreground">Solid line: video sequence. Dashed line: text sequence.</p>
            <p className="sr-only">{summary}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function MetricsPage() {
  const [range, setRange] = useState(() => lastDaysRange(new Date(), RANGE_DAYS))
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const valid = isValidRange(range.from, range.to)
  const metrics = useMetrics(range.from, range.to, timeZone, valid)
  const fromId = useId()
  const toId = useId()
  const errorId = useId()

  return (
    <>
      <PageHeader
        title="Metrics"
        description={`Links sent in the date range, per analyst and per country. The days are in the time zone ${timeZone}.`}
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
      </form>
      {valid ? (
        <QueryState query={metrics} label="the metrics">
          {(data) => (
            <div className="grid gap-4">
              <MetricsTable title="Per analyst" keyLabel="Analyst" rows={data.byAnalyst} />
              <MetricsTable title="Per country" keyLabel="Country" rows={data.byCountry} />
              <ComparisonChart metrics={data} />
            </div>
          )}
        </QueryState>
      ) : null}
    </>
  )
}
