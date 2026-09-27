import { useCallback, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { SlideNumber, VideoPageData } from '@mergero/shared'
import { fill } from '@mergero/shared/i18n/base'
import type { Strings } from '@mergero/shared/i18n/base'
import { CalendarDays } from 'lucide-react'
import logoUrl from '../../../../config/mergero-logo-dark.svg'
import { BuyerLinks } from './buyer-links.tsx'
import { Calendar } from './calendar.tsx'
import { CompanyForm } from './company-form.tsx'
import type { Platform } from './device.ts'
import { ForwardButton } from './forward-button.tsx'
import { PageFooter } from './page-footer.tsx'
import { Player } from './player.tsx'
import { Transcript } from './transcript.tsx'

export function App({ data, strings, platform }: { data: VideoPageData; strings: Strings; platform: Platform }) {
  const page = strings.page
  const calendarHeading = useRef<HTMLHeadingElement>(null)
  const [slide, setSlide] = useState<SlideNumber | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(data.meetingAt !== null)

  const onSlideChange = useCallback((next: SlideNumber | null) => {
    setSlide(next)
    if (next === 8) setCalendarOpen(true)
  }, [])
  const onEnded = useCallback(() => setCalendarOpen(true), [])

  function openCalendar() {
    flushSync(() => setCalendarOpen(true))
    const heading = calendarHeading.current
    if (!heading) return
    heading.focus({ preventScroll: true })
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    heading.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const title = fill(strings.og.title, { analyst: data.analystName, company: data.company })

  return (
    <div className="flex min-h-dvh flex-col">
      <header data-region="header" className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4">
          <img src={logoUrl} alt={data.contact.company} width={500} height={68} className="h-6 w-auto" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 lg:pt-10">
        <h1 className="max-w-3xl text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl">{title}</h1>
        <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-start-1">
            <Player
              data={data}
              strings={page}
              locale={strings.locale}
              title={fill(page.shareTitle, { company: data.company })}
              platform={platform}
              onSlideChange={onSlideChange}
              onEnded={onEnded}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-track="book-meeting"
                onClick={openCalendar}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-ink"
              >
                <CalendarDays className="size-4" aria-hidden="true" />
                {page.calendarHeading}
              </button>
              <ForwardButton strings={page} company={data.company} />
            </div>
            {slide === 5 && data.buyers.length > 0 && <BuyerLinks buyers={data.buyers} scope={data.buyerScope} strings={page} />}
            {calendarOpen && (
              <Calendar data={data} strings={page} locale={strings.locale} headingRef={calendarHeading} />
            )}
            <Transcript transcript={data.transcript} lang={data.videoLanguage} strings={page} />
          </div>
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <CompanyForm data={data} strings={strings} />
          </div>
        </div>
      </main>
      <PageFooter data={data} strings={page} />
    </div>
  )
}
