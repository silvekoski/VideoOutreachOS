import { describe, expect, it } from 'vitest'
import { fill, slideLabels, t } from '../src/i18n.ts'
import { SLOT_LIMITS, checkTimelineSlots, labelSlot, textLength } from '../src/slots.ts'
import { LANGUAGES, SLIDE_TEMPLATES } from '../src/types.ts'
import type { Lang, Segment, TemplateName } from '../src/types.ts'
import { timeline } from './fixtures.ts'

const SPEC_KEYS = [
  'who-we-are.headline',
  'who-we-are.buyer-name',
  'who-we-are.deal-text',
  'your-company.company',
  'your-company.line',
  'your-figures.headline',
  'your-figures.ask',
  'buyers.headline',
  'buyers.name',
  'buyers.focus',
  'what-is-possible.headline',
  'what-is-possible.deal-text',
  'privacy.headline',
  'privacy.point',
  'book-meeting.headline',
  'book-meeting.line',
  'facecam.name',
]

function realisticVars(lang: Lang): Record<string, string> {
  return {
    buyerCount: new Intl.NumberFormat(t(lang).locale).format(2200),
    year: '2025',
  }
}

describe('SLOT_LIMITS', () => {
  it('has every key of the contract', () => {
    for (const key of SPEC_KEYS) expect(SLOT_LIMITS[key], key).toBeGreaterThan(0)
  })
})

describe('labelSlot', () => {
  it('maps a label key to its own slot or to the slot of its prefix', () => {
    expect(labelSlot('who-we-are', 'buyers-heading')).toBe('who-we-are.buyers-heading')
    expect(labelSlot('privacy', 'point-2')).toBe('privacy.point')
    expect(labelSlot('your-figures', 'ask-calculator')).toBe('your-figures.ask')
    expect(labelSlot('your-figures', 'fiscal-year')).toBe('your-figures.fiscal-year')
    expect(labelSlot('buyers', 'unknown')).toBeNull()
  })
})

describe('static slide labels', () => {
  const templates = [...new Set(Object.values(SLIDE_TEMPLATES))] as TemplateName[]

  it.each(LANGUAGES)('fit their slots in %s', (lang) => {
    for (const template of templates) {
      for (const [key, label] of Object.entries(slideLabels(lang, template))) {
        const slot = labelSlot(template, key)
        expect(slot, `${template}.${key}`).not.toBeNull()
        const text = fill(label, realisticVars(lang))
        expect(text, `${lang} ${template}.${key}`).not.toMatch(/\{\w+\}/u)
        expect(textLength(text), `${lang} ${template}.${key}: ${text}`).toBeLessThanOrEqual(SLOT_LIMITS[slot as string] as number)
      }
    }
  })
})

describe('checkTimelineSlots', () => {
  it('returns no reason for a timeline within its slots', () => {
    expect(checkTimelineSlots(timeline())).toEqual([])
  })

  it('reports a too long variable text with slide, slot and detail', () => {
    const tl = timeline()
    const segment = tl.segments[4] as Segment
    const buyer = segment.variables.template === 'buyers' ? segment.variables.buyers[0] : undefined
    if (!buyer) throw new Error('fixture has no buyer on slide 5')
    buyer.focus = 'x'.repeat(96)
    expect(checkTimelineSlots(tl)).toEqual([
      { code: 'text_too_long', slide: 5, slot: 'buyers.focus', detail: 'Slide 5, buyer focus: 96 of 80 characters' },
    ])
  })

  it('reports too long labels and company lines', () => {
    const tl = timeline()
    const privacy = tl.segments[6] as Segment
    privacy.labels = { headline: 'Short', 'point-3': 'p'.repeat(91) }
    const company = tl.segments[2] as Segment
    if (company.variables.template !== 'your-company') throw new Error('fixture')
    company.variables.lines = ['ok', 'l'.repeat(95), 'ok']
    const reasons = checkTimelineSlots(tl)
    expect(reasons.map((r) => r.detail)).toEqual([
      'Slide 3, company line: 95 of 90 characters',
      'Slide 7, privacy point: 91 of 90 characters',
    ])
  })

  it('accepts a long DACH company name and analyst names up to the measured scene limits', () => {
    const tl = timeline()
    const facecam = tl.segments[0] as Segment
    const company = tl.segments[2] as Segment
    const meeting = tl.segments[7] as Segment
    if (facecam.variables.template !== 'facecam' || company.variables.template !== 'your-company' || meeting.variables.template !== 'book-meeting') {
      throw new Error('fixture')
    }
    company.variables.company = 'Brenner Hydraulik Maschinenbau und Anlagentechnik GmbH & Co. KG'
    expect(checkTimelineSlots(tl)).toEqual([])
    company.variables.company = 'W'.repeat(95)
    facecam.variables.analystName = 'M'.repeat(44)
    meeting.variables.analystName = 'M'.repeat(44)
    expect(checkTimelineSlots(tl)).toEqual([])
    company.variables.company = 'W'.repeat(96)
    facecam.variables.analystName = 'M'.repeat(45)
    meeting.variables.analystName = 'M'.repeat(45)
    expect(checkTimelineSlots(tl).map((r) => r.detail)).toEqual([
      'Slide 1, analyst name: 45 of 44 characters',
      'Slide 3, company name: 96 of 95 characters',
      'Slide 8, analyst name: 45 of 44 characters',
    ])
  })

  it('counts characters, not UTF-16 units or combining marks', () => {
    expect(textLength('Käufer')).toBe(6)
    expect(textLength('Käufer')).toBe(6)
    expect(textLength('\u{1F600}')).toBe(1)
  })
})
