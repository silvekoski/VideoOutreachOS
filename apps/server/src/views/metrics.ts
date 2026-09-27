import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { SALE_TIMINGS, SIGNAL_KEYS, SLIDES, countryTimeZone } from '@mergero/shared'
import type {
  ActionRate,
  ChannelRow,
  ComparisonPoint,
  DealAnalytics,
  FollowUpRow,
  InterestLevel,
  InterestRow,
  MetricsDto,
  MetricsRow,
  RateBand,
  SaleTiming,
  SaleTimingRow,
  SignalKey,
  SignalLiftRow,
  TimingPoint,
  WatchBucket,
} from '@mergero/shared'
import { z } from 'zod'
import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { listAnalysts } from '../domain/analysts.ts'
import { dealEngagement } from '../domain/brief-data.ts'
import { listDeals } from '../domain/deals.ts'
import { env } from '../env.ts'
import { log } from '../log.ts'
import { addDaysToDate, localDate } from './dates.ts'

export const COMPARISON_DEALS = 100

const INTEREST_LEVELS: readonly InterestLevel[] = ['high', 'medium', 'low']
const TASK_TYPES: readonly FollowUpRow['type'][] = ['call', 'second_channel']
const Z_95 = 1.96
const HOUR_MS = 3_600_000
const TIMING_STEP_HOURS = 6
const TIMING_MAX_HOURS = 168
const WATCH_BUCKET_EDGES_S = [0, 15, 30, 60, 90, 120, 180]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export interface MetricsDeal {
  analystId: number
  country: string
  publishedAt: string
  firstOpenAt: string | null
  bookedAt: string | null
  opened: boolean
  formSent: boolean
  booked: boolean
  analytics: DealAnalytics | null
  interest: InterestLevel | null
  signals: readonly SignalKey[] | null
  saleTiming: SaleTiming | null
  taskTypes: readonly FollowUpRow['type'][]
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

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function rate(count: number, total: number): number | null {
  return total === 0 ? null : round4(count / total)
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function count(deals: readonly MetricsDeal[], test: (deal: MetricsDeal) => boolean): number {
  return deals.filter(test).length
}

function groupBy<K>(deals: readonly MetricsDeal[], keyOf: (deal: MetricsDeal) => K): Map<K, MetricsDeal[]> {
  const groups = new Map<K, MetricsDeal[]>()
  for (const deal of deals) {
    const key = keyOf(deal)
    const rows = groups.get(key)
    if (rows) rows.push(deal)
    else groups.set(key, [deal])
  }
  return groups
}

function byLabel<T extends { key: string; label: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'en-US') || a.key.localeCompare(b.key))
}

function metricsRow(key: string, label: string, deals: readonly MetricsDeal[]): MetricsRow {
  const opened = deals.filter((deal) => deal.opened)
  return {
    key,
    label,
    linksSent: deals.length,
    openRate: rate(opened.length, deals.length),
    avgWatchS: average(opened.map((deal) => deal.analytics?.totalWatchS ?? 0)),
    formRate: rate(count(deals, (deal) => deal.formSent), deals.length),
    meetingRate: rate(count(deals, (deal) => deal.booked), deals.length),
  }
}

function table<K extends string | number>(
  deals: readonly MetricsDeal[],
  keyOf: (deal: MetricsDeal) => K,
  labelOf: (key: K) => string,
): MetricsRow[] {
  return byLabel([...groupBy(deals, keyOf)].map(([key, rows]) => metricsRow(String(key), labelOf(key), rows)))
}

function channelRow(key: string, label: string, opened: readonly MetricsDeal[]): ChannelRow {
  const cells: ChannelRow['cells'] = {}
  for (const [channel, rows] of groupBy(opened, (deal) => deal.analytics?.firstChannel ?? null)) {
    if (channel !== null) cells[channel] = { opened: rows.length, meetingRate: rate(count(rows, (deal) => deal.booked), rows.length) }
  }
  return { key, label, cells }
}

function channelMatrix(opened: readonly MetricsDeal[]): ChannelRow[] {
  const rows = byLabel([...groupBy(opened, (deal) => deal.country)].map(([code, deals]) => channelRow(code, countryName(code), deals)))
  return opened.length === 0 ? [] : [...rows, channelRow('all', 'All countries', opened)]
}

function retention(opened: readonly MetricsDeal[]): MetricsDto['retention'] {
  const watched = opened.flatMap((deal) => (deal.analytics ? [deal.analytics] : []))
  return {
    opened: watched.length,
    slides: SLIDES.map((slide) => ({
      slide,
      reachRate: rate(watched.filter((a) => a.stopSlide !== null && a.stopSlide >= slide).length, watched.length),
      avgWatchS: average(watched.map((a) => a.perSlide.find((s) => s.slide === slide)?.watchS ?? 0)),
    })),
  }
}

