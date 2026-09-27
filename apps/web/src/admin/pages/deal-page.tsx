import type { DealDetailDto } from '@mergero/shared'
import { TriangleAlert } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ApiRequestError, useDeal, useEnsureDeal } from '../api'
import { PageHeader } from '../components/page-header'
import { PipelineProgress } from '../components/pipeline-progress'
import { EmptyState, QueryError } from '../components/query-state'
import { Skeleton } from '@/components/ui/skeleton'
import { BriefCard } from '../deal/brief-card'
import { DealHeader } from '../deal/deal-header'
import { EventsCard } from '../deal/events-card'
import { FailedJobsCard } from '../deal/failed-jobs-card'
import { FormAnswersCard } from '../deal/form-answers-card'
import { OpenTaskCard } from '../deal/open-task-card'
import { SessionsCard } from '../deal/sessions-card'
import { WatchTimeCard } from '../deal/watch-time-card'
import { dealTimeline } from '../lib/events'
import { REVIEW_REASON_TITLES } from '../lib/status'
import { NotFoundPage } from './not-found-page'

function DealContent({ deal }: { deal: DealDetailDto }) {
  const timeline = dealTimeline(deal.events)
  const { timeZone } = deal.analyst
  const failed = deal.status === 'failed'
  const pending = deal.pendingVersion
  const hasActivity =
    deal.brief !== null ||
    deal.openTasks.length > 0 ||
    timeline.length > 0 ||
    (deal.analytics !== null && deal.analytics.sessions > 0) ||
    deal.sessions.length > 0 ||
    deal.form !== null ||
    deal.failedJobs.length > 0

  return (
    <>
      <DealHeader deal={deal} />
      {deal.pipeline.running ? <PipelineProgress step={deal.pipeline.step} /> : null}
      {deal.status === 'review' || failed || pending !== null ? (
        <Alert variant={failed ? 'destructive' : 'default'} role="status" className="print:hidden">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>
            {failed ? 'The video failed' : pending !== null ? `Version ${pending} needs your review` : 'The video needs your review'}
          </AlertTitle>
          <AlertDescription>
            {pending !== null ? (
              <p>{`The video page shows version ${deal.publishedVersion} until you approve version ${pending}.`}</p>
            ) : null}
            {deal.reviewReasons.length > 0 ? (
              <ul className="list-disc pl-4">
                {deal.reviewReasons.map((reason) => (
                  <li key={`${reason.code}-${reason.slide ?? 0}-${reason.slot ?? ''}`}>
                    {`${REVIEW_REASON_TITLES[reason.code]}: ${reason.detail}`}
                  </li>
                ))}
              </ul>
            ) : null}
            <Button asChild size="sm" className="mt-2">
              <Link to={`/deals/${deal.id}/review`}>Open the Review page</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {deal.brief ? <BriefCard dealId={deal.id} brief={deal.brief} meetingEmail={deal.meetingEmail} timeZone={timeZone} /> : null}
      {deal.openTasks.map((task) => (
        <OpenTaskCard key={task.id} deal={deal} task={task} />
      ))}
      {timeline.length > 0 ? <EventsCard events={timeline} timeZone={timeZone} /> : null}
      {deal.analytics && deal.analytics.sessions > 0 ? (
        <WatchTimeCard analytics={deal.analytics} slideNames={deal.slideNames} />
      ) : null}
      {deal.sessions.length > 0 ? <SessionsCard sessions={deal.sessions} timeZone={timeZone} /> : null}
      {deal.form ? <FormAnswersCard form={deal.form} valuation={deal.valuation} timeZone={timeZone} /> : null}
      {deal.failedJobs.length > 0 ? <FailedJobsCard jobs={deal.failedJobs} timeZone={timeZone} /> : null}
      {!hasActivity && !deal.pipeline.running ? (
        <EmptyState>No activity yet. The cards show after the owner opens the link.</EmptyState>
      ) : null}
    </>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="grid gap-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

function DealLoader({ dealId }: { dealId: number }) {
  const ensure = useEnsureDeal(dealId)
  const deal = useDeal(dealId, ensure.isSuccess)

  if (ensure.isError) {
    const missing = ensure.error instanceof ApiRequestError && ensure.error.status === 404
    return (
      <>
        <PageHeader title={missing ? 'Deal not found' : 'Deal'} />
        {missing ? (
          <EmptyState>{`Pipedrive has no deal ${dealId}. Check the link in the Video field.`}</EmptyState>
        ) : (
          <QueryError error={ensure.error} label="the deal" onRetry={() => void ensure.refetch()} />
        )}
      </>
    )
  }
  if (ensure.isPending) return <Loading label="Preparing the deal" />
  if (deal.isPending) return <Loading label="Loading the deal" />
  if (deal.isError) return <QueryError error={deal.error} label="the deal" onRetry={() => void deal.refetch()} />
  return <DealContent deal={deal.data} />
}

export function DealPage() {
  const { id } = useParams()
  const dealId = Number(id)
  if (!Number.isInteger(dealId) || dealId <= 0) return <NotFoundPage />
  return <DealLoader key={dealId} dealId={dealId} />
}
