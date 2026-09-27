import { CHANNELS } from '@mergero/shared'
import type { ChannelRow, SessionChannel } from '@mergero/shared'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '../components/query-state'
import { channelLabel } from '../lib/events'
import { formatPercent } from '../lib/format'
import { Inspect } from './inspect'
import { MetricsCard } from './metrics-card'

const COLUMNS: readonly SessionChannel[] = [...CHANNELS, 'direct']
const MAX_TINT = 65

export function ChannelCard({ rows }: { rows: ChannelRow[] }) {
  const columns = COLUMNS.filter((channel) => rows.some((row) => row.cells[channel]))
  return (
    <MetricsCard
      title="Meeting rate per country and channel"
      description="Opened links in the date range, by the channel of the first open. Each cell shows the meeting rate and the number of opened links. A stronger color shows a higher meeting rate."
    >
      {rows.length === 0 ? (
        <EmptyState>No opened links in this date range.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Country</TableHead>
                {columns.map((channel) => (
                  <TableHead key={channel} scope="col" className="text-right">
                    {channelLabel(channel)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key} className={row.key === 'all' ? 'border-t-2' : undefined}>
                  <TableHead scope="row" className="font-medium">
                    {row.label}
                  </TableHead>
                  {columns.map((channel) => {
                    const cell = row.cells[channel]
                    return cell ? (
                      <TableCell
                        key={channel}
                        className="text-right tabular-nums"
                        style={{ backgroundColor: `color-mix(in oklab, var(--metric-meeting) ${Math.round((cell.meetingRate ?? 0) * MAX_TINT)}%, transparent)` }}
                      >
                        <Inspect
                          className="cursor-default"
                          detail={`${row.label}, ${channelLabel(channel)}: ${Math.round((cell.meetingRate ?? 0) * cell.opened)} meetings from ${cell.opened} opened links`}
                        >
                          <span className="font-medium">{formatPercent(cell.meetingRate)}</span>
                          <span className="ml-1 text-muted-foreground">{`(${cell.opened})`}</span>
                        </Inspect>
                      </TableCell>
                    ) : (
                      <TableCell key={channel} className="text-right text-muted-foreground">
                        No links
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </MetricsCard>
  )
}
