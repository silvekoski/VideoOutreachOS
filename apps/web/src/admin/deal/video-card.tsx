import type { ReviewDto, ReviewSlideDto } from '@mergero/shared'
import { Pencil } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { ApiRequestError, useReview } from '../api'
import { QueryState } from '../components/query-state'
import { languageName } from '../lib/brief'
import { BuyerLogo } from '../review/buyers-field'
import { Financials } from '../review/slide-row'
import { VideoPanel } from '../review/video-panel'
import { DealCard } from './deal-card'

function SlideContent({ slide, review }: { slide: ReviewSlideDto; review: ReviewDto }) {
  const lang = review.timeline.language
  const intro = review.timeline.segments.find((segment) => segment.template === 'facecam')
  const analystName = intro?.template === 'facecam' ? intro.variables.analystName : null
  const headingId = `content-slide-${slide.slide}`

  return (
    <li aria-labelledby={headingId} className="grid gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[13rem_1fr]">
      <h3 id={headingId} className="text-sm font-semibold">{`${slide.slide}. ${slide.name}`}</h3>
      <div className="grid min-w-0 gap-3 text-sm">
        {slide.slide === 1 ? (
          <p className="text-muted-foreground">
            {`The face-cam intro of ${analystName ?? 'the analyst'} in ${languageName(lang)}.`}
          </p>
        ) : null}
        {slide.slide === 3 ? (
          <>
            {review.screenshotUrl ? (
              <img src={review.screenshotUrl} alt="Screenshot of the company website" className="w-full max-w-sm rounded-lg border object-cover object-top aspect-[16/10]" />
            ) : null}
            <ul lang={lang} className="list-disc pl-4">
              {review.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        {slide.slide === 4 ? <Financials financials={review.financials} /> : null}
        {slide.slide === 5 ? (
          <ol className="grid gap-2">
            {review.buyers
              .filter((buyer) => !buyer.removed)
              .map((buyer) => (
                <li key={buyer.id} className="flex items-center gap-3">
                  <BuyerLogo buyer={buyer} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{buyer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{buyer.focus}</p>
                  </div>
                </li>
              ))}
          </ol>
        ) : null}
        {slide.script ? (
          <p lang={lang} className="whitespace-pre-line text-muted-foreground">
            {slide.script}
          </p>
        ) : null}
      </div>
    </li>
  )
}

export function VideoCard({ dealId }: { dealId: number }) {
  const review = useReview(dealId)
  if (review.isError && review.error instanceof ApiRequestError && review.error.status === 404) return null

  return (
    <QueryState query={review} label="the video">
      {(data) => (
        <>
          <DealCard
            id="video"
            title="Video"
            description={`Version ${data.video?.version ?? data.version}`}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={`/deals/${dealId}/review`}>
                  <Pencil aria-hidden="true" />
                  Edit
                  <span className="sr-only"> video</span>
                </Link>
              </Button>
            }
          >
            <VideoPanel review={data} />
          </DealCard>
          <DealCard id="video-content" title="Video content" description={`The slides and the scripts of version ${data.version}.`}>
            <ol className="grid divide-y">
              {[...data.slides]
                .sort((a, b) => a.slide - b.slide)
                .map((slide) => (
                  <SlideContent key={slide.slide} slide={slide} review={data} />
                ))}
            </ol>
          </DealCard>
        </>
      )}
    </QueryState>
  )
}
