import type { SaleTimingRow } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import { EmptyState } from '../components/query-state'
import { formatPercent } from '../lib/format'
import { Inspect } from './inspect'
import { MetricsCard, RateTable } from './metrics-card'

const timingNames = t('en').timing
const COLORS: Record<SaleTimingRow['timing'], string> = {
  within_12_months: 'bg-viz-1',
  in_1_3_years: 'bg-viz-3',
  later: 'bg-viz-4',
  not_interested: 'bg-chart-3',
}

export function SaleTimingCard({ rows }: { rows: SaleTimingRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.forms, 0)
  return (
    <MetricsCard
      title="When owners want to sell"
      description="The sale timing answer of each form in the date range, and the meeting rate for each answer."
    >
      {total === 0 ? (
        <EmptyState>No forms sent in this date range.</EmptyState>
      ) : (
        <>
          <span aria-hidden="true" className="flex h-5 gap-0.5 overflow-hidden rounded-full">
            {rows.map((row) =>
              row.forms === 0 ? null : (
                <Inspect
                  key={row.timing}
                  className={`h-full ${COLORS[row.timing]}`}
                  style={{ width: `${(row.forms / total) * 100}%` }}
                  detail={`${timingNames[row.timing]}: ${row.forms} forms (${formatPercent(row.forms / total)}), meeting rate ${formatPercent(row.meetingRate)}`}
                />
              ),
            )}
          </span>
          <RateTable
            headers={['Sale timing', 'Forms', 'Meeting rate']}
            rows={rows.map((row) => ({
              key: row.timing,
              label: (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className={`size-2.5 rounded-full ${COLORS[row.timing]}`} />
                  {`${timingNames[row.timing]} (${formatPercent(row.forms / total)})`}
                </span>
              ),
              count: row.forms,
              rate: row.meetingRate,
            }))}
            empty="No forms sent in this date range."
            tone="meeting"
          />
        </>
      )}
    </MetricsCard>
  )
}
