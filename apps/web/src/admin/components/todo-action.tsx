import type { InboxGroupKey, InboxRow } from '@mergero/shared'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRetryJob } from '../api'
import { formatTime } from '../lib/format'
import type { StateMeta } from '../lib/status'
import { dealHref, type TodoItem } from '../lib/todo'
import { StateBadge } from './state-badge'

const GROUP_META: Record<InboxGroupKey, StateMeta> = {
  review: { label: 'Review', shape: 'diamond', tone: 'attention' },
  meeting_today: { label: 'Meeting', shape: 'check', tone: 'success' },
  call: { label: 'Call', shape: 'triangle', tone: 'progress' },
  second_channel: { label: 'Second channel', shape: 'square', tone: 'progress' },
}

const FAILED: StateMeta = { label: 'Failed', shape: 'cross', tone: 'danger' }

export function TodoReason({ item, timeZone }: { item: TodoItem; timeZone?: string }) {
  const { row, group } = item
  if (row.action.kind === 'retry') return <StateBadge meta={FAILED} />
  if (row.meetingAt) return <StateBadge meta={GROUP_META[group]} label={`Meeting ${formatTime(row.meetingAt, timeZone)}`} />
  return <StateBadge meta={GROUP_META[group]} />
}

export function TodoAction({ row, onRetried }: { row: InboxRow; onRetried: () => void }) {
  const retry = useRetryJob()
  const { action } = row
  if (action.kind === 'retry') {
    return (
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        disabled={retry.isPending}
        onClick={() =>
          retry.mutate(action.jobId, {
            onSuccess: () => {
              toast.success(`Retry queued for ${row.company}.`)
              onRetried()
            },
          })
        }
      >
        {retry.isPending ? 'Retrying' : action.label}
      </Button>
    )
  }
  return (
    <Button asChild size="sm" variant={action.kind === 'review' ? 'default' : 'outline'}>
      <Link to={row.dealId === null ? '/' : dealHref(row.dealId, null, action)}>{action.label}</Link>
    </Button>
  )
}
