import { formatAmount, formatDurationS } from '@mergero/shared'
import type { Amount, FigureValue, Lang, MeetingBrief, SaleTiming, Signal, StaffRange } from '@mergero/shared'
import { fill } from '@mergero/shared/i18n'
import type { BriefSection, BriefStrings, Strings } from '@mergero/shared/i18n'
import { formatDateTime } from './format'

export function figureAmount(figure: FigureValue): Amount {
  if (figure.type === 'exact' && figure.value !== null) return { kind: 'exact', value: figure.value }
  return { kind: 'range', min: figure.min, max: figure.max }
}

export function figureText(figure: FigureValue | null, lang: Lang): string {
  return formatAmount(figure ? figureAmount(figure) : null, lang)
}

const ANSWER_FIELDS: Record<string, keyof BriefStrings['fields']> = {
  revenue: 'revenue',
  profit: 'profit',
  staff: 'staff',
  timing: 'timing',
  notInterestedReason: 'notInterestedReason',
  message: 'message',
}

export function answerLabel(key: string, strings: Strings): string {
  const field = ANSWER_FIELDS[key]
  return field ? strings.brief.fields[field] : key
}

export function answerValue(key: string, value: string, strings: Strings): string {
  if (key === 'timing' && Object.hasOwn(strings.timing, value)) return strings.timing[value as SaleTiming]
  if (key === 'staff' && Object.hasOwn(strings.staff, value)) return strings.staff[value as StaffRange]
  return value
}

function evidenceFromText(signal: Signal, text: string, strings: Strings): string {
  const slide = (n: number) => fill(strings.brief.fields.slide, { n })
  const n = Number(text)
  if (signal.key === 'short_watch' && Number.isFinite(n)) return formatDurationS(n)
  if (signal.key === 'stopped_early' && Number.isInteger(n)) return slide(n)
  if (signal.key === 'replayed_figures_or_buyers' && /^\d+(, \d+)*$/u.test(text)) {
    return text.split(', ').map((item) => slide(Number(item))).join(', ')
  }
  return text
}

export function signalEvidence(signal: Signal, strings: Strings, timeZone: string): string | null {
  if (signal.evidenceText) return evidenceFromText(signal, signal.evidenceText, strings)
  const event = signal.evidenceEvent
  if (!event) return null
  return [
    strings.brief.events[event.type],
    formatDateTime(event.at, timeZone),
    event.slide !== null && event.type !== 'complete' ? fill(strings.brief.fields.slide, { n: event.slide }) : null,
    event.channel ? strings.channels[event.channel] : null,
  ]
    .filter((part) => part !== null)
    .join(', ')
}

export function hasSectionData(brief: MeetingBrief, section: BriefSection): boolean {
  switch (section) {
    case 'header':
      return true
    case 'company':
      return (
        brief.company.lines.length > 0 ||
        brief.company.country !== '' ||
        brief.company.nace !== null ||
        brief.company.staffCount !== null
      )
    case 'figures':
      return brief.figures.revenue !== null || brief.figures.profit !== null || brief.figures.valuation !== null
    case 'engagement':
      return brief.engagement.opens > 0 || brief.engagement.sessions > 0
    case 'signals':
      return brief.signals.length > 0
    case 'form':
      return brief.form !== null && (brief.form.answers.length > 0 || brief.form.custom.length > 0)
    case 'buyers':
      return brief.buyers.length > 0
    case 'questions':
      return (brief.questions?.length ?? 0) > 0
  }
}

export function reportBriefRead(
  reported: { current: string | null },
  key: string,
  send: (onError: () => void) => void,
): void {
  if (reported.current === key) return
  reported.current = key
  send(() => {
    if (reported.current === key) reported.current = null
  })
}

export function languageName(lang: Lang): string {
  return displayName('en-US', 'language', lang)
}

export function displayName(locale: string, type: 'language' | 'region', code: string): string {
  try {
    return new Intl.DisplayNames([locale], { type }).of(code) ?? code
  } catch {
    return code
  }
}
