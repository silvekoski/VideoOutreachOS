import type { MeetingBrief } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { buildBriefData, lastOwnerEventId, newestBrief, saveBrief } from '../../src/domain/brief-data.ts'
import { updateDeal } from '../../src/domain/deals.ts'
import { DomainError } from '../../src/domain/errors.ts'
import { addDealEvent, listEvents } from '../../src/domain/events.ts'
import { createVersion, markRenderStatus, setSlideTimes } from '../../src/domain/timelines.ts'
import { jobsForDeal } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, SLIDE_TIMES, T0, insertAnalyst, insertDeal, later, makeTimeline } from './fixtures.ts'

let t: TempDb
const MEETING = '2026-10-01T07:00:00.000Z'

beforeEach(() => {
  t = tempDb()
  insertAnalyst(t.db)
})

afterEach(() => {
  t.close()
})

function session(id: string, day: string, channel: string, device: string): void {
  sql(
    t.db,
    `INSERT INTO sessions (id, deal_id, version, started_at, last_seen_at, local_day, channel, device, browser, os, screen)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'Chrome', 'Android', '412x915')`,
  ).run(id, DEAL_ID, `${day}T08:00:00.000Z`, `${day}T08:10:00.000Z`, day, channel, device)
}

function events(sessionId: string, specs: [type: string, slide: number | null, vt: number | null, data?: object][]): number[] {
  return specs.map(([type, slide, vt, data], seq) =>
    Number(
      sql(
        t.db,
        `INSERT INTO events (deal_id, session_id, seq, type, slide, video_time, channel, at, data)
         VALUES (?, ?, ?, ?, ?, ?, (SELECT channel FROM sessions WHERE id = ?), ?, ?)`,
      ).run(DEAL_ID, sessionId, seq, type, slide, vt, sessionId, T0.toISOString(), JSON.stringify(data ?? {})).lastInsertRowid,
    ),
  )
}

function seed(): void {
  insertDeal(t.db, {
    patch: {
      status: 'meeting_booked',
      publishedVersion: 1,
      publishedAt: T0.toISOString(),
      meetingAt: MEETING,
      customQuestions: [
        { id: 'q1', text: 'When would you like to retire?' },
        { id: 'q2', text: 'Who else decides?' },
      ],
      financials: { source: 'asiakastieto', revenue: 4_200_000, profit: 610_000, fiscalYear: 2025 },
      form: {
        revenue: { kind: 'range', min: 1_000_000, max: 3_000_000 },
        profit: { kind: 'exact', value: 400_000 },
        staff: '20-49',
        timing: 'within_12_months',
        notInterestedReason: null,
        custom: [
          { questionId: 'q1', question: 'When would you like to retire?', answer: 'In 2030.' },
          { questionId: 'old', question: 'A removed question?', answer: 'Still answered.' },
        ],
        message: 'Call me in the morning.',
        submittedAt: T0.toISOString(),
      },
      valuation: { available: true, low: 1_600_000, high: 2_400_000, p25: 4, p75: 6, dealCount: 5, nace2: '25' },
    },
  })
  createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { audio: 'ok' }), T0)
  setSlideTimes(t.db, DEAL_ID, 1, SLIDE_TIMES)
  markRenderStatus(t.db, DEAL_ID, 1, 'rendered', T0)
  createVersion(t.db, DEAL_ID, makeTimeline(DEAL_ID, { lines: ['New line one.', 'New line two.'] }), later(5))

  session('s1', '2026-09-26', 'email', 'mobile')
  events('s1', [
    ['open', null, null],
    ['play', 1, 0],
    ['slide_start', 1, 0],
    ['pause', 3, 50],
  ])
  session('s2', '2026-09-27', 'whatsapp', 'desktop')
  events('s2', [
    ['open', null, null],
    ['play', 3, 50],
    ['buyer_link_tap', 5, 70, { buyerId: 'b2' }],
    ['calculator_result', null, null, { low: 1_600_000 }],
    ['complete', 8, 118],
  ])
  addDealEvent(t.db, DEAL_ID, 'form_sent', {}, later(1))
  addDealEvent(t.db, DEAL_ID, 'meeting_booked', { meetingAt: MEETING }, later(2))
}

