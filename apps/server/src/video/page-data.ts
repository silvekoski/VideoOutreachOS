import { fill, slideTimes } from '@mergero/shared'
import type { DealCardItem, Lang, Segment, Timeline, VideoPageData } from '@mergero/shared'
import { nowIso } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import type { DealRow, TimelineRow } from '../db/rows.ts'
import { requireAnalyst } from '../domain/analysts.ts'
import { contactFor } from '../domain/config.ts'
import { addDays } from '../domain/deals.ts'
import { calculatorEnabled, calculatorFor } from './valuation.ts'

export function mediaUrls(code: string, version: number, preview: boolean): VideoPageData['media'] {
  const base = `/v/${code}`
  const query = preview ? '?preview=1' : ''
  return {
    video720: `${base}/media/video-720.v${version}.mp4${query}`,
    video1080: `${base}/media/video-1080.v${version}.mp4${query}`,
    poster: `${base}/media/poster.v${version}.jpg${query}`,
    captions: `${base}/captions.v${version}.vtt${query}`,
  }
}

export function introTranscript(timeline: Timeline): string | null {
  const facecam = timeline.segments.find((segment) => segment.template === 'facecam')
  return facecam?.template === 'facecam' ? facecam.variables.transcript?.trim() || null : null
}

const SHOWN = { whoWeAreBuyers: 6, whoWeAreDeals: 3, companyLines: 3, buyers: 6, possibleDeals: 2 } as const

function regionName(code: string, lang: Lang): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

function pair(...parts: (string | undefined)[]): string {
  return parts.filter((part) => part?.trim()).join(': ')
}

function screenParts({ labels, variables: v }: Segment, lang: Lang): (string | undefined)[] {
  const deal = (item: DealCardItem) => pair(`${item.year}, ${regionName(item.country, lang)}`, item.text)
  switch (v.template) {
    case 'facecam':
      return [v.analystName]
    case 'who-we-are': {
      const buyers = v.buyers.slice(0, SHOWN.whoWeAreBuyers).map((buyer) => buyer.name)
      const deals = v.deals.slice(0, SHOWN.whoWeAreDeals)
      return [
        fill(labels.headline ?? '', { buyerCount: new Intl.NumberFormat(lang).format(v.buyerCount) }),
        buyers.length > 0 ? pair(labels['buyers-heading'], buyers.join(', ')) : undefined,
        deals.length > 0 ? labels['deals-heading'] : undefined,
        ...deals.map(deal),
      ]
    }
    case 'your-company':
      return [labels.headline, v.company, ...v.lines.slice(0, SHOWN.companyLines)]
    case 'your-figures':
      return v.mode === 'ask'
        ? [labels.headline, labels[v.calculator ? 'ask-calculator' : 'ask-form']]
        : [
            labels.headline,
            pair(labels.revenue, v.revenueText),
            pair(labels.profit, v.profitText),
            [fill(labels['fiscal-year'] ?? '{year}', { year: v.fiscalYear }), labels.source].filter(Boolean).join(', '),
          ]
    case 'buyers':
      return v.buyers.length === 0
        ? [labels.headline, labels.empty]
        : [labels.headline, ...v.buyers.slice(0, SHOWN.buyers).map((buyer) => pair(buyer.name, buyer.focus))]
    case 'what-is-possible':
      return v.deals.length === 0
        ? [labels.headline, labels.empty]
        : [labels.headline, ...v.deals.slice(0, SHOWN.possibleDeals).map(deal)]
    case 'privacy':
      return [labels.headline, labels['point-1'], labels['point-2'], labels['point-3']]
    case 'book-meeting':
      return [labels.headline, labels.line, v.analystName]
  }
}

export function buildPageData(
  db: Db,
  deal: DealRow,
  row: TimelineRow,
  options: { preview: boolean; now: Date },
): VideoPageData {
  const analyst = requireAnalyst(db, deal.analystId)
  const { timeline } = row
  const slides = slideTimes(timeline)
  const intro = introTranscript(timeline)
  const transcript: VideoPageData['transcript'] = timeline.segments.flatMap((segment) => {
    const text = (segment.template === 'facecam' ? intro : segment.script.trim()) ?? ''
    const screen = screenParts(segment, timeline.language).filter((part): part is string => Boolean(part?.trim()))
    return text || screen.length > 0 ? [{ slide: segment.slide, text, screen }] : []
  })
  const buyersVariables = timeline.segments.find((segment) => segment.slide === 5)?.variables
  const buyers =
    buyersVariables?.template === 'buyers'
      ? buyersVariables.buyers.map((buyer) => ({ id: buyer.id, name: buyer.name, focus: buyer.focus, website: buyer.website }))
      : []
  return {
    code: deal.linkCode,
    dealId: deal.id,
    company: deal.snapshot.company,
    ownerFirstName: deal.snapshot.ownerFirstName,
    analystName: analyst.name,
    analystEmail: analyst.email,
    pageLanguage: deal.pageLanguage,
    videoLanguage: timeline.language,
    country: deal.country,
    version: row.version,
    media: mediaUrls(deal.linkCode, row.version, options.preview),
    slides,
    durationS: slides.reduce((end, slide) => Math.max(end, slide.endS), 0),
    transcript,
    buyers,
    buyerScope: buyersVariables?.template === 'buyers' ? (buyersVariables.scope ?? 'sector') : 'sector',
    calculator: calculatorFor(deal),
    calculatorEnabled: calculatorEnabled(deal),
    customQuestions: deal.customQuestions,
    formSent: deal.formSentAt !== null,
    meetingAt: deal.meetingAt,
    expiresAt: deal.expiresAt ?? nowIso(addDays(options.now, deal.expiryDays)),
    preview: options.preview,
    contact: contactFor(deal.country),
  }
}
