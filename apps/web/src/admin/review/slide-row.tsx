import type { ReviewDto, ReviewPatch, ReviewSlideDto } from '@mergero/shared'
import { StateBadge } from '../components/state-badge'
import { languageName } from '../lib/brief'
import { reasonsForSlide } from '../lib/review'
import { audioMeta, REVIEW_REASON_TITLES } from '../lib/status'
import { BuyersField } from './buyers-field'
import { LinesField } from './lines-field'
import { isNameTooLong } from './name-reasons'
import { RefreshNamesButton } from './refresh-names-button'
import { ScriptField } from './script-field'

interface SlideRowProps {
  slide: ReviewSlideDto
  review: ReviewDto
  analystName: string | null
  save: (patch: ReviewPatch) => Promise<unknown>
  saveNow: (patch: ReviewPatch) => void
  savingNow: boolean
}

export function Financials({ financials }: { financials: ReviewDto['financials'] }) {
  if (financials.mode === 'ask') {
    return (
      <p className="flex items-center gap-2 text-sm">
        <StateBadge meta={{ label: 'Ask in form', shape: 'square', tone: 'attention' }} />
        No public figures. The slide asks the owner to enter a range in the form.
      </p>
    )
  }
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <div>
        <dt className="text-xs text-muted-foreground">Revenue</dt>
        <dd className="font-medium">{financials.revenueText}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Operating profit</dt>
        <dd className="font-medium">{financials.profitText}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Source</dt>
        <dd>{`Asiakastieto, fiscal year ${financials.fiscalYear}`}</dd>
      </div>
    </dl>
  )
}

export function SlideRow({ slide, review, analystName, save, saveNow, savingNow }: SlideRowProps) {
  const reasons = reasonsForSlide(review.reviewReasons, slide.slide)
  const lang = review.timeline.language
  const headingId = `slide-${slide.slide}-heading`

  return (
    <li id={`slide-${slide.slide}`} aria-labelledby={headingId} className="grid scroll-mt-32 gap-4 md:scroll-mt-28 rounded-xl border bg-card p-4 md:grid-cols-[13rem_1fr]">
      <div className="grid content-start gap-2">
        <h3 id={headingId} className="text-sm font-semibold">{`${slide.slide}. ${slide.name}`}</h3>
        {slide.slide === 1 ? (
          <StateBadge meta={{ label: 'Fixed', shape: 'square', tone: 'neutral' }} className="justify-self-start" />
        ) : (
          <span aria-live="polite">
            <StateBadge meta={audioMeta(slide.audioStatus, slide.newAudio)} />
          </span>
        )}
        {slide.audioError ? <p className="text-xs text-destructive">{slide.audioError}</p> : null}
        {slide.audioUrl && !slide.newAudio ? (
          <audio src={slide.audioUrl} controls preload="none" aria-label={`Audio of slide ${slide.slide}`} className="h-8 w-full" />
        ) : null}
        {reasons.length > 0 ? (
          <ul className="grid gap-1 text-xs text-destructive">
            {reasons.map((reason) => (
              <li key={`${reason.code}-${reason.slot ?? ''}`} className="grid justify-items-start gap-1">
                {`${REVIEW_REASON_TITLES[reason.code]}: ${reason.detail}`}
                {isNameTooLong(reason) ? (
                  <>
                    <span className="text-muted-foreground">Shorten the name in Pipedrive, then read it again.</span>
                    <RefreshNamesButton dealId={review.dealId} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="grid min-w-0 content-start gap-4">
        {slide.slide === 1 ? (
          <p className="text-sm text-muted-foreground">
            {`The face-cam intro of ${analystName ?? 'the analyst'} in ${languageName(lang)}. It is the same for all videos. Change it in the profile menu.`}
          </p>
        ) : null}
        {slide.slide === 3 ? (
          <>
            {review.screenshotUrl ? (
              <img
                src={review.screenshotUrl}
                alt="Screenshot of the company website"
                className="w-full max-w-md rounded-lg border object-cover object-top aspect-[16/10]"
              />
            ) : (
              <p className="text-sm text-muted-foreground">No screenshot of the website.</p>
            )}
            <LinesField
              lines={review.lines}
              lang={lang}
              scrapeOk={review.scrapeOk}
              source={review.linesSource}
              save={save}
            />
          </>
        ) : null}
        {slide.slide === 4 ? <Financials financials={review.financials} /> : null}
        {slide.slide === 5 ? <BuyersField buyers={review.buyers} pending={savingNow} save={saveNow} /> : null}
        {slide.slide !== 1 ? (
          <ScriptField
            slide={slide.slide}
            script={slide.script ?? ''}
            lang={lang}
            needsCheck={reasons.some((reason) => reason.code === 'script_check')}
            save={save}
          />
        ) : null}
      </div>
    </li>
  )
}
