import { slideTimes } from '@mergero/shared'
import type { Timeline, VideoPageData } from '@mergero/shared'
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

export function buildPageData(
  db: Db,
  deal: DealRow,
  row: TimelineRow,
  options: { preview: boolean; now: Date },
): VideoPageData {
  const analyst = requireAnalyst(db, deal.analystId)
  const { timeline } = row
  const slides = slideTimes(timeline)
  const buyersVariables = timeline.segments.find((segment) => segment.slide === 5)?.variables
  const query = options.preview ? '?preview=1' : ''
  const buyers =
    buyersVariables?.template === 'buyers'
      ? buyersVariables.buyers.map((buyer, index) => ({
          id: buyer.id,
          name: buyer.name,
          focus: buyer.focus,
          website: buyer.website,
          logoUrl: buyer.logoFile ? `/v/${deal.linkCode}/logos/${index}${query}` : null,
        }))
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
