import { SIGNAL_KEYS, SLIDES, interestLevel } from '@mergero/shared'
import type { Channel, DealAnalytics, FollowUpRow, MetricsDto, SaleTiming, Signal, SignalKey, SlideNumber } from '@mergero/shared'
import { computeMetrics, readTextSequence } from './metrics.ts'
import type { MetricsDeal } from './metrics.ts'

const SEED = 20_260_927
const DEAL_COUNT = 420
const SPAN_DAYS = 180
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const TASK_AFTER_HOURS = 48
const SLIDE_SECONDS: Record<SlideNumber, number> = { 1: 10, 2: 25, 3: 22, 4: 30, 5: 28, 6: 20, 7: 18, 8: 14 }
const NEGATIVE = new Set<SignalKey>(['stopped_early', 'short_watch'])

const ANALYSTS = new Map([
  [1, 'Aino Virtanen'],
  [2, 'Jonas Weber'],
  [3, 'Elsa Lindqvist'],
  [4, 'Mikko Laine'],
])
const ANALYST_SKILL: Record<number, number> = { 1: 1.1, 2: 0.95, 3: 1, 4: 0.85 }

interface CountryProfile {
  weight: number
  open: number
  channels: [Channel, number][]
  best: Channel
  dach: boolean
}

const NORDIC_CHANNELS: [Channel, number][] = [
  ['email', 0.6],
  ['linkedin', 0.25],
  ['sms', 0.1],
  ['whatsapp', 0.05],
]
const DACH_CHANNELS: [Channel, number][] = [
  ['linkedin', 0.45],
  ['email', 0.3],
  ['whatsapp', 0.15],
  ['sms', 0.1],
]

const COUNTRIES: Record<string, CountryProfile> = {
  FI: { weight: 0.3, open: 0.74, channels: NORDIC_CHANNELS, best: 'email', dach: false },
  SE: { weight: 0.12, open: 0.66, channels: NORDIC_CHANNELS, best: 'email', dach: false },
  NO: { weight: 0.06, open: 0.64, channels: NORDIC_CHANNELS, best: 'email', dach: false },
  DK: { weight: 0.06, open: 0.62, channels: NORDIC_CHANNELS, best: 'email', dach: false },
  DE: { weight: 0.28, open: 0.55, channels: DACH_CHANNELS, best: 'linkedin', dach: true },
  AT: { weight: 0.1, open: 0.52, channels: DACH_CHANNELS, best: 'linkedin', dach: true },
  CH: { weight: 0.08, open: 0.5, channels: DACH_CHANNELS, best: 'linkedin', dach: true },
}

const SALE_TIMING_WEIGHTS: [SaleTiming, number][] = [
  ['within_12_months', 0.25],
  ['in_1_3_years', 0.35],
  ['later', 0.25],
  ['not_interested', 0.15],
]
const SALE_TIMING_BOOST: Record<SaleTiming, number> = { within_12_months: 0.45, in_1_3_years: 0.25, later: 0.08, not_interested: 0 }
const STOP_WEIGHTS: [SlideNumber, number][] = [
  [1, 0.08],
  [2, 0.2],
  [3, 0.18],
  [4, 0.12],
  [5, 0.12],
  [6, 0.18],
  [7, 0.12],
]
const OPEN_HOURS: [number, number][] = [
  [7, 0.12],
  [8, 0.16],
  [9, 0.12],
  [12, 0.12],
  [13, 0.08],
  [16, 0.08],
  [19, 0.12],
  [20, 0.12],
  [21, 0.08],
]

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function pick<T>(next: () => number, weights: readonly [T, number][]): T {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = next() * total
  for (const [value, weight] of weights) {
    roll -= weight
    if (roll <= 0) return value
  }
  return weights[weights.length - 1]![0]
}

function analytics(next: () => number, channel: Channel, dach: boolean) {
  const completed = next() < 0.35
  const stopSlide: SlideNumber = completed ? 8 : pick(next, STOP_WEIGHTS)
  const replayed = stopSlide >= 5 && next() < 0.25
  const perSlide = SLIDES.map((slide) => {
    const full = SLIDE_SECONDS[slide]
    const watchS = slide < stopSlide || completed ? full : slide === stopSlide ? Math.round(full * next() * 10) / 10 : 0
    const replays = replayed && (slide === 4 || slide === 5) ? 1 : 0
    return { slide, watchS: watchS * (1 + replays), replays }
  })
  const totalWatchS = Math.round(perSlide.reduce((sum, s) => sum + s.watchS, 0) * 10) / 10
  const buyerLinkTaps = stopSlide >= 5 && next() < 0.3 ? 1 + Math.floor(next() * 3) : 0
  const calculatorResults = dach && stopSlide >= 4 && next() < 0.35 ? 1 : 0
  const forwards = next() < 0.08 ? 1 : 0
  const days = next() < 0.2 ? 2 : 1
  const result: DealAnalytics = {
    opens: days + (next() < 0.3 ? 1 : 0),
    sessions: days,
    totalWatchS,
    perSlide,
    stopSlide,
    replays: perSlide.reduce((sum, s) => sum + s.replays, 0),
    completed,
    days,
    lastEventId: null,
    channel,
    firstChannel: channel,
    buyerLinkTaps,
    calculatorResults,
    forwards,
  }
  return result
}

