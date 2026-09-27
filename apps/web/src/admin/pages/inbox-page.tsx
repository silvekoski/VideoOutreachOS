import { useRef } from 'react'
import type { InboxDto, InboxGroupKey, InboxRow } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useInbox, useRetryJob } from '../api'
import { useCurrentAnalyst } from '../analyst-context'
import { InterestBadge } from '../components/interest-badge'
import { MailLink } from '../components/mail-link'
import { PageHeader } from '../components/page-header'
import { EmptyState, QueryState } from '../components/query-state'
import { formatDateTime } from '../lib/format'

const GROUPS: { key: InboxGroupKey; title: string; empty: string }[] = [
  { key: 'review', title: 'Review', empty: 'No videos to review and no failed jobs.' },
  { key: 'meeting_today', title: 'Meeting today', empty: 'No meetings in the next 24 hours.' },
  { key: 'call', title: 'Call', empty: 'No calls to make.' },
  { key: 'second_channel', title: 'Send on a second channel', empty: 'No links to send on a second channel.' },
]

const interestLabels = t('en').interest

function RowAction({ row, onRetried }: { row: InboxRow; onRetried: () => void }) {
  const retry = useRetryJob()
  const { action } = row
  if (action.kind === 'retry') {
    return (
      <Button
        size="sm"
        variant="outline"
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
  const target = action.kind === 'review' ? `/deals/${row.dealId}/review` : `/deals/${row.dealId}`
  return (
    <Button asChild size="sm" variant={action.kind === 'brief' ? 'default' : 'outline'}>
      <Link to={target}>{action.label}</Link>
    </Button>
  )
}

function InboxGroup({ title, empty, rows, timeZone }: { title: string; empty: string; rows: InboxRow[]; timeZone?: string }) {
  const headingId = `inbox-${title.toLowerCase().replace(/\s+/g, '-')}`
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h2 ref={heading} id={headingId} tabIndex={-1} className="flex items-center gap-2 text-sm font-semibold outline-none">
        {title}
        <span className="rounded-md bg-muted px-1.5 text-xs font-medium text-muted-foreground">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <div className="min-w-48 flex-1 basis-48">
                <p className="truncate text-sm font-medium">{row.company}</p>
                <p className="truncate text-xs text-muted-foreground">{row.context}</p>
                {row.lastSession && row.lastSession !== row.context ? (
                  <p className="truncate text-xs text-muted-foreground">{row.lastSession}</p>
                ) : null}
              </div>
              {row.meetingAt ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-mono tabular-nums">{`${formatDateTime(row.meetingAt, timeZone)}${timeZone ? ` (${timeZone})` : ''}`}</span>
                  {row.meetingEmail ? <MailLink email={row.meetingEmail} /> : null}
                  {row.interest ? (
                    <InterestBadge level={row.interest} label={`Interest: ${interestLabels[row.interest]}`} />
                  ) : (
                    <span className="text-muted-foreground">Interest: no data</span>
                  )}
                </div>
              ) : null}
              <RowAction row={row} onRetried={() => heading.current?.focus()} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function InboxGroups({ inbox, timeZone }: { inbox: InboxDto; timeZone?: string }) {
  return (
    <div className="grid gap-6">
      {GROUPS.map((group) => (
        <InboxGroup
          key={group.key}
          title={group.title}
          empty={group.empty}
          timeZone={timeZone}
          rows={inbox.groups.find((item) => item.key === group.key)?.rows ?? []}
        />
      ))}
    </div>
  )
}

export function InboxPage() {
  const { analyst, analystId, loading, error } = useCurrentAnalyst()
  const inbox = useInbox(analystId)
  return (
    <>
      <PageHeader
        title="Inbox"
        description={analyst ? `Deals of ${analyst.name} that need an action today.` : 'Deals that need an action today.'}
      />
      {analystId === null ? (
        loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading the analysts.
          </p>
        ) : (
          <EmptyState>
            {error ? 'Could not load the analysts. Check that the API runs.' : 'No analysts found. Check the Pipedrive users.'}
          </EmptyState>
        )
      ) : (
        <QueryState query={inbox} label="the inbox">
          {(data) => <InboxGroups inbox={data} timeZone={analyst?.timeZone} />}
        </QueryState>
      )}
    </>
  )
}
