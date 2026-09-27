import { useId } from 'react'
import type { BuyerScope, VideoPageData } from '@mergero/shared'
import type { PageStrings } from '@mergero/shared/i18n/base'
import { ExternalLink } from 'lucide-react'
import { useRecorder } from './recorder-context.ts'
import { safeHttpUrl } from './urls.ts'

export function BuyerLinks({
  buyers,
  scope,
  strings,
}: {
  buyers: VideoPageData['buyers']
  scope: BuyerScope
  strings: PageStrings
}) {
  const recorder = useRecorder()
  const id = useId()
  const tap = (buyerId: string) => recorder.record('buyer_link_tap', { slide: 5, data: { buyerId } })
  return (
    <section aria-labelledby={id} data-region="buyers" className="motion-safe:animate-reveal">
      <h2 id={id} className="text-lg font-semibold tracking-tight text-ink">
        {scope === 'featured' ? strings.buyersHeadingFeatured : strings.buyersHeading}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {buyers.map((buyer) => {
          const href = safeHttpUrl(buyer.website)
          return (
            <li key={buyer.id} className="flex flex-col rounded-xl border border-line bg-white p-4">
              <p className="font-semibold text-ink">{buyer.name}</p>
              <p className="mt-1 flex-1 text-sm text-muted">{buyer.focus}</p>
              {href !== null && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${strings.visitWebsite}: ${buyer.name}`}
                  data-track="buyer-link"
                  onClick={() => tap(buyer.id)}
                  onAuxClick={(event) => {
                    if (event.button === 1) tap(buyer.id)
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand underline-offset-4 hover:underline"
                >
                  {strings.visitWebsite}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
