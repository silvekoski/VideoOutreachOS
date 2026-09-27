import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { MetricsDto, MetricsRow } from '@mergero/shared'
import { z } from 'zod'
import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { listAnalysts } from '../domain/analysts.ts'
import { env } from '../env.ts'
import { log } from '../log.ts'
import { localDate } from './dates.ts'

export const COMPARISON_DEALS = 100

export interface MetricsDeal {
  analystId: number
  country: string
  publishedAt: string
  opened: boolean
  formSent: boolean
  booked: boolean
  watchS: number
}

export interface TextSequenceDeal {
  n: number
  meetingBooked: boolean
}

export interface MetricsInput {
  from: string
  to: string
  timeZone: string
  deals: readonly MetricsDeal[]
  textDeals: readonly TextSequenceDeal[]
  analystNames: ReadonlyMap<number, string>
}

const textSequenceSchema = z.object({
  deals: z.array(z.object({ n: z.int().positive(), sentAt: z.string(), opened: z.boolean(), meetingBooked: z.boolean() })),
})

const regionNames = new Intl.DisplayNames(['en-US'], { type: 'region' })

function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

function rate(count: number, total: number): number | null {
  return total === 0 ? null : Math.round((count / total) * 10_000) / 10_000
}

function metricsRow(key: string, label: string, deals: readonly MetricsDeal[]): MetricsRow {
  const opened = deals.filter((deal) => deal.opened)
  const watchS = opened.reduce((sum, deal) => sum + deal.watchS, 0)
  return {
    key,
    label,
    linksSent: deals.length,
    openRate: rate(opened.length, deals.length),
    avgWatchS: opened.length === 0 ? null : Math.round((watchS / opened.length) * 10) / 10,
    formRate: rate(deals.filter((deal) => deal.formSent).length, deals.length),
    meetingRate: rate(deals.filter((deal) => deal.booked).length, deals.length),
  }
}

function table<K extends string | number>(
  deals: readonly MetricsDeal[],
  keyOf: (deal: MetricsDeal) => K,
  labelOf: (key: K) => string,
): MetricsRow[] {
  const groups = new Map<K, MetricsDeal[]>()
  for (const deal of deals) {
    const key = keyOf(deal)
    const rows = groups.get(key)
    if (rows) rows.push(deal)
    else groups.set(key, [deal])
  }
  return [...groups]
    .map(([key, rows]) => metricsRow(String(key), labelOf(key), rows))
    .sort((a, b) => a.label.localeCompare(b.label, 'en-US') || a.key.localeCompare(b.key))
}

function cumulativeRates(booked: readonly boolean[]): number[] {
  let count = 0
  return booked.map((value, index) => {
    if (value) count += 1
    return rate(count, index + 1) ?? 0
  })
}

export function computeMetrics(input: MetricsInput): MetricsDto {
  const inRange = input.deals.filter((deal) => {
    const day = localDate(deal.publishedAt, input.timeZone)
    return day >= input.from && day <= input.to
  })
  const video = [...input.deals]
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    .slice(0, COMPARISON_DEALS)
    .map((deal) => deal.booked)
  const text = [...input.textDeals]
    .sort((a, b) => a.n - b.n)
    .slice(0, COMPARISON_DEALS)
    .map((deal) => deal.meetingBooked)
  const videoRates = cumulativeRates(video)
  const textRates = cumulativeRates(text)
  return {
    from: input.from,
    to: input.to,
    timeZone: input.timeZone,
    byAnalyst: table(inRange, (deal) => deal.analystId, (id) => input.analystNames.get(id) ?? `Analyst ${id}`),
    byCountry: table(inRange, (deal) => deal.country, countryName),
    comparison: Array.from({ length: Math.max(video.length, text.length) }, (_, index) => ({
      n: index + 1,
      video: videoRates[index] ?? null,
      text: textRates[index] ?? null,
    })),
    videoDeals: video.length,
    textDeals: text.length,
  }
}

interface MetricsColumns {
  analyst_id: number
  country: string
  published_at: string
  opened: number
  form_sent: number
  booked: number
  watch_s: number | null
}

function publishedDeals(db: Db): MetricsDeal[] {
  return sql<MetricsColumns>(
    db,
    `SELECT analyst_id, country, published_at,
       (first_open_at IS NOT NULL OR COALESCE(json_extract(analytics, '$.opens'), 0) > 0) AS opened,
       (form_sent_at IS NOT NULL) AS form_sent,
       (booked_at IS NOT NULL OR meeting_at IS NOT NULL) AS booked,
       json_extract(analytics, '$.totalWatchS') AS watch_s
     FROM deals WHERE published_at IS NOT NULL ORDER BY published_at, id`,
  )
    .all()
    .map((row) => ({
      analystId: row.analyst_id,
      country: row.country,
      publishedAt: row.published_at,
      opened: row.opened === 1,
      formSent: row.form_sent === 1,
      booked: row.booked === 1,
      watchS: typeof row.watch_s === 'number' && Number.isFinite(row.watch_s) ? row.watch_s : 0,
    }))
}

export async function readTextSequence(file: string = path.join(env.seedDir, 'text-sequence.json')): Promise<TextSequenceDeal[]> {
  try {
    return textSequenceSchema.parse(JSON.parse(await readFile(file, 'utf8'))).deals
  } catch (error) {
    log.warn('the text sequence for the Metrics chart could not be read, the chart shows the video sequence only', {
      file,
      error,
    })
    return []
  }
}

export async function metricsDto(db: Db, range: { from: string; to: string; timeZone: string }): Promise<MetricsDto> {
  return computeMetrics({
    ...range,
    deals: publishedDeals(db),
    textDeals: await readTextSequence(),
    analystNames: new Map(listAnalysts(db).map((analyst) => [analyst.id, analyst.name])),
  })
}
