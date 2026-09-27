import type {
  EvidenceEventType,
  FigureValue,
  InterestLevel,
  SaleTiming,
  SessionChannel,
  SessionInfo,
  SignalKey,
  SlideNumber,
  StaffRange,
} from '../types.ts'

export const REVENUE_RANGES = [
  { value: 'under-1m', min: null, max: 1_000_000 },
  { value: '1m-3m', min: 1_000_000, max: 3_000_000 },
  { value: '3m-5m', min: 3_000_000, max: 5_000_000 },
  { value: '5m-10m', min: 5_000_000, max: 10_000_000 },
  { value: '10m-20m', min: 10_000_000, max: 20_000_000 },
  { value: '20m-50m', min: 20_000_000, max: 50_000_000 },
  { value: 'over-50m', min: 50_000_000, max: null },
] as const

export const PROFIT_RANGES = [
  { value: 'loss', min: null, max: 0 },
  { value: 'under-250k', min: 0, max: 250_000 },
  { value: '250k-500k', min: 250_000, max: 500_000 },
  { value: '500k-1m', min: 500_000, max: 1_000_000 },
  { value: '1m-2m', min: 1_000_000, max: 2_000_000 },
  { value: '2m-5m', min: 2_000_000, max: 5_000_000 },
  { value: 'over-5m', min: 5_000_000, max: null },
] as const

export type RevenueRange = (typeof REVENUE_RANGES)[number]['value']
export type ProfitRange = (typeof PROFIT_RANGES)[number]['value']

export const BRIEF_SECTIONS = [
  'header',
  'company',
  'figures',
  'engagement',
  'signals',
  'form',
  'buyers',
  'questions',
] as const
export type BriefSection = (typeof BRIEF_SECTIONS)[number]

export type Device = SessionInfo['device']

export interface PageStrings {
  documentTitle: string
  loading: string
  videoError: string
  play: string
  pause: string
  replay: string
  mute: string
  unmute: string
  volume: string
  captionsOn: string
  captionsOff: string
  fullscreen: string
  exitFullscreen: string
  progress: string
  progressValue: string
  jumpToSlide: string
  slideNames: Record<SlideNumber, string>
  transcriptHeading: string
  showTranscript: string
  hideTranscript: string
  onScreen: string
  buyersHeading: string
  buyersHeadingFeatured: string
  visitWebsite: string
  formHeading: string
  formIntro: string
  revenue: string
  profit: string
  staff: string
  rangeChoice: string
  exactChoice: string
  amountKind: string
  exactValue: string
  exactInvalid: string
  chooseRange: string
  revenueRanges: Record<RevenueRange, string>
  profitRanges: Record<ProfitRange, string>
  timingQuestion: string
  notInterestedReason: string
  customHeading: string
  message: string
  privacyNote: string
  previewNote: string
  submit: string
  sending: string
  sent: string
  submitError: string
  alreadySent: string
  calculatorHeading: string
  calculatorIntro: string
  calculatorResultLabel: string
  calculatorResult: string
  calculatorNoRange: string
  calculatorNeedsProfit: string
  calendarHeading: string
  calendarLine: string
  chooseTime: string
  timeZone: string
  email: string
  emailInvalid: string
  book: string
  booking: string
  booked: string
  alreadyBooked: string
  slotTaken: string
  noSlots: string
  bookError: string
  forward: string
  shareTitle: string
  shareText: string
  linkCopied: string
  privacyHeading: string
  privacyText: string
  contactHeading: string
  expiredTitle: string
  expiredText: string
  notFoundTitle: string
  notFoundText: string
}

export interface SlideLabelStrings {
  facecam: Record<string, never>
  'who-we-are': { headline: string; 'buyers-heading': string; 'deals-heading': string }
  'your-company': { headline: string }
  'your-figures': {
    headline: string
    revenue: string
    profit: string
    'fiscal-year': string
    source: string
    'ask-calculator': string
    'ask-form': string
  }
  buyers: { headline: string; 'headline-featured': string; empty: string }
  'what-is-possible': { headline: string; 'headline-recent': string; empty: string }
  privacy: { headline: string; 'point-1': string; 'point-2': string; 'point-3': string }
  'book-meeting': { headline: string; line: string }
}

export interface BriefStrings {
  title: string
  sections: Record<BriefSection, string>
  fields: {
    company: string
    owner: string
    role: string
    meetingAt: string
    language: string
    interest: string
    summary: string
    lines: string
    country: string
    nace: string
    staff: string
    revenue: string
    profit: string
    valuation: string
    source: string
    valueType: string
    value: string
    fiscalYear: string
    opens: string
    sessions: string
    totalWatch: string
    perSlide: string
    stopSlide: string
    replays: string
    channels: string
    positive: string
    negative: string
    evidence: string
    timing: string
    notInterestedReason: string
    message: string
    custom: string
    website: string
    tapped: string
    notTapped: string
    slide: string
  }
  noData: string
  noSummary: string
  sources: Record<FigureValue['source'], string>
  valueTypes: Record<FigureValue['type'], string>
  events: Record<EvidenceEventType, string>
}

export interface Strings {
  locale: string
  format: { range: string; under: string; over: string }
  page: PageStrings
  slides: SlideLabelStrings
  brief: BriefStrings
  og: { title: string; description: string }
  signals: Record<SignalKey, string>
  interest: Record<InterestLevel, string>
  staff: Record<StaffRange, string>
  timing: Record<SaleTiming, string>
  channels: Record<SessionChannel, string>
  devices: Record<Device, string>
}

export function formatEur(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(vars, key) ? String(vars[key]) : match,
  )
}
