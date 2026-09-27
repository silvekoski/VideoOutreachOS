import type { ReviewReason, Segment, TemplateName, Timeline } from './types.ts'

export const MIN_COMPANY_LINES = 2

const SLOTS: Record<string, { max: number; name: string }> = {
  'facecam.name': { max: 44, name: 'analyst name' },
  'who-we-are.headline': { max: 60, name: 'headline' },
  'who-we-are.buyers-heading': { max: 40, name: 'buyers heading' },
  'who-we-are.deals-heading': { max: 40, name: 'deals heading' },
  'who-we-are.buyer-name': { max: 40, name: 'buyer name' },
  'who-we-are.deal-text': { max: 90, name: 'deal text' },
  'your-company.headline': { max: 60, name: 'headline' },
  'your-company.company': { max: 95, name: 'company name' },
  'your-company.line': { max: 90, name: 'company line' },
  'your-figures.headline': { max: 60, name: 'headline' },
  'your-figures.revenue': { max: 30, name: 'revenue label' },
  'your-figures.profit': { max: 30, name: 'profit label' },
  'your-figures.value': { max: 24, name: 'figure' },
  'your-figures.fiscal-year': { max: 30, name: 'fiscal year' },
  'your-figures.source': { max: 40, name: 'source' },
  'your-figures.ask': { max: 120, name: 'ask text' },
  'buyers.headline': { max: 60, name: 'headline' },
  'buyers.name': { max: 40, name: 'buyer name' },
  'buyers.focus': { max: 80, name: 'buyer focus' },
  'buyers.empty': { max: 120, name: 'text without buyers' },
  'what-is-possible.headline': { max: 60, name: 'headline' },
  'what-is-possible.deal-text': { max: 140, name: 'deal text' },
  'what-is-possible.empty': { max: 120, name: 'text without deals' },
  'what-is-possible.multiple': { max: 52, name: 'multiple label' },
  'what-is-possible.summary': { max: 48, name: 'summary label' },
  'privacy.headline': { max: 60, name: 'headline' },
  'privacy.point': { max: 90, name: 'privacy point' },
  'book-meeting.headline': { max: 60, name: 'headline' },
  'book-meeting.line': { max: 120, name: 'meeting line' },
  'book-meeting.name': { max: 44, name: 'analyst name' },
}

export const SLOT_LIMITS: Record<string, number> = Object.fromEntries(
  Object.entries(SLOTS).map(([key, slot]) => [key, slot.max]),
)

export function textLength(text: string): number {
  return [...text.normalize('NFC')].length
}

export function labelSlot(template: TemplateName, key: string): string | null {
  let name = key
  for (;;) {
    const slot = `${template}.${name}`
    if (slot in SLOTS) return slot
    const cut = name.lastIndexOf('-')
    if (cut <= 0) return null
    name = name.slice(0, cut)
  }
}

function slotTexts(segment: Segment): [slot: string, text: string][] {
  const v = segment.variables
  const texts: [string, string][] = []
  switch (v.template) {
    case 'facecam':
      texts.push(['facecam.name', v.analystName])
      break
    case 'who-we-are':
      for (const buyer of v.buyers) texts.push(['who-we-are.buyer-name', buyer.name])
      for (const deal of v.deals) texts.push(['who-we-are.deal-text', deal.text])
      break
    case 'your-company':
      texts.push(['your-company.company', v.company])
      for (const line of v.lines) texts.push(['your-company.line', line])
      break
    case 'your-figures':
      if (v.mode === 'figures') {
        texts.push(['your-figures.value', v.revenueText], ['your-figures.value', v.profitText])
      }
      break
    case 'buyers':
      for (const buyer of v.buyers) texts.push(['buyers.name', buyer.name], ['buyers.focus', buyer.focus])
      break
    case 'what-is-possible':
      for (const deal of v.deals) texts.push(['what-is-possible.deal-text', deal.text])
      break
    case 'book-meeting':
      texts.push(['book-meeting.name', v.analystName])
      break
    case 'privacy':
      break
  }
  for (const [key, text] of Object.entries(segment.labels)) {
    const slot = labelSlot(v.template, key)
    if (slot) texts.push([slot, text])
  }
  return texts
}

export function checkTimelineSlots(timeline: Timeline): ReviewReason[] {
  const reasons: ReviewReason[] = []
  for (const segment of timeline.segments) {
    for (const [slot, text] of slotTexts(segment)) {
      const max = SLOTS[slot]?.max
      const length = textLength(text)
      if (max === undefined || length <= max) continue
      reasons.push({
        code: 'text_too_long',
        slide: segment.slide,
        slot,
        detail: `Slide ${segment.slide}, ${SLOTS[slot]?.name ?? slot}: ${length} of ${max} characters`,
      })
    }
  }
  return reasons
}