function actions(opened: readonly MetricsDeal[]): MetricsDto['actions'] {
  const share = (test: (analytics: DealAnalytics) => boolean): ActionRate => {
    const deals = count(opened, (deal) => deal.analytics !== null && test(deal.analytics))
    return { deals, rate: rate(deals, opened.length) }
  }
  return {
    opened: opened.length,
    buyerLinkTap: share((a) => a.buyerLinkTaps > 0),
    calculator: share((a) => a.calculatorResults > 0),
    forward: share((a) => a.forwards > 0),
    replayFiguresOrBuyers: share((a) => a.perSlide.some((s) => (s.slide === 4 || s.slide === 5) && s.replays > 0)),
  }
}

function byInterest(opened: readonly MetricsDeal[]): InterestRow[] {
  return INTEREST_LEVELS.map((level) => {
    const deals = opened.filter((deal) => deal.interest === level)
    return { level, deals: deals.length, meetingRate: rate(count(deals, (deal) => deal.booked), deals.length) }
  })
}

function followUp(deals: readonly MetricsDeal[]): FollowUpRow[] {
  return TASK_TYPES.map((type) => {
    const tasked = deals.filter((deal) => deal.taskTypes.includes(type))
    const booked = count(tasked, (deal) => deal.booked)
    return { type, tasks: tasked.length, booked, rate: rate(booked, tasked.length) }
  })
}

function weekStart(date: string): string {
  return addDaysToDate(date, -((new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7))
}

function byWeek(deals: readonly MetricsDeal[], from: string, to: string, timeZone: string): MetricsRow[] {
  const groups = groupBy(deals, (deal) => weekStart(localDate(deal.publishedAt, timeZone)))
  const rows: MetricsRow[] = []
  for (let week = weekStart(from); week <= to; week = addDaysToDate(week, 7)) rows.push(metricsRow(week, week, groups.get(week) ?? []))
  return rows
}

function timing(deals: readonly MetricsDeal[]): TimingPoint[] {
  const hoursAfter = (at: string | null, deal: MetricsDeal) =>
    at === null ? null : (Date.parse(at) - Date.parse(deal.publishedAt)) / HOUR_MS
  const opens = deals.map((deal) => hoursAfter(deal.firstOpenAt, deal))
  const bookings = deals.map((deal) => hoursAfter(deal.bookedAt, deal))
  const within = (values: (number | null)[], hours: number) => values.filter((value) => value !== null && value <= hours).length
  return Array.from({ length: TIMING_MAX_HOURS / TIMING_STEP_HOURS + 1 }, (_, index) => {
    const hours = index * TIMING_STEP_HOURS
    return { hours, opened: rate(within(opens, hours), deals.length), booked: rate(within(bookings, hours), deals.length) }
  })
}

const weekdayHour = new Map<string, Intl.DateTimeFormat>()

function localWeekdayHour(at: string, timeZone: string): [weekday: number, hour: number] {
  let format = weekdayHour.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' })
    weekdayHour.set(timeZone, format)
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(at)).map((part) => [part.type, part.value]))
  return [WEEKDAYS.indexOf(parts.weekday ?? ''), Number(parts.hour)]
}

function openHeatmap(opened: readonly MetricsDeal[]): number[][] {
  const grid = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0))
  for (const deal of opened) {
    if (deal.firstOpenAt === null) continue
    const [weekday, hour] = localWeekdayHour(deal.firstOpenAt, countryTimeZone(deal.country))
    const row = grid[weekday]
    if (row && hour >= 0 && hour < 24) row[hour] = (row[hour] ?? 0) + 1
  }
  return grid
}

function watchHistogram(opened: readonly MetricsDeal[]): WatchBucket[] {
  const watch = opened.flatMap((deal) => (deal.analytics ? [deal.analytics.totalWatchS] : []))
  return WATCH_BUCKET_EDGES_S.map((fromS, index) => {
    const toS = WATCH_BUCKET_EDGES_S[index + 1] ?? null
    return { fromS, toS, deals: watch.filter((s) => s >= fromS && (toS === null || s < toS)).length }
  })
}

function signalLift(opened: readonly MetricsDeal[]): SignalLiftRow[] {
  const known = opened.filter((deal) => deal.signals !== null)
  return SIGNAL_KEYS.map((key) => {
    const [withSignal, without] = [known.filter((deal) => deal.signals?.includes(key)), known.filter((deal) => !deal.signals?.includes(key))]
    return {
      key,
      deals: withSignal.length,
      withRate: rate(count(withSignal, (deal) => deal.booked), withSignal.length),
      withoutRate: rate(count(without, (deal) => deal.booked), without.length),
    }
  })
}

