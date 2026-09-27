import type { ActionsDto, FollowUpRow, InterestLevel, InterestRow } from '@mergero/shared'
import { InterestBadge } from '../components/interest-badge'
import { MetricsCard, RateTable } from './metrics-card'

const ACTIONS: { key: Exclude<keyof ActionsDto, 'opened'>; label: string }[] = [
  { key: 'buyerLinkTap', label: 'Tapped a buyer link' },
  { key: 'calculator', label: 'Used the calculator' },
  { key: 'replayFiguresOrBuyers', label: 'Replayed the figures or the buyers' },
  { key: 'forward', label: 'Forwarded the link' },
]

const INTEREST_LABELS: Record<InterestLevel, string> = { high: 'High', medium: 'Medium', low: 'Low' }

const TASK_LABELS: Record<FollowUpRow['type'], string> = {
  call: 'Call, when the owner did not open the link in 2 days',
  second_channel: 'Second channel, when the owner opened but did not book in 2 days',
}

export function ActionsCard({ actions }: { actions: ActionsDto }) {
  return (
    <MetricsCard
      title="Page actions"
      description={`Owners ask two questions first: who are the buyers, and what is the company worth. The share of the ${actions.opened} opened links with each action.`}
    >
      <RateTable
        headers={['Action', 'Links', 'Share of opened links']}
        rows={ACTIONS.map(({ key, label }) => ({
          key,
          label,
          count: actions[key].deals,
          rate: actions[key].rate,
          detail: `${actions[key].deals} of ${actions.opened} opened links`,
        }))}
        empty="No page actions in this date range."
        tone="rate"
      />
    </MetricsCard>
  )
}

export function InterestCard({ rows }: { rows: InterestRow[] }) {
  return (
    <MetricsCard
      title="Interest level and meetings"
      description="Opened links in the date range, by the interest level of the meeting brief rules. If the rules are good, High gets a higher meeting rate than Low."
    >
      <RateTable
        headers={['Interest level', 'Opened links', 'Meeting rate']}
        rows={rows.map((row) => ({
          key: row.level,
          label: <InterestBadge level={row.level} label={INTEREST_LABELS[row.level]} />,
          count: row.deals,
          rate: row.meetingRate,
          detail: `${Math.round((row.meetingRate ?? 0) * row.deals)} of ${row.deals} links booked a meeting`,
        }))}
        empty="No opened links in this date range."
        tone="meeting"
      />
    </MetricsCard>
  )
}

export function FollowUpCard({ rows }: { rows: FollowUpRow[] }) {
  return (
    <MetricsCard
      title="Follow-up tasks"
      description="Links sent in the date range that got a follow-up task, and the share that booked a meeting after the task."
    >
      <RateTable
        headers={['Task', 'Tasks', 'Meeting rate after the task']}
        rows={rows.map((row) => ({
          key: row.type,
          label: TASK_LABELS[row.type],
          count: row.tasks,
          rate: row.rate,
          detail: `${row.booked} of ${row.tasks} links booked a meeting after the task`,
        }))}
        empty="No follow-up tasks in this date range."
        tone="meeting"
      />
    </MetricsCard>
  )
}
