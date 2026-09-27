import { computeSignals, countryTimeZone, formatAmount, interestLevel, t } from '@mergero/shared'
import type { Amount, DealAnalytics, FigureValue, FormAnswers, Lang, MeetingBrief, StoredEvent, Timeline } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { toBriefRow } from '../db/rows.ts'
import type { BriefColumns, BriefRow, DealRow } from '../db/rows.ts'
import { enqueue, jobKeys } from '../queue/index.ts'
import { log } from '../log.ts'
import { storedDealAnalytics } from './analytics.ts'
import { getAnalyst } from './analysts.ts'
import { requireDeal } from './deals.ts'
import { DomainError } from './errors.ts'
import { addDealEvent, listEvents, listSessions } from './events.ts'
import { companyLines } from './pipeline.ts'
import { getTimeline, newestTimeline } from './timelines.ts'

export type BriefData = Omit<MeetingBrief, 'questions'>

const EMPTY_ANALYTICS: DealAnalytics = {
  opens: 0,
  sessions: 0,
  totalWatchS: 0,
  perSlide: [],
  stopSlide: null,
  replays: 0,
  completed: false,
  days: 0,
  lastEventId: null,
  channel: null,
}

export function newestBrief(db: Db, dealId: number): BriefRow | null {
  const row = sql<BriefColumns>(db, 'SELECT * FROM briefs WHERE deal_id = ? ORDER BY version DESC LIMIT 1').get(dealId)
  return row ? toBriefRow(row) : null
}

export function lastOwnerEventId(db: Db, dealId: number): number | null {
  return (
    sql<{ id: number | null }>(
      db,
      `SELECT MAX(id) AS id FROM events WHERE deal_id = ? AND (session_id IS NOT NULL OR type IN ('form_sent', 'meeting_booked'))`,
    ).get(dealId)?.id ?? null
  )
}

function amountFigure(amount: Amount): FigureValue {
  return amount.kind === 'exact'
    ? { type: 'exact', min: null, max: null, value: amount.value, source: 'form', fiscalYear: null }
    : { type: 'range', min: amount.min, max: amount.max, value: null, source: 'form', fiscalYear: null }
}

function figures(deal: DealRow): MeetingBrief['figures'] {
  const official = deal.financials?.source === 'asiakastieto' ? deal.financials : null
  const figure = (amount: Amount | null | undefined, value: number | undefined): FigureValue | null => {
    if (amount) return amountFigure(amount)
    if (official && value !== undefined) {
      return { type: 'exact', min: null, max: null, value, source: 'asiakastieto', fiscalYear: official.fiscalYear }
    }
    return null
  }
  const valuation = deal.valuation?.available
    ? { type: 'range' as const, min: deal.valuation.low, max: deal.valuation.high, value: null, source: 'calculator' as const, fiscalYear: null }
    : null
  return {
    revenue: figure(deal.form?.revenue, official?.revenue),
    profit: figure(deal.form?.profit, official?.profit),
    valuation,
  }
}

function customQuestions(deal: DealRow): MeetingBrief['customQuestions'] {
  const custom = deal.form?.custom ?? []
  const asked = new Set(deal.customQuestions.map((question) => question.id))
  const answer = (text: string | undefined) => (text?.trim() ? text : null)
  return [
    ...deal.customQuestions.map((question) => ({
      question: question.text,
      answer: answer(custom.find((item) => item.questionId === question.id)?.answer),
    })),
    ...custom.filter((item) => !asked.has(item.questionId)).map((item) => ({ question: item.question, answer: answer(item.answer) })),
  ]
}

function formSection(deal: DealRow, lang: Lang, custom: MeetingBrief['customQuestions']): MeetingBrief['form'] {
  const form: FormAnswers | null = deal.form
  if (!form) return null
  const strings = t(lang)
  const answers: [string, string | null][] = [
    ['revenue', form.revenue ? formatAmount(form.revenue, lang) : null],
    ['profit', form.profit ? formatAmount(form.profit, lang) : null],
    ['staff', form.staff ? strings.staff[form.staff] : null],
    ['timing', form.timing ? strings.timing[form.timing] : null],
    ['notInterestedReason', form.notInterestedReason],
    ['message', form.message],
  ]
  return {
    answers: answers
      .filter((entry): entry is [string, string] => entry[1] !== null && entry[1].trim() !== '')
      .map(([key, value]) => ({ key, value })),
    custom: custom.map((item) => ({ question: item.question, answer: item.answer ?? '' })),
  }
}