function saleTiming(deals: readonly MetricsDeal[]): SaleTimingRow[] {
  return SALE_TIMINGS.map((timing) => {
    const forms = deals.filter((deal) => deal.saleTiming === timing)
    return { timing, forms: forms.length, meetingRate: rate(count(forms, (deal) => deal.booked), forms.length) }
  })
}

function wilson(successes: number, total: number): RateBand {
  const p = successes / total
  const z2 = Z_95 * Z_95
  const scale = 1 + z2 / total
  const center = (p + z2 / (2 * total)) / scale
  const half = (Z_95 * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / scale
  return [round4(Math.max(0, center - half)), round4(Math.min(1, center + half))]
}

function cumulative(booked: readonly boolean[]): { rate: number; band: RateBand }[] {
  let successes = 0
  return booked.map((value, index) => {
    if (value) successes += 1
    return { rate: round4(successes / (index + 1)), band: wilson(successes, index + 1) }
  })
}

export function computeMetrics(input: MetricsInput): MetricsDto {
  const inRange = input.deals.filter((deal) => {
    const day = localDate(deal.publishedAt, input.timeZone)
    return day >= input.from && day <= input.to
  })
  const opened = inRange.filter((deal) => deal.opened)
  const video = cumulative(
    [...input.deals]
      .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
      .slice(0, COMPARISON_DEALS)
      .map((deal) => deal.booked),
  )
  const text = cumulative(
    [...input.textDeals]
      .sort((a, b) => a.n - b.n)
      .slice(0, COMPARISON_DEALS)
      .map((deal) => deal.meetingBooked),
  )
  const comparison: ComparisonPoint[] = Array.from({ length: Math.max(video.length, text.length) }, (_, index) => ({
    n: index + 1,
    video: video[index]?.rate ?? null,
    text: text[index]?.rate ?? null,
    videoBand: video[index]?.band ?? null,
    textBand: text[index]?.band ?? null,
  }))
  return {
    from: input.from,
    to: input.to,
    timeZone: input.timeZone,
    total: metricsRow('all', 'All links', inRange),
    byAnalyst: table(inRange, (deal) => deal.analystId, (id) => input.analystNames.get(id) ?? `Analyst ${id}`),
    byCountry: table(inRange, (deal) => deal.country, countryName),
    funnel: {
      sent: inRange.length,
      opened: opened.length,
      completed: count(opened, (deal) => deal.analytics?.completed === true),
      formSent: count(inRange, (deal) => deal.formSent),
      booked: count(inRange, (deal) => deal.booked),
    },
    byWeek: byWeek(inRange, input.from, input.to, input.timeZone),
    timing: timing(inRange),
    openHeatmap: openHeatmap(opened),
    watchHistogram: watchHistogram(opened),
    signalLift: signalLift(opened),
    saleTiming: saleTiming(inRange),
    byChannel: channelMatrix(opened),
    retention: retention(opened),
    actions: actions(opened),
    byInterest: byInterest(opened),
    followUp: followUp(inRange),
    comparison,
    videoDeals: video.length,
    textDeals: text.length,
  }
}

function taskTypesByDeal(db: Db): Map<number, FollowUpRow['type'][]> {
  const types = new Map<number, FollowUpRow['type'][]>()
  for (const row of sql<{ deal_id: number; type: FollowUpRow['type'] }>(db, 'SELECT deal_id, type FROM tasks').all()) {
    types.set(row.deal_id, [...(types.get(row.deal_id) ?? []), row.type])
  }
  return types
}

function publishedDeals(db: Db): MetricsDeal[] {
  const tasks = taskTypesByDeal(db)
  return listDeals(db).flatMap((deal) => {
    if (deal.publishedAt === null) return []
    const engagement = dealEngagement(db, deal)
    return {
      analystId: deal.analystId,
      country: deal.country,
      publishedAt: deal.publishedAt,
      firstOpenAt: deal.firstOpenAt,
      bookedAt: deal.bookedAt,
      opened: deal.firstOpenAt !== null || (deal.analytics?.opens ?? 0) > 0,
      formSent: deal.formSentAt !== null,
      booked: deal.bookedAt !== null || deal.meetingAt !== null,
      analytics: deal.analytics,
      interest: engagement?.interest ?? null,
      signals: engagement?.signals ?? null,
      saleTiming: deal.form?.timing ?? deal.analytics?.saleTiming ?? null,
      taskTypes: tasks.get(deal.id) ?? [],
    }
  })
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
