import type { ReactNode } from 'react'
import type { DealDetailDto } from '@mergero/shared'
import { Download, ExternalLink, FilePenLine, MonitorPlay } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { MailLink } from '../components/mail-link'
import { StatusBadge } from '../components/state-badge'
import { displayName, languageName } from '../lib/brief'
import { formatDate, formatZonedDateTime } from '../lib/format'
import { CopyLinkMenu } from './copy-link-menu'
import { ExpiryDialog } from './expiry-dialog'

function NewTab() {
  return <span className="sr-only"> (opens in a new tab)</span>
}

export function DealHeader({ deal }: { deal: DealDetailDto }) {
  const { timeZone } = deal.analyst
  const facts: [string, ReactNode][] = [
    ['Owner', deal.ownerRole ? `${deal.ownerName}, ${deal.ownerRole}` : deal.ownerName],
    ['Country', `${displayName('en-US', 'region', deal.country)} (${deal.country})`],
    ['Video language', languageName(deal.language)],
    ['Page language', languageName(deal.pageLanguage)],
    ['Analyst', deal.analyst.name],
    [
      'Link',
      deal.expired
        ? `Expired${deal.expiresAt ? ` on ${formatDate(deal.expiresAt, timeZone)}` : ''}`
        : deal.expiresAt
          ? `Expires on ${formatDate(deal.expiresAt, timeZone)}`
          : `Not published, expiry ${deal.expiryDays} days`,
    ],
  ]
  if (deal.meetingAt) {
    facts.push(
      ['Meeting', formatZonedDateTime(deal.meetingAt, timeZone)],
      ['Invitation email', deal.meetingEmail ? <MailLink email={deal.meetingEmail} /> : 'Not given. Use the Pipedrive contact.'],
    )
  }

  return (
    <header className="grid gap-3 print:hidden">
      <title>{`${deal.company} | Mergero video tool`}</title>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="page-title" tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">{deal.company}</h1>
          {deal.website ? (
            <a
              href={deal.website}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {deal.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              <NewTab />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No website</p>
          )}
        </div>
        <StatusBadge status={deal.status} className="h-6 text-sm" />
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {facts.map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{term}</dt>
            <dd className="truncate">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <CopyLinkMenu links={deal.expired ? null : deal.links} />
        {deal.download720 && !deal.expired ? (
          <Button asChild variant="outline" size="sm">
            <a href={deal.download720} download>
              <Download aria-hidden="true" />
              Download 720p
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled title="The video exists after publication">
            <Download aria-hidden="true" />
            Download 720p
          </Button>
        )}
        <ExpiryDialog dealId={deal.id} expiryDays={deal.expiryDays} expiresAt={deal.expiresAt} timeZone={timeZone} />
        <Button asChild variant="outline" size="sm">
          <Link to={`/deals/${deal.id}/review`}>
            <FilePenLine aria-hidden="true" />
            Review page
          </Link>
        </Button>
        {deal.previewUrl && !deal.expired ? (
          <Button asChild variant="outline" size="sm">
            <a href={deal.previewUrl} target="_blank" rel="noreferrer">
              <MonitorPlay aria-hidden="true" />
              Preview video page
              <NewTab />
            </a>
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <a href={deal.pipedriveUrl} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" />
            Pipedrive deal
            <NewTab />
          </a>
        </Button>
      </div>
    </header>
  )
}
