import { useId, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '../components/query-state'
import { formatPercent } from '../lib/format'
import { Inspect } from './inspect'
import { shareOfMax } from './share-of-max'
import { cn } from '@/lib/utils'

const TONES = {
  rate: 'bg-viz-1',
  open: 'bg-metric-open',
  form: 'bg-metric-form',
  meeting: 'bg-metric-meeting',
  critical: 'bg-status-critical',
  amount: 'bg-chart-3',
} as const

export type Tone = keyof typeof TONES

const percent = (share: number) => `${Math.min(1, Math.max(0, share)) * 100}%`

interface MeterProps {
  share: number
  tone?: Tone
  marker?: number | null
  className?: string
}

export function Meter({ share, tone = 'rate', marker = null, className }: MeterProps) {
  return (
    <span aria-hidden="true" className={cn('relative block h-1.5 overflow-hidden rounded-full bg-foreground/10', className)}>
      <span className={cn('block h-full rounded-full', TONES[tone])} style={{ width: percent(share) }} />
      {marker === null ? null : <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: percent(marker) }} />}
    </span>
  )
}

interface BarCellProps {
  text: string
  share: number | null
  tone?: Tone
  detail?: ReactNode
}

export function BarCell({ text, share, tone, detail }: BarCellProps) {
  const body = (
    <>
      {text}
      <Meter share={share ?? 0} tone={tone} />
    </>
  )
  const className = 'ml-auto grid w-full max-w-36 min-w-20 gap-1'
  return (
    <TableCell className="text-right tabular-nums">
      {detail ? (
        <Inspect detail={detail} className={`${className} cursor-default`}>
          {body}
        </Inspect>
      ) : (
        <span className={className}>{body}</span>
      )}
    </TableCell>
  )
}

interface MetricsCardProps {
  title: string
  description?: string
  children: ReactNode
}

export function MetricsCard({ title, description, children }: MetricsCardProps) {
  const id = useId()
  return (
    <Card size="sm" role="region" aria-labelledby={id}>
      <CardHeader>
        <CardTitle>
          <h2 id={id}>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-2">{children}</CardContent>
    </Card>
  )
}

export interface RateRow {
  key: string
  label: ReactNode
  count: number
  rate: number | null
  detail?: ReactNode
}

interface RateTableProps {
  headers: [label: string, count: string, rate: string]
  rows: RateRow[]
  empty: string
  tone?: Tone
}

export function RateTable({ headers, rows, empty, tone = 'rate' }: RateTableProps) {
  if (rows.every((row) => row.count === 0)) return <EmptyState>{empty}</EmptyState>
  const counts = rows.map((row) => row.count)
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{headers[0]}</TableHead>
            <TableHead scope="col" className="text-right">
              {headers[1]}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {headers[2]}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium whitespace-normal">{row.label}</TableCell>
              <BarCell text={String(row.count)} share={shareOfMax(row.count, counts)} tone="amount" />
              <BarCell text={formatPercent(row.rate)} share={row.rate} tone={tone} detail={row.detail} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
