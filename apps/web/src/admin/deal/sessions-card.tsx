import { Suspense, lazy, useRef, useState } from 'react'
import type { SessionRowDto } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import { MonitorPlay } from 'lucide-react'
import { ChannelIcon } from '@/components/channel-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSessionEvents, useSessionRecording } from '../api'
import { QueryState } from '../components/query-state'
import { SessionEventList } from '../components/session-event-list'
import type { SessionPlayerHandle } from '../components/session-player'
import { channelLabel } from '../lib/events'
import { formatDateTime, formatZonedDateTime, timeZoneNote } from '../lib/format'
import { useReturnFocus } from '../lib/use-return-focus'
import { DealCard } from './deal-card'

const devices: Record<string, string> = t('en').devices
const SessionPlayer = lazy(() => import('../components/session-player'))

function ReplayDialog({ session, timeZone, onClose }: { session: SessionRowDto; timeZone: string; onClose: () => void }) {
  const events = useSessionEvents(session.id)
  const recording = useSessionRecording(session.id)
  const player = useRef<SessionPlayerHandle>(null)
  const [currentAt, setCurrentAt] = useState<number | null>(null)
  const returnFocus = useReturnFocus()
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent {...returnFocus} className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{`Session of ${formatZonedDateTime(session.startedAt, timeZone)}`}</DialogTitle>
          <DialogDescription>
            {`${channelLabel(session.channel)}, ${devices[session.device] ?? session.device}, ${session.browser} on ${session.os}, screen ${session.screen}. The recording hides the form. Select an event to go to that point in the recording.`}
          </DialogDescription>
        </DialogHeader>
        <QueryState query={recording} label="the screen recording">
          {(data) => (
            <Suspense fallback={<Skeleton className="aspect-video w-full" />}>
              <SessionPlayer ref={player} events={data} onTime={setCurrentAt} />
            </Suspense>
          )}
        </QueryState>
        <QueryState query={events} label="the session events">
          {(data) => (
            <SessionEventList
              data={data}
              currentAt={currentAt}
              onSeek={currentAt === null ? undefined : (at) => player.current?.seek(at)}
            />
          )}
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
                    <MonitorPlay aria-hidden="true" />
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
