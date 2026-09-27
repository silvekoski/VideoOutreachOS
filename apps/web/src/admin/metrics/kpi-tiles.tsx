import type { MetricsRow } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { Card } from '@/components/ui/card'
import { formatPercent } from '../lib/format'
import { Inspect } from './inspect'
import { Meter, type Tone } from './metrics-card'

interface Tile {
  label: string
  value: string
  note: string
  share: number | null
  tone?: Tone
  detail?: string
  marker?: number | null
}

function tiles(total: MetricsRow, textRate: number | null): Tile[] {
  const opened = Math.round((total.openRate ?? 0) * total.linksSent)
  return [
    { label: 'Links sent', value: String(total.linksSent), note: 'In the date range', share: null },
    { label: 'Open rate', value: formatPercent(total.openRate), note: `${opened} of ${total.linksSent} links opened`, share: total.openRate, tone: 'open' },
    {
      label: 'Average watch time',
      value: total.avgWatchS === null ? 'No data' : formatDurationS(total.avgWatchS),
      note: 'Per opened link',
      share: null,
    },
    { label: 'Form rate', value: formatPercent(total.formRate), note: 'Forms sent per link', share: total.formRate, tone: 'form' },
    {
      label: 'Meeting rate',
      value: formatPercent(total.meetingRate),
      note: textRate === null ? 'Meetings per link' : `The mark is the text sequence: ${formatPercent(textRate)}`,
      share: total.meetingRate,
      tone: 'meeting',
      detail: `Video sequence ${formatPercent(total.meetingRate)}, text sequence ${formatPercent(textRate)}`,
      marker: textRate,
    },
  ]
}

export function KpiTiles({ total, textRate }: { total: MetricsRow; textRate: number | null }) {
  return (
    <ul aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles(total, textRate).map((tile) => (
        <li key={tile.label} className="contents">
          <Card size="sm" className="justify-between px-3">
            <div className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">{tile.label}</span>
              <span className="font-heading text-3xl leading-none font-medium tabular-nums">{tile.value}</span>
            </div>
            <div className="grid gap-1.5">
              {tile.share === null ? null : (
                <Inspect detail={tile.detail ?? `${tile.label}: ${tile.value}`} className="block cursor-default py-1">
                  <Meter share={tile.share} tone={tile.tone} marker={tile.marker} className="h-2" />
                </Inspect>
              )}
              <span className="text-xs text-muted-foreground">{tile.note}</span>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}
