import type { QueueItemDto, QueueState } from '@mergero/shared'
import { ListVideo, LoaderCircle } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useQueue } from '../api'
import { ShapeIcon } from '../components/shape-icon'
import { formatTime } from '../lib/format'
import { stepLabel } from '../lib/pipeline'
import type { Shape } from '../lib/status'

const STATE_SHAPES: Record<Exclude<QueueState, 'running'>, Shape> = { queued: 'circle-outline', retrying: 'circle-dashed' }

function stateText(item: QueueItemDto, fetchedAt: number): string {
  if (item.state === 'running') return 'Now'
  if (item.state === 'retrying') return `Retry at ${formatTime(item.runAt)}`
  return Date.parse(item.runAt) > fetchedAt ? `Starts at ${formatTime(item.runAt)}` : 'Waiting for the worker'
}

export function QueueMenu() {
  const queue = useQueue()
  const navigate = useNavigate()
  const count = queue.data?.length ?? 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={`Render queue, ${count} videos`}>
          <ListVideo aria-hidden="true" />
          {count > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
            >
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        <DropdownMenuLabel>Render queue</DropdownMenuLabel>
        {queue.isError ? (
          <p className="px-2 py-2 text-sm text-destructive">Could not load the queue.</p>
        ) : count === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">No videos in the queue.</p>
        ) : (
          queue.data?.map((item) => (
            <DropdownMenuItem key={item.dealId} className="items-start gap-2 py-1.5" onSelect={() => void navigate(`/deals/${item.dealId}`)}>
              {item.state === 'running' ? (
                <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-link motion-safe:animate-spin" />
              ) : (
                <ShapeIcon shape={STATE_SHAPES[item.state]} className="mt-1 text-muted-foreground" />
              )}
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-medium">{item.company}</span>
                <span className="text-xs text-muted-foreground">{`${stepLabel(item.step)}, ${item.analystName}`}</span>
                <span className="text-xs text-muted-foreground">{stateText(item, queue.dataUpdatedAt)}</span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
