import { useId } from 'react'
import type { VideoPageData } from '@mergero/shared'
import type { PageStrings } from '@mergero/shared/i18n/base'
import logoUrl from '../../../../config/mergero-logo-white.svg'
import { displayUrl, telHref } from './urls.ts'

const linkClass = 'font-medium text-brand underline-offset-4 hover:underline'

export function PageFooter({ data, strings }: { data: VideoPageData; strings: PageStrings }) {
  const privacyId = useId()
  const contactId = useId()
  const contact = data.contact
  return (
    <footer data-region="footer" className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-[3fr_2fr]">
        <section aria-labelledby={privacyId}>
          <h2 id={privacyId} className="font-semibold text-ink">
            {strings.privacyHeading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{strings.privacyText}</p>
          <a
            href={contact.privacyUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-track="privacy-link"
            className={`mt-3 inline-block text-sm ${linkClass}`}
          >
            {displayUrl(contact.privacyUrl)}
          </a>
        </section>
        <section aria-labelledby={contactId}>
          <h2 id={contactId} className="font-semibold text-ink">
            {strings.contactHeading}
          </h2>
          <address className="mt-2 space-y-3 text-sm text-text not-italic">
            <p>
              <span className="block font-medium text-ink">{data.analystName}</span>
              {data.analystEmail !== null && (
                <a href={`mailto:${data.analystEmail}`} data-track="analyst-email" className={linkClass}>
                  {data.analystEmail}
                </a>
              )}
            </p>
            <p>
              <span className="block font-medium text-ink">{contact.company}</span>
              <span className="block">{contact.address}</span>
              <a href={telHref(contact.phone)} data-track="contact-phone" className={`block ${linkClass}`}>
                {contact.phone}
              </a>
              <a href={`mailto:${contact.email}`} data-track="contact-email" className={`block ${linkClass}`}>
                {contact.email}
              </a>
              <a
                href={contact.website}
                target="_blank"
                rel="noopener noreferrer"
                data-track="contact-website"
                className={`block ${linkClass}`}
              >
                {displayUrl(contact.website)}
              </a>
            </p>
          </address>
        </section>
      </div>
      <div className="bg-ink">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <img src={logoUrl} alt={contact.company} width={500} height={68} className="h-6 w-auto" />
        </div>
      </div>
    </footer>
  )
}
