import { useEffect, useRef, useState } from 'react'
import { isClosedStatus } from '@mergero/shared'
import type { ReviewDto, ReviewPatch, ReviewReason } from '@mergero/shared'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  ApiRequestError,
  errorMessage,
  isReviewReasonList,
  reviewIsWorking,
  useApprove,
  useDeal,
  usePatchReview,
  useReview,
} from '../api'
import { PageHeader } from '../components/page-header'
import { PipelineProgress } from '../components/pipeline-progress'
import { EmptyState, QueryState } from '../components/query-state'
import { StatusBadge } from '../components/state-badge'
import { FailedJobsList } from '../deal/failed-jobs-card'
import { MoreSection } from '../review/more-section'
import { RemakeVideoButton } from '../review/remake-video-button'
import { SlideRow } from '../review/slide-row'
import { VideoPanel } from '../review/video-panel'
import { approvalState, currentBlock, reasonListKey, versionPublished, type ApprovalBlock } from '../lib/review'
import { REVIEW_REASON_TITLES } from '../lib/status'
import { NotFoundPage } from './not-found-page'

function ReasonList({ reasons }: { reasons: ReviewReason[] }) {
  return (
    <ul className="grid gap-1">
      {reasons.map((reason) => (
        <li key={`${reason.code}-${reason.slide ?? 0}-${reason.slot ?? ''}`}>
          {reason.slide ? (
            <a href={`#slide-${reason.slide}`} className="font-medium underline underline-offset-2">
              {`Slide ${reason.slide}`}
            </a>
          ) : null}
          {`${reason.slide ? ': ' : ''}${REVIEW_REASON_TITLES[reason.code]}. ${reason.detail}`}
        </li>
      ))}
    </ul>
  )
}

