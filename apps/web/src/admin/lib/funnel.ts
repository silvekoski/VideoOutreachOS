import { STAGES, isClosedStatus } from '@mergero/shared'
import type { DealRowDto, Stage } from '@mergero/shared'

export type FunnelKey = 'all' | 'unsent' | Stage | 'lost'

export interface FunnelStep {
  key: FunnelKey
  count: number
  base: 'all' | 'sent' | 'opened' | null
  rate: number | null
  share: number
}

type FunnelRow = Pick<DealRowDto, 'status' | 'reached'>

function reachedIndex(row: FunnelRow): number {
  return STAGES.indexOf(row.reached as Stage)
}

export function inFunnelStep(row: FunnelRow, key: FunnelKey): boolean {
  if (key === 'all') return true
  if (key === 'unsent') return reachedIndex(row) < 0 && !isClosedStatus(row.status)
  if (key === 'lost') return row.status === 'lost'
  return reachedIndex(row) >= STAGES.indexOf(key)
}

const BASES: Record<Stage, FunnelStep['base']> = {
  link_sent: 'all',
  opened: 'sent',
  form_sent: 'opened',
  meeting_booked: 'opened',
}

export function funnelSteps(rows: FunnelRow[]): FunnelStep[] {
  const count = (key: FunnelKey) => rows.filter((row) => inFunnelStep(row, key)).length
  const sent = count('link_sent')
  const totals = { all: rows.length, sent, opened: count('opened') }
  const rate = (value: number, base: number) => (base === 0 ? null : value / base)
  return [
    { key: 'all', count: rows.length, base: null, rate: null, share: 1 },
    { key: 'unsent', count: count('unsent'), base: null, rate: null, share: 0 },
    ...STAGES.map((stage) => {
      const value = count(stage)
      const base = BASES[stage]
      return { key: stage, count: value, base, rate: base === null ? null : rate(value, totals[base]), share: rate(value, sent) ?? 0 }
    }),
    { key: 'lost', count: count('lost'), base: null, rate: null, share: 0 },
  ]
}