describe('buildBriefData', () => {
  it('fills each data section from the stored data', () => {
    seed()
    const brief = buildBriefData(t.db, DEAL_ID, later(10))
    expect(brief.version).toBe(1)
    expect(brief.language).toBe('en')
    expect(brief.writtenAt).toBe(later(10).toISOString())
    expect(brief.header).toEqual({
      company: 'Acme Oy',
      owner: 'Matti Meikäläinen',
      ownerRole: 'CEO',
      meetingAt: MEETING,
      timeZone: 'Europe/Helsinki',
      language: 'fi',
      interest: 'high',
      summary: null,
    })
    expect(brief.company).toEqual({ lines: ['New line one.', 'New line two.'], country: 'FI', nace: '25.62', staffCount: 46 })
    expect(brief.figures).toEqual({
      revenue: { type: 'range', min: 1_000_000, max: 3_000_000, value: null, source: 'form', fiscalYear: null },
      profit: { type: 'exact', min: null, max: null, value: 400_000, source: 'form', fiscalYear: null },
      valuation: { type: 'range', min: 1_600_000, max: 2_400_000, value: null, source: 'calculator', fiscalYear: null },
    })
    expect(brief.engagement).toMatchObject({
      opens: 2,
      sessions: 2,
      totalWatchS: 118,
      stopSlide: 8,
      replays: 0,
      channels: [
        { channel: 'email', device: 'mobile' },
        { channel: 'whatsapp', device: 'desktop' },
      ],
    })
    expect(brief.engagement.perSlide).toHaveLength(8)
    expect(brief.signals.map((signal) => signal.key)).toEqual([
      'watched_to_end',
      'tapped_buyer_link',
      'used_calculator',
      'gave_exact_figures',
      'came_back',
      'answered_custom_questions',
    ])
    const evidence = Object.fromEntries(brief.signals.map((signal) => [signal.key, signal.evidenceEvent]))
    expect(evidence).toEqual({
      watched_to_end: { type: 'complete', at: T0.toISOString(), slide: 8, channel: 'whatsapp' },
      tapped_buyer_link: { type: 'buyer_link_tap', at: T0.toISOString(), slide: 5, channel: 'whatsapp' },
      used_calculator: { type: 'calculator_result', at: T0.toISOString(), slide: null, channel: 'whatsapp' },
      gave_exact_figures: { type: 'form_sent', at: later(1).toISOString(), slide: null, channel: null },
      came_back: { type: 'open', at: T0.toISOString(), slide: null, channel: 'whatsapp' },
      answered_custom_questions: { type: 'form_sent', at: later(1).toISOString(), slide: null, channel: null },
    })
    expect(brief.form?.answers.map((answer) => answer.key)).toEqual(['revenue', 'profit', 'staff', 'timing', 'message'])
    expect(brief.form?.answers.find((answer) => answer.key === 'message')?.value).toBe('Call me in the morning.')
    expect(brief.form?.custom).toEqual([
      { question: 'When would you like to retire?', answer: 'In 2030.' },
      { question: 'Who else decides?', answer: '' },
      { question: 'A removed question?', answer: 'Still answered.' },
    ])
    expect(brief.customQuestions).toEqual([
      { question: 'When would you like to retire?', answer: 'In 2030.' },
      { question: 'Who else decides?', answer: null },
      { question: 'A removed question?', answer: 'Still answered.' },
    ])
    expect(brief.buyers).toEqual([
      { id: 'b1', name: 'Nordic Industrial Partners', website: 'https://nip.test', tapped: false },
      { id: 'b2', name: 'Baltic Growth Fund', website: null, tapped: true },
      { id: 'b3', name: 'Helsinki Holding', website: 'https://hh.test', tapped: false },
    ])
    expect('questions' in brief).toBe(false)
  })

  it('uses the Asiakastieto figures when the form has none, and writes values in the brief language', () => {
    seed()
    updateDeal(t.db, DEAL_ID, { form: null, valuation: null }, T0)
    sql(t.db, `UPDATE analysts SET brief_language = 'de', time_zone = 'Europe/Berlin'`).run()
    const brief = buildBriefData(t.db, DEAL_ID, later(10))
    expect(brief.language).toBe('de')
    expect(brief.header.timeZone).toBe('Europe/Berlin')
    expect(brief.figures).toEqual({
      revenue: { type: 'exact', min: null, max: null, value: 4_200_000, source: 'asiakastieto', fiscalYear: 2025 },
      profit: { type: 'exact', min: null, max: null, value: 610_000, source: 'asiakastieto', fiscalYear: 2025 },
      valuation: null,
    })
    expect(brief.form).toBeNull()
    expect(brief.customQuestions).toEqual([
      { question: 'When would you like to retire?', answer: null },
      { question: 'Who else decides?', answer: null },
    ])
  })

  it('needs a booked meeting', () => {
    insertDeal(t.db)
    expect(() => buildBriefData(t.db, DEAL_ID)).toThrow(DomainError)
  })
})

describe('briefs', () => {
  it('finds the last owner event and saves numbered versions with an event and a Pipedrive note job', () => {
    seed()
    const lastId = lastOwnerEventId(t.db, DEAL_ID)
    expect(lastId).toBe(listEvents(t.db, DEAL_ID, { types: ['meeting_booked'] })[0]?.id)
    addDealEvent(t.db, DEAL_ID, 'task_created', {}, later(3))
    expect(lastOwnerEventId(t.db, DEAL_ID)).toBe(lastId)

    const data = buildBriefData(t.db, DEAL_ID, later(10))
    const brief: MeetingBrief = { ...data, header: { ...data.header, summary: 'A short summary.' }, questions: ['Q1?', 'Q2?', 'Q3?'] }
    const saved = saveBrief(t.db, DEAL_ID, brief, lastId ?? 0, later(10))
    expect(saved).toMatchObject({ dealId: DEAL_ID, version: 1, lastEventId: lastId, language: 'en', brief: { questions: ['Q1?', 'Q2?', 'Q3?'] } })
    expect(newestBrief(t.db, DEAL_ID)?.id).toBe(saved.id)
    expect(listEvents(t.db, DEAL_ID, { types: ['brief_written'] })[0]?.data).toEqual({ briefId: saved.id, version: 1 })
    expect(jobsForDeal(t.db, DEAL_ID, ['pipedrive-write']).map((job) => job.payload)).toEqual([
      { dealId: DEAL_ID, op: 'note', briefId: saved.id },
    ])
    expect(buildBriefData(t.db, DEAL_ID, later(20)).version).toBe(2)
    expect(saveBrief(t.db, DEAL_ID, brief, lastId ?? 0, later(20)).version).toBe(2)
  })
})