function ReviewContent({ dealId, review, company }: { dealId: number; review: ReviewDto; company: string | null }) {
  const autosavePatch = usePatchReview(dealId, { silent: true })
  const patch = usePatchReview(dealId)
  const approve = useApprove(dealId)
  const [block, setBlock] = useState<ApprovalBlock | null>(null)
  const [approvedHere, setApprovedHere] = useState(false)
  const approvedRef = useRef<HTMLSpanElement>(null)
  const published = versionPublished(review)
  const working = reviewIsWorking(review)
  const approval = approvalState(review)
  const blocked = currentBlock(block, review.reviewReasons)
  const intro = review.timeline.segments.find((segment) => segment.template === 'facecam')
  const analystName = intro?.template === 'facecam' ? intro.variables.analystName : null

  const save = (body: ReviewPatch) => autosavePatch.mutateAsync(body)
  const saveNow = (body: ReviewPatch) => patch.mutate(body)

  useEffect(() => {
    if (approvedHere && review.approved) approvedRef.current?.focus()
  }, [approvedHere, review.approved])

  const onApprove = () => {
    if (approve.isPending) return
    setBlock(null)
    approve.mutate(undefined, {
      onSuccess: () => {
        setApprovedHere(true)
        toast.success('Approved. The tool makes the missing audio, renders and publishes the link.')
      },
      onError: (error) => {
        if (error instanceof ApiRequestError && error.status === 409 && isReviewReasonList(error.detail)) {
          setBlock({ reasons: error.detail, live: reasonListKey(review.reviewReasons) })
        } else toast.error(errorMessage(error))
      },
    })
  }

  return (
    <>
      <PageHeader
        title={company ? `Review: ${company}` : 'Review'}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={review.status} />
            <span>{`Version ${review.version}`}</span>
            <Link to={`/deals/${dealId}`} className="underline underline-offset-2">
              Deal page
            </Link>
          </span>
        }
        actions={
          review.approved ? (
            <span ref={approvedRef} tabIndex={-1} className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium outline-none">
              <CircleCheck aria-hidden="true" className="size-4" />
              {published && !working ? 'Approved and published' : 'Approved'}
            </span>
          ) : (
            <Button onClick={onApprove} aria-disabled={approve.isPending || undefined} className="aria-disabled:opacity-50">
              {approve.isPending ? 'Approving' : 'Approve and publish'}
            </Button>
          )
        }
      />
      {blocked ? (
        <Alert variant="destructive" role="alert">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>The tool cannot approve this version yet</AlertTitle>
          <AlertDescription>
            <ReasonList reasons={blocked} />
          </AlertDescription>
        </Alert>
      ) : review.reviewReasons.length > 0 ? (
        <Alert role="status">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Review reasons</AlertTitle>
          <AlertDescription>
            <ReasonList reasons={review.reviewReasons} />
          </AlertDescription>
        </Alert>
      ) : null}
      <RemakeVideoButton review={review} />
      {working ? (
        <PipelineProgress
          step={review.pipeline.step ?? (review.renderStatus === 'rendering' ? 'render' : null)}
          title={approval === 'waiting' ? 'Approved. The tool publishes the link when the render is ready.' : 'The tool makes the video'}
        />
      ) : null}
      {approval === 'published' && !working ? (
        <Alert role="status">
          <CircleCheck aria-hidden="true" />
          <AlertTitle>The link is published</AlertTitle>
          <AlertDescription>
            <Link to={`/deals/${dealId}`} className="underline underline-offset-2">
              Copy the link on the deal page
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {approval === 'blocked' ? (
        <Alert variant="destructive" role="status">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{`Version ${review.version} is approved but cannot continue`}</AlertTitle>
          <AlertDescription>
            Fix the review reasons above. An edit removes the approval, so approve the version again after the edit.
          </AlertDescription>
        </Alert>
      ) : null}
      {approval === 'closed' ? (
        <Alert role="status">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{`Version ${review.version} is not published`}</AlertTitle>
          <AlertDescription>
            {isClosedStatus(review.status)
              ? `The deal is ${review.status}, so the tool does not publish the video.`
              : 'The link has expired, so the tool does not publish the video.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {approval === 'failed' && !working ? (
        <Alert variant="destructive" role="status">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{`Version ${review.version} is not published`}</AlertTitle>
          <AlertDescription>
            {[
              review.renderStatus === 'failed' ? 'The render failed.' : 'A job failed.',
              review.publishedVersion !== null ? `The video page still shows version ${review.publishedVersion}.` : null,
              review.failedJobs.length > 0 ? 'Retry the failed job below.' : null,
            ]
              .filter((part) => part !== null)
              .join(' ')}
          </AlertDescription>
        </Alert>
      ) : null}
      {review.failedJobs.length > 0 ? <FailedJobsList jobs={review.failedJobs} /> : null}
      <VideoPanel review={review} />
      <section aria-labelledby="slides-heading" className="grid gap-3">
        <h2 id="slides-heading" className="text-sm font-semibold">
          Slides
        </h2>
        <ol className="grid gap-3">
          {[...review.slides]
            .sort((a, b) => a.slide - b.slide)
            .map((slide) => (
              <SlideRow
                key={slide.slide}
                slide={slide}
                review={review}
                analystName={analystName}
                save={save}
                saveNow={saveNow}
                savingNow={patch.isPending}
              />
            ))}
        </ol>
      </section>
      <MoreSection review={review} save={save} />
    </>
  )
}

function ReviewLoader({ dealId }: { dealId: number }) {
  const review = useReview(dealId)
  const deal = useDeal(dealId)
  if (review.isError && review.error instanceof ApiRequestError && review.error.status === 404) {
    return (
      <>
        <PageHeader title="Review" />
        <EmptyState>
          {'This deal has no video yet. '}
          <Link to={`/deals/${dealId}`} className="underline underline-offset-2">
            Open the deal page to start the video
          </Link>
        </EmptyState>
      </>
    )
  }
  return (
    <QueryState query={review} label="the review">
      {(data) => <ReviewContent dealId={dealId} review={data} company={deal.data?.company ?? null} />}
    </QueryState>
  )
}

export function ReviewPage() {
  const { id } = useParams()
  const dealId = Number(id)
  if (!Number.isInteger(dealId) || dealId <= 0) return <NotFoundPage />
  return <ReviewLoader key={dealId} dealId={dealId} />
}