function buyers(timeline: Timeline | undefined, events: readonly StoredEvent[]): MeetingBrief['buyers'] {
  const variables = timeline?.segments.find((segment) => segment.slide === 5)?.variables
  if (variables?.template !== 'buyers') return []
  const tapped = new Set(
    events.filter((event) => event.type === 'buyer_link_tap').map((event) => event.data.buyerId),
  )
  return variables.buyers.map((buyer) => ({ id: buyer.id, name: buyer.name, website: buyer.website, tapped: tapped.has(buyer.id) }))
}

function briefAnalytics(db: Db, deal: DealRow): DealAnalytics {
  if (deal.publishedVersion === null) return deal.analytics ?? EMPTY_ANALYTICS
  try {
    return storedDealAnalytics(db, deal.id, deal.publishedVersion)
  } catch (error) {
    log.warn('brief analytics from the stored deal numbers', { dealId: deal.id, error })
    return deal.analytics ?? EMPTY_ANALYTICS
  }
}

export function buildBriefData(db: Db, dealId: number, now: Date = new Date()): BriefData {
  const deal = requireDeal(db, dealId)
  if (deal.meetingAt === null) throw new DomainError(409, `Deal ${dealId} has no booked meeting`)
  const analyst = getAnalyst(db, deal.analystId)
  const lang = analyst?.briefLanguage ?? 'en'
  const published = getTimeline(db, dealId, deal.publishedVersion)?.timeline
  const sessions = listSessions(db, dealId)
  const events = listEvents(db, dealId)
  const analytics = briefAnalytics(db, deal)
  const signals = computeSignals({
    analytics,
    events,
    form: deal.form,
    sessionDays: sessions.map((session) => ({ sessionId: session.id, localDay: session.localDay })),
  })
  const { snapshot } = deal
  const custom = customQuestions(deal)
  return {
    version: (newestBrief(db, dealId)?.version ?? 0) + 1,
    language: lang,
    writtenAt: nowIso(now),
    header: {
      company: snapshot.company,
      owner: snapshot.ownerName,
      ownerRole: snapshot.ownerRole,
      meetingAt: deal.meetingAt,
      timeZone: analyst?.timeZone ?? countryTimeZone(deal.country),
      language: deal.language,
      interest: interestLevel(signals),
      summary: null,
    },
    company: {
      lines: companyLines(newestTimeline(db, dealId)?.timeline),
      country: deal.country,
      nace: snapshot.nace,
      staffCount: snapshot.staffCount,
    },
    figures: figures(deal),
    engagement: {
      opens: analytics.opens,
      sessions: analytics.sessions,
      totalWatchS: analytics.totalWatchS,
      perSlide: analytics.perSlide,
      stopSlide: analytics.stopSlide,
      replays: analytics.replays,
      channels: sessions.map((session) => ({ channel: session.channel, device: session.device })),
    },
    signals,
    form: formSection(deal, lang, custom),
    customQuestions: custom,
    buyers: buyers(published, events),
  }
}

export function saveBrief(db: Db, dealId: number, brief: MeetingBrief, lastEventId: number, now: Date = new Date()): BriefRow {
  return transaction(db, () => {
    requireDeal(db, dealId)
    const version = (newestBrief(db, dealId)?.version ?? 0) + 1
    const row = sql<BriefColumns>(
      db,
      'INSERT INTO briefs (deal_id, version, last_event_id, language, json, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
    ).get(dealId, version, lastEventId, brief.language, JSON.stringify({ ...brief, version }), nowIso(now))
    if (!row) throw new Error(`The meeting brief of deal ${dealId} was not stored`)
    const saved = toBriefRow(row)
    addDealEvent(db, dealId, 'brief_written', { briefId: saved.id, version }, now)
    enqueue(db, 'pipedrive-write', jobKeys.pipedriveWrite(dealId, 'note', saved.id), { dealId, op: 'note', briefId: saved.id }, { now })
    return saved
  })
}
