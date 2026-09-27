import { SLIDE_NAMES_EN, slideTimes } from '@mergero/shared'
import type { ReviewDto, ReviewSlideDto, ReviewVideoDto, TemplateVariables, Timeline } from '@mergero/shared'
import type { Db } from '../db/index.ts'
import type { DealRow, TimelineRow } from '../db/rows.ts'
import { isExpired } from '../domain/deals.ts'
import { DomainError } from '../domain/errors.ts'
import { dealPipelineState } from '../domain/pipeline.ts'
import { listTimelines } from '../domain/timelines.ts'
import { paths } from '../paths.ts'
import { failedJobs } from '../queue/index.ts'
import { failedJobDto } from './jobs.ts'
import { dealFileOf, dealFileUrl, isFile } from './urls.ts'

type Variables<T extends TemplateVariables['template']> = Extract<TemplateVariables, { template: T }>

function variablesOf<T extends TemplateVariables['template']>(timeline: Timeline, template: T): Variables<T> | null {
  const variables = timeline.segments.find((segment) => segment.template === template)?.variables
  return variables?.template === template ? (variables as Variables<T>) : null
}

function storageFileUrl(dealId: number, storagePath: string | null, query: Record<string, string> = {}): string | null {
  const file = dealFileOf(dealId, storagePath)
  return file === null ? null : dealFileUrl(dealId, file, query)
}

function playedSlides(timeline: Timeline): ReviewVideoDto['slides'] {
  return timeline.segments.every((segment) => segment.startS !== null && segment.endS !== null) ? slideTimes(timeline) : []
}

async function newestVideo(dealId: number, rows: readonly TimelineRow[]): Promise<ReviewVideoDto | null> {
  for (const row of [...rows].reverse()) {
    if (row.renderStatus !== 'rendered') continue
    for (const [name, file] of [
      [`video-1080.v${row.version}.mp4`, paths.video1080(dealId, row.version)],
      [`video-720.v${row.version}.mp4`, paths.video720(dealId, row.version)],
    ] as const) {
      if (!(await isFile(file))) continue
      return {
        version: row.version,
        url: dealFileUrl(dealId, name),
        captionsUrl: `/api/deals/${dealId}/captions.v${row.version}.vtt`,
        language: row.timeline.language,
        slides: playedSlides(row.timeline),
      }
    }
  }
  return null
}

function slideDtos(dealId: number, timeline: Timeline): ReviewSlideDto[] {
  return timeline.segments.map((segment) =>
    segment.template === 'facecam'
      ? {
          slide: segment.slide,
          name: SLIDE_NAMES_EN[segment.slide],
          script: null,
          audioStatus: null,
          audioError: null,
          audioUrl: null,
          newAudio: false,
        }
      : {
          slide: segment.slide,
          name: SLIDE_NAMES_EN[segment.slide],
          script: segment.script,
          audioStatus: segment.audio.status,
          audioError: segment.audio.error,
          audioUrl: storageFileUrl(dealId, segment.audio.file),
          newAudio: segment.audio.status === 'new',
        },
  )
}

export async function reviewDto(db: Db, deal: DealRow, now: Date): Promise<ReviewDto> {
  const rows = listTimelines(db, deal.id)
  const row = rows.at(-1)
  if (!row) throw new DomainError(404, `The video of deal ${deal.id} has no script yet`)
  const { timeline } = row
  const company = variablesOf(timeline, 'your-company')
  const figures = variablesOf(timeline, 'your-figures')
  const buyers = variablesOf(timeline, 'buyers')
  const shown = new Set(buyers?.buyers.map((buyer) => buyer.id))
  const logos = new Map(
    [...(deal.mgx?.featuredBuyers ?? []), ...(deal.mgx?.countryFeaturedBuyers ?? []), ...(deal.mgx?.buyers ?? [])].map((buyer) => [buyer.id, buyer.logoUrl]),
  )
  return {
    dealId: deal.id,
    status: deal.status,
    reviewReasons: deal.reviewReasons,
    version: row.version,
    publishedVersion: deal.publishedVersion,
    renderStatus: row.renderStatus,
    approved: row.approvedAt !== null,
    expired: isExpired(deal, now),
    video: await newestVideo(deal.id, rows),
    timeline,
    slides: slideDtos(deal.id, timeline),
    screenshotUrl: storageFileUrl(deal.id, company?.screenshotFile ?? null, deal.scrape ? { v: deal.scrape.scrapedAt } : {}),
    lines: company?.lines ?? [],
    linesSource: company?.linesSource ?? null,
    scrapeOk: deal.scrape?.ok ?? false,
    financials:
      figures?.mode === 'figures'
        ? { mode: 'figures', revenueText: figures.revenueText, profitText: figures.profitText, fiscalYear: figures.fiscalYear }
        : { mode: 'ask' },
    buyers: (buyers?.candidates ?? buyers?.buyers ?? []).map((buyer) => ({
      id: buyer.id,
      name: buyer.name,
      focus: buyer.focus,
      logoUrl: logos.get(buyer.id) ?? null,
      removed: !shown.has(buyer.id),
    })),
    customQuestions: deal.customQuestions,
    expiryDays: deal.expiryDays,
    pageLanguage: deal.pageLanguage,
    pipeline: dealPipelineState(db, deal.id),
    failedJobs: failedJobs(db, { dealId: deal.id }).map(failedJobDto),
  }
}
