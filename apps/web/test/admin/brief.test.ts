import type { MeetingBrief, Signal } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import { describe, expect, it, vi } from 'vitest'
import {
  answerLabel,
  answerValue,
  displayName,
  figureAmount,
  figureText,
  hasSectionData,
  reportBriefRead,
  signalEvidence,
} from '../../src/admin/lib/brief'

const brief: MeetingBrief = {
  version: 1,
  language: 'en',
  writtenAt: '2026-09-26T08:00:00.000Z',
  header: {
    company: 'Oy Example Ab',
    owner: 'Matti Meikäläinen',
    ownerRole: 'CEO',
    meetingAt: '2026-09-26T11:00:00.000Z',
    timeZone: 'Europe/Helsinki',
    language: 'fi',
    interest: 'medium',
    summary: null,
  },
  company: { lines: [], country: 'FI', nace: null, staffCount: null },
  figures: { revenue: null, profit: null, valuation: null },
  engagement: { opens: 0, sessions: 0, totalWatchS: 0, perSlide: [], stopSlide: null, replays: 0, channels: [] },
  signals: [],
  form: null,
  customQuestions: [],
  buyers: [],
  questions: null,
}

describe('reportBriefRead', () => {
  it('reports once per mount and version, and again on the next mount', () => {
    const send = vi.fn()
    const firstMount = { current: null }
    reportBriefRead(firstMount, '4007:1', send)
    reportBriefRead(firstMount, '4007:1', send)
    expect(send).toHaveBeenCalledTimes(1)

    const secondMount = { current: null }
    reportBriefRead(secondMount, '4007:1', send)
    expect(send).toHaveBeenCalledTimes(2)

    reportBriefRead(secondMount, '4007:2', send)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('reports again after a failed request', () => {
    const errors: (() => void)[] = []
    const reported = { current: null }
    reportBriefRead(reported, '4007:1', (onError) => errors.push(onError))
    errors[0]?.()
    reportBriefRead(reported, '4007:1', (onError) => errors.push(onError))
    expect(errors).toHaveLength(2)
  })
})

describe('figureAmount', () => {
  it('keeps an exact value as exact', () => {
    expect(
      figureAmount({ type: 'exact', min: null, max: null, value: 1_500_000, source: 'form', fiscalYear: null }),
    ).toEqual({ kind: 'exact', value: 1_500_000 })
  })

  it('treats an exact value without a number as a range', () => {
    expect(figureAmount({ type: 'exact', min: 1, max: 2, value: null, source: 'form', fiscalYear: null })).toEqual({
      kind: 'range',
      min: 1,
      max: 2,
    })
  })
})

describe('figureText', () => {
  it('shows No data in the brief language for a missing figure', () => {
    expect(figureText(null, 'en')).toBe(t('en').brief.noData)
    expect(figureText(null, 'fi')).toBe(t('fi').brief.noData)
  })

  it('shows an exact figure in full, not rounded', () => {
    const exact = { type: 'exact', min: null, max: null, value: 1_450_000, source: 'asiakastieto', fiscalYear: 2025 } as const
    expect(figureText(exact, 'en')).toBe('€1,450,000')
  })

  it('formats a range', () => {
    const text = figureText(
      { type: 'range', min: 1_000_000, max: 3_000_000, value: null, source: 'form', fiscalYear: null },
      'en',
    )
    expect(text).toContain('1')
    expect(text).toContain('3')
  })
})

describe('form answers', () => {
  const en = t('en')

  it('labels the known keys in the brief language', () => {
    expect(answerLabel('timing', en)).toBe(en.brief.fields.timing)
    expect(answerLabel('staff', t('de'))).toBe(t('de').brief.fields.staff)
    expect(answerLabel('custom-key', en)).toBe('custom-key')
  })

  it('translates the fixed choices and keeps free text as written', () => {
    expect(answerValue('timing', 'within_12_months', en)).toBe(en.timing.within_12_months)
    expect(answerValue('staff', '20-49', en)).toBe(en.staff['20-49'])
    expect(answerValue('message', 'Soittakaa ensi viikolla', en)).toBe('Soittakaa ensi viikolla')
  })
})

describe('hasSectionData', () => {
  it('finds the empty sections', () => {
    expect(hasSectionData(brief, 'header')).toBe(true)
    expect(hasSectionData(brief, 'company')).toBe(true)
    expect(hasSectionData(brief, 'figures')).toBe(false)
    expect(hasSectionData(brief, 'engagement')).toBe(false)
    expect(hasSectionData(brief, 'signals')).toBe(false)
    expect(hasSectionData(brief, 'form')).toBe(false)
    expect(hasSectionData(brief, 'buyers')).toBe(false)
    expect(hasSectionData(brief, 'questions')).toBe(false)
  })

  it('finds a section with data', () => {
    expect(hasSectionData({ ...brief, questions: ['Why now?'] }, 'questions')).toBe(true)
    expect(hasSectionData({ ...brief, form: { answers: [{ key: 'staff', value: '20-49' }], custom: [] } }, 'form')).toBe(true)
  })
})

describe('displayName', () => {
  it('names a language and a region, and falls back to the code', () => {
    expect(displayName('en-US', 'language', 'fi')).toBe('Finnish')
    expect(displayName('en-US', 'region', 'DE')).toBe('Germany')
    expect(displayName('en-US', 'region', '??')).toBe('??')
  })
})

describe('signalEvidence', () => {
  const en = t('en')
  const signal = (overrides: Partial<Signal>): Signal => ({
    key: 'watched_to_end',
    type: 'positive',
    evidenceEventId: null,
    evidenceText: null,
    evidenceEvent: null,
    ...overrides,
  })

  it('names the event, the time in the brief time zone and the channel', () => {
    const complete = signal({
      evidenceEventId: 25,
      evidenceEvent: { type: 'complete', at: '2026-09-26T20:35:00.000Z', slide: 8, channel: 'whatsapp' },
    })
    expect(signalEvidence(complete, en, 'Europe/Helsinki')).toBe('Complete, 2026-09-26 23:35, WhatsApp')
    expect(signalEvidence(complete, en, 'Europe/Berlin')).toBe('Complete, 2026-09-26 22:35, WhatsApp')
  })

  it('adds the slide and leaves out a missing channel, in the brief language', () => {
    const replay = signal({
      key: 'replayed_figures_or_buyers',
      evidenceEvent: { type: 'slide_start', at: '2026-09-26T20:31:00.000Z', slide: 5, channel: 'email' },
    })
    expect(signalEvidence(replay, en, 'Europe/Helsinki')).toBe('Slide start, 2026-09-26 23:31, Slide 5, Email')
    const form = signal({
      key: 'gave_exact_figures',
      evidenceEvent: { type: 'form_sent', at: '2026-09-26T20:40:00.000Z', slide: null, channel: null },
    })
    expect(signalEvidence(form, t('fi'), 'Europe/Helsinki')).toBe(`${t('fi').brief.events.form_sent}, 2026-09-26 23:40`)
  })

  it('writes the computed text in words and returns null without evidence', () => {
    expect(signalEvidence(signal({ key: 'stopped_early', evidenceText: '3' }), en, 'UTC')).toBe('Slide 3')
    expect(signalEvidence(signal({ key: 'replayed_figures_or_buyers', evidenceText: '4, 5' }), en, 'UTC')).toBe('Slide 4, Slide 5')
    expect(signalEvidence(signal({ key: 'came_back', evidenceText: '2026-09-25, 2026-09-26' }), en, 'UTC')).toBe(
      '2026-09-25, 2026-09-26',
    )
    expect(signalEvidence(signal({}), en, 'UTC')).toBeNull()
  })
})
