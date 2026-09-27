import { useState } from 'react'
import type { SlideNumber, VideoPageData } from '@mergero/shared'
import { fill } from '@mergero/shared/i18n/base'
import type { Strings } from '@mergero/shared/i18n/base'
import logoUrl from '../../../../config/mergero-logo-dark.svg'
import { BuyerLinks } from './buyer-links.tsx'
import { Calendar } from './calendar.tsx'
import { CompanyForm } from './company-form.tsx'
import type { Platform } from './device.ts'
import { ForwardButton } from './forward-button.tsx'
import { PageFooter } from './page-footer.tsx'
import { Player } from './player.tsx'

export function App({ data, strings, platform }: { data: VideoPageData; strings: Strings; platform: Platform }) {
  const page = strings.page
  const [slide, setSlide] = useState<SlideNumber | null>(null)

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
              onSlideChange={setSlide}
            />
            <div className="flex flex-wrap items-center gap-3">
              <ForwardButton strings={page} company={data.company} />
            </div>
            {slide === 5 && data.buyers.length > 0 && <BuyerLinks buyers={data.buyers} scope={data.buyerScope} strings={page} />}
            <Calendar data={data} strings={page} locale={strings.locale} />
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
