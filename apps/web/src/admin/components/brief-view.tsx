import { useId, type ReactNode } from 'react'
import type { FigureValue, Lang, MeetingBrief, Signal, SlideNumber } from '@mergero/shared'
import { formatDurationS } from '@mergero/shared'
import { fill, t, type BriefSection, type Strings } from '@mergero/shared/i18n'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { answerLabel, answerValue, displayName, figureText, hasSectionData, signalEvidence } from '../lib/brief'
import { formatZonedDateTime } from '../lib/format'
import { InterestBadge } from './interest-badge'
import { MailLink } from './mail-link'
import { ShapeIcon } from './shape-icon'
import { SlideWatchChart } from './slide-watch-chart'

interface SectionProps {
  title: string
  empty: boolean
  noData: string
  className?: string
  children: ReactNode
}

function Section({ title, empty, noData, className, children }: SectionProps) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('grid content-start gap-2 break-inside-avoid', className)}>
      <h3 id={id} className="border-b pb-1 text-sm font-semibold">
        {title}
      </h3>
      {empty ? <p className="text-sm text-muted-foreground">{noData}</p> : children}
    </section>
  )
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {items.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function FigureRow({ label, figure, lang }: { label: string; figure: FigureValue | null; lang: Lang }) {
  const s = t(lang)
  const b = s.brief
  return (
    <tr className="border-b last:border-0">
      <th scope="row" className="py-1 pr-3 text-left font-normal text-muted-foreground">
        {label}
      </th>
      <td className="py-1 pr-3 font-medium">{figureText(figure, lang)}</td>
      <td className="py-1 pr-3">{figure ? b.sources[figure.source] : ''}</td>
      <td className="py-1 pr-3">{figure ? b.valueTypes[figure.type] : ''}</td>
      <td className="py-1">{figure?.fiscalYear ? fill(b.fields.fiscalYear, { year: figure.fiscalYear }) : ''}</td>
    </tr>
  )
}

function SignalList({ title, signals, shape, timeZone, s }: {
  title: string
  signals: Signal[]
  shape: 'plus' | 'minus'
  timeZone: string
  s: Strings
}) {
  if (signals.length === 0) return null
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium">{title}</p>
      <ul className="grid gap-1 text-sm">
        {signals.map((signal) => {
          const proof = signalEvidence(signal, s, timeZone)
          return (
            <li key={signal.key} className="flex items-start gap-2">
              <ShapeIcon shape={shape} className="mt-1" />
              <span>
                {s.signals[signal.key]}
                {proof ? <span className="text-muted-foreground">{` (${s.brief.fields.evidence}: ${proof})`}</span> : null}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function BriefView({ brief, meetingEmail, timeZone }: { brief: MeetingBrief; meetingEmail: string | null; timeZone: string }) {
  const lang = brief.language
  const s = t(lang)
  const b = s.brief
  const f = b.fields
  const titleId = useId()
  const empty = (section: BriefSection) => !hasSectionData(brief, section)
  const numbers = new Intl.NumberFormat(s.locale)
  const slideName = (slide: SlideNumber) => fill(f.slide, { n: slide })
  const { header, company, figures, engagement, form } = brief

  return (
    <article lang={lang} aria-labelledby={titleId} className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={titleId} className="text-base font-semibold">
            {`${b.title}: ${header.company}`}
          </h2>
          <p className="text-xs text-muted-foreground">{`v${brief.version}, ${formatZonedDateTime(brief.writtenAt, timeZone)}`}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden" lang="en">
          <Printer aria-hidden="true" />
          Print
        </Button>
      </div>
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 print:grid-cols-2">
        <Section title={b.sections.header} empty={false} noData={b.noData} className="md:col-span-2 print:col-span-2">
          <Facts
            items={[
              [f.company, header.company],
              [f.owner, header.ownerRole ? `${header.owner}, ${header.ownerRole}` : header.owner],
              [
                f.meetingAt,
                <span key="meeting" className="inline-flex flex-wrap items-center gap-x-3">
                  {formatZonedDateTime(header.meetingAt, timeZone)}
                  {meetingEmail ? <MailLink email={meetingEmail} /> : null}
                </span>,
              ],
              [f.language, displayName(s.locale, 'language', header.language)],
              [f.interest, <InterestBadge key="interest" level={header.interest} label={s.interest[header.interest]} />],
            ]}
          />
          <div className="grid gap-1">
            <p className="text-xs font-medium text-muted-foreground">{f.summary}</p>
            <p className={cn('text-sm', !header.summary && 'text-muted-foreground')}>{header.summary ?? b.noSummary}</p>
          </div>
        </Section>

        <Section title={b.sections.company} empty={empty('company')} noData={b.noData}>
          {company.lines.length > 0 ? (
            <ul className="grid list-disc gap-1 pl-4 text-sm">
              {company.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{`${f.lines}: ${b.noData}`}</p>
          )}
          <Facts
            items={[
              [f.country, company.country ? displayName(s.locale, 'region', company.country) : b.noData],
              [f.nace, company.nace ?? b.noData],
              [f.staff, company.staffCount !== null ? numbers.format(company.staffCount) : b.noData],
            ]}
          />
        </Section>

        <Section title={b.sections.figures} empty={empty('figures')} noData={b.noData}>
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">{b.sections.figures}</th>
                <th scope="col">{f.value}</th>
                <th scope="col">{f.source}</th>
                <th scope="col">{f.valueType}</th>
                <th scope="col">{fill(f.fiscalYear, { year: '' }).trim()}</th>
              </tr>
            </thead>
            <tbody>
              <FigureRow label={f.revenue} figure={figures.revenue} lang={lang} />
              <FigureRow label={f.profit} figure={figures.profit} lang={lang} />
              <FigureRow label={f.valuation} figure={figures.valuation} lang={lang} />
            </tbody>
          </table>
        </Section>

        <Section
          title={b.sections.engagement}
          empty={empty('engagement')}
          noData={b.noData}
          className="md:col-span-2 print:col-span-2"
        >
          <Facts
            items={[
              [f.opens, String(engagement.opens)],
              [f.sessions, String(engagement.sessions)],
              [f.totalWatch, formatDurationS(engagement.totalWatchS)],
              [f.stopSlide, engagement.stopSlide ? slideName(engagement.stopSlide) : b.noData],
              [f.replays, String(engagement.replays)],
              [
                f.channels,
                engagement.channels.length > 0
                  ? engagement.channels
                      .map(({ channel, device }) => `${s.channels[channel] ?? channel} (${(s.devices as Record<string, string>)[device] ?? device})`)
                      .join(', ')
                  : b.noData,
              ],
            ]}
          />
          <SlideWatchChart
            perSlide={engagement.perSlide}
            stopSlide={engagement.stopSlide}
            slideName={slideName}
            labels={{ watch: f.perSlide, stop: f.stopSlide, slide: fill(f.slide, { n: '' }).trim(), replays: f.replays }}
          />
        </Section>

        <Section title={b.sections.signals} empty={empty('signals')} noData={b.noData}>
          <SignalList
            title={f.positive}
            shape="plus"
            signals={brief.signals.filter((signal) => signal.type === 'positive')}
            timeZone={timeZone}
            s={s}
          />
          <SignalList
            title={f.negative}
            shape="minus"
            signals={brief.signals.filter((signal) => signal.type === 'negative')}
            timeZone={timeZone}
            s={s}
          />
        </Section>

        <Section title={b.sections.form} empty={empty('form')} noData={b.noData}>
          {form ? (
            <>
              {form.answers.length > 0 ? (
                <Facts
                  items={form.answers.map((answer): [string, ReactNode] => [
                    answerLabel(answer.key, s),
                    <span key={answer.key} className="whitespace-pre-wrap">
                      {answerValue(answer.key, answer.value, s)}
                    </span>,
                  ])}
                />
              ) : null}
              {form.custom.length > 0 ? (
                <div className="grid gap-1">
                  <p className="text-xs font-medium text-muted-foreground">{f.custom}</p>
                  <dl className="grid gap-2 text-sm">
                    {form.custom.map((item) => (
                      <div key={item.question}>
                        <dt className="font-medium">{item.question}</dt>
                        <dd className="whitespace-pre-wrap">{item.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </>
          ) : null}
        </Section>

        <Section title={b.sections.buyers} empty={empty('buyers')} noData={b.noData}>
          <ul className="grid gap-1 text-sm">
            {brief.buyers.map((buyer) => (
              <li key={buyer.id} className="flex items-center gap-2">
                <ShapeIcon
                  shape={buyer.tapped ? 'check' : 'circle-outline'}
                  className={buyer.tapped ? 'text-foreground' : 'text-muted-foreground'}
                />
                <span className="min-w-0 flex-1 truncate">
                  {buyer.website ? (
                    <a href={buyer.website} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      {buyer.name}
                    </a>
                  ) : (
                    buyer.name
                  )}
                </span>
                <span className={cn('text-xs', buyer.tapped ? 'font-medium' : 'text-muted-foreground')}>
                  {buyer.tapped ? f.tapped : f.notTapped}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={b.sections.questions} empty={empty('questions')} noData={b.noData}>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            {(brief.questions ?? []).map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ol>
        </Section>
      </div>
    </article>
  )
}
