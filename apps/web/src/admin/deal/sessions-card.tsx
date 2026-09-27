import { useState } from 'react'
import type { SessionRowDto } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import { ChartGantt } from 'lucide-react'
import { ChannelIcon } from '@/components/channel-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSessionEvents } from '../api'
import { QueryState } from '../components/query-state'
import { ReplayTimeline } from '../components/replay-timeline'
import { channelLabel } from '../lib/events'
import { formatDateTime, formatZonedDateTime, timeZoneNote } from '../lib/format'
import { useReturnFocus } from '../lib/use-return-focus'
import { DealCard } from './deal-card'

const devices: Record<string, string> = t('en').devices

function ReplayDialog({ session, timeZone, onClose }: { session: SessionRowDto; timeZone: string; onClose: () => void }) {
  const events = useSessionEvents(session.id)
  const returnFocus = useReturnFocus()
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...returnFocus} className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{`Session of ${formatZonedDateTime(session.startedAt, timeZone)}`}</DialogTitle>
          <DialogDescription>
            {`${channelLabel(session.channel)}, ${devices[session.device] ?? session.device}, ${session.browser} on ${session.os}, screen ${session.screen}. The timeline shows the video time. It does not replay the page.`}
          </DialogDescription>
        </DialogHeader>
        <QueryState query={events} label="the session events">
          {(data) => <ReplayTimeline data={data} />}
        </QueryState>
      </DialogContent>
    </Dialog>
  )
}

export function SessionsCard({ sessions, timeZone }: { sessions: SessionRowDto[]; timeZone: string }) {
  const [replay, setReplay] = useState<SessionRowDto | null>(null)
  const ordered = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return (
    <DealCard id="sessions" title="Sessions" description={`One row per visit to the video page. ${timeZoneNote(timeZone)}`}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Watch time</TableHead>
              <TableHead>Stop slide</TableHead>
              <TableHead>Form activity</TableHead>
              <TableHead>
                <span className="sr-only">Replay</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-mono text-xs tabular-nums">{formatDateTime(session.startedAt, timeZone)}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <ChannelIcon channel={session.channel} className="size-3.5" />
                    {channelLabel(session.channel)}
                  </span>
                </TableCell>
                <TableCell>{devices[session.device] ?? session.device}</TableCell>
                <TableCell className="tabular-nums">
                  {session.analytics ? formatDurationS(session.analytics.watchS) : 'No data'}
                </TableCell>
                <TableCell>{session.analytics?.stopSlide ?? 'None'}</TableCell>
                <TableCell>{session.analytics?.formActivity ? 'Yes' : 'No'}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setReplay(session)}
                    aria-label={`Replay the session of ${formatDateTime(session.startedAt, timeZone)}`}
                  >
                    <ChartGantt aria-hidden="true" />
                    Replay
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {replay ? <ReplayDialog session={replay} timeZone={timeZone} onClose={() => setReplay(null)} /> : null}
    </DealCard>
  )
}