function signalsOf(a: DealAnalytics, form: { exact: boolean; custom: boolean } | null): SignalKey[] {
  const has: Record<SignalKey, boolean> = {
    watched_to_end: a.completed,
    replayed_figures_or_buyers: a.replays > 0,
    tapped_buyer_link: a.buyerLinkTaps > 0,
    used_calculator: a.calculatorResults > 0,
    gave_exact_figures: form?.exact ?? false,
    forwarded_link: a.forwards > 0,
    came_back: a.days > 1,
    answered_custom_questions: form?.custom ?? false,
    stopped_early: a.stopSlide !== null && a.stopSlide < 4,
    short_watch: a.totalWatchS < 30,
  }
  return SIGNAL_KEYS.filter((key) => has[key])
}

function openTime(next: () => number, sentAt: number): number {
  const delayH = Math.min(7 * 24, -Math.log(1 - next()) * 22)
  const day = new Date(sentAt + delayH * HOUR_MS)
  day.setUTCHours(pick(next, OPEN_HOURS) - 3, Math.floor(next() * 60), 0, 0)
  return day.getTime() > sentAt ? day.getTime() : day.getTime() + DAY_MS
}

function asSignal(key: SignalKey): Signal {
  return { key, type: NEGATIVE.has(key) ? 'negative' : 'positive', evidenceEventId: null, evidenceText: null, evidenceEvent: null }
}

function engagement(next: () => number, sentAt: number, openAt: number, channel: Channel, profile: CountryProfile, skill: number) {
  const a = analytics(next, channel, profile.dach)
  const actions = (a.buyerLinkTaps > 0 ? 1 : 0) + (a.calculatorResults > 0 ? 1 : 0) + (a.replays > 0 ? 1 : 0)
  const formSent = next() < 0.12 + (a.completed ? 0.25 : 0) + actions * 0.1
  const saleTiming = formSent ? pick(next, SALE_TIMING_WEIGHTS) : null
  const signals = signalsOf(a, formSent ? { exact: next() < 0.4, custom: next() < 0.3 } : null)
  const chance =
    (0.05 +
      (a.completed ? 0.1 : 0) +
      actions * 0.09 +
      (saleTiming ? SALE_TIMING_BOOST[saleTiming] : 0) +
      (channel === profile.best ? 0.05 : 0) -
      (a.totalWatchS < 30 ? 0.03 : 0)) *
    skill
  const bookedAt = next() < chance ? openAt + (2 + next() * 94) * HOUR_MS : null
  const tasks: FollowUpRow['type'][] = openAt - sentAt > TASK_AFTER_HOURS * HOUR_MS ? ['call'] : []
  if (bookedAt === null || bookedAt - openAt > TASK_AFTER_HOURS * HOUR_MS) tasks.push('second_channel')
  return {
    analytics: a,
    formSent,
    saleTiming,
    signals,
    interest: interestLevel(signals.map(asSignal)),
    booked: bookedAt !== null,
    bookedAt: bookedAt === null ? null : new Date(bookedAt).toISOString(),
    taskTypes: tasks,
  }
}

export function mockMetricsDeals(now: Date): MetricsDeal[] {
  const next = random(SEED)
  const countryWeights = Object.entries(COUNTRIES).map(([code, profile]) => [code, profile.weight] as [string, number])
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Array.from({ length: DEAL_COUNT }, () => {
    const country = pick(next, countryWeights)
    const profile = COUNTRIES[country]!
    const analystId = 1 + Math.floor(next() * ANALYSTS.size)
    const skill = ANALYST_SKILL[analystId] ?? 1
    const day = end - Math.floor(next() * SPAN_DAYS) * DAY_MS
    const sentAt = day + (6 + Math.floor(next() * 9)) * HOUR_MS
    const channel = pick(next, profile.channels)
    const openAt = next() < profile.open * skill ? openTime(next, sentAt) : null
    const base = {
      analystId,
      country,
      publishedAt: new Date(sentAt).toISOString(),
      firstOpenAt: openAt === null ? null : new Date(openAt).toISOString(),
      opened: openAt !== null,
    }
    if (openAt === null) {
      return {
        ...base,
        bookedAt: null,
        formSent: false,
        booked: false,
        analytics: null,
        interest: null,
        signals: null,
        saleTiming: null,
        taskTypes: ['call'],
      }
    }
    return { ...base, ...engagement(next, sentAt, openAt, channel, profile, skill) }
  })
}

export async function mockMetricsDto(range: { from: string; to: string; timeZone: string }, now: Date): Promise<MetricsDto> {
  return computeMetrics({ ...range, deals: mockMetricsDeals(now), textDeals: await readTextSequence(), analystNames: ANALYSTS })
}
