export const LANGUAGES = ['fi', 'sv', 'nb', 'da', 'de', 'en'] as const
export type Lang = (typeof LANGUAGES)[number]

export const CHANNELS = ['email', 'linkedin', 'sms', 'whatsapp'] as const
export type Channel = (typeof CHANNELS)[number]
export type SessionChannel = Channel | 'direct'

export const OUTREACH_LINK = '{link}'
export const OUTREACH_WORDS: Record<Channel, { min: number; max: number }> = {
  email: { min: 50, max: 130 },
  linkedin: { min: 25, max: 80 },
  sms: { min: 15, max: 45 },
  whatsapp: { min: 20, max: 60 },
}

export interface OutreachContext {
  lang: Lang
  channel: Channel
  company: string
  ownerName: string
  ownerFirstName: string
  analystName: string
  expiresOn: string
  companyLines: string[]
}

export const DEAL_STATUSES = [
  'draft',
  'review',
  'failed',
  'link_sent',
  'opened',
  'form_sent',
  'meeting_booked',
  'lost',
  'won',
] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export function isClosedStatus(status: DealStatus): boolean {
  return status === 'lost' || status === 'won'
}

export const STAGES = ['link_sent', 'opened', 'form_sent', 'meeting_booked'] as const
export type Stage = (typeof STAGES)[number]

export const SLIDES = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type SlideNumber = (typeof SLIDES)[number]
export type ScriptSlideNumber = Exclude<SlideNumber, 1>

export type TemplateName =
  | 'facecam'
  | 'who-we-are'
  | 'your-company'
  | 'your-figures'
  | 'buyers'
  | 'what-is-possible'
  | 'privacy'
  | 'book-meeting'

export const SLIDE_TEMPLATES: Record<SlideNumber, TemplateName> = {
  1: 'facecam',
  2: 'who-we-are',
  3: 'your-company',
  4: 'your-figures',
  5: 'buyers',
  6: 'what-is-possible',
  7: 'privacy',
  8: 'book-meeting',
}

export type ReviewReasonCode =
  | 'lines_missing'
  | 'script_missing'
  | 'model_failed'
  | 'text_too_long'
  | 'audio_failed'
  | 'no_intro'
  | 'no_voice'
  | 'script_check'
  | 'slide_empty'
  | 'remake_needed'

export interface ReviewReason {
  code: ReviewReasonCode
  slide?: SlideNumber
  slot?: string
  detail: string
}

export interface DealSnapshot {
  pipedriveDealId: number
  title: string
  company: string
  website: string | null
  businessId: string | null
  nace: string | null
  country: string
  ownerName: string
  ownerFirstName: string
  ownerRole: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  personId: number | null
  orgId: number | null
  staffCount: number | null
  linkedinLanguages: Lang[]
  readAt: string
}

export type ScrapeFailure =
  | 'no_website'
  | 'too_few_words'
  | 'http_error'
  | 'timeout'
  | 'blocked'
  | 'error'

export interface ScrapeResult {
  ok: boolean
  reason: ScrapeFailure | null
  error: string | null
  homeUrl: string | null
  pageUrls: string[]
  words: number
  markdown: string | null
  siteLanguage: Lang | null
  screenshot: boolean
  scrapedAt: string
}

export type Financials =
  | {
      source: 'asiakastieto'
      revenue: number
      profit: number
      fiscalYear: number
    }
  | { source: 'ask_in_form' }

export interface MgxBuyer {
  id: string
  name: string
  logoUrl: string | null
  website: string | null
  focus: string
  namePublic: boolean
}

export interface MgxClosedDeal {
  id: string
  year: number
  country: string
  nace: string
  text: string
  profitMultiple: number
}

export interface MgxData {
  buyers: MgxBuyer[]
  featuredBuyers: MgxBuyer[]
  countryFeaturedBuyers?: MgxBuyer[]
  sectorDeals: MgxClosedDeal[]
  recentDeals: MgxClosedDeal[]
  multiples: number[]
  nace?: string | null
  fetchedAt: string
}

export interface CustomQuestion {
  id: string
  text: string
}

export type Amount =
  | { kind: 'range'; min: number | null; max: number | null }
  | { kind: 'exact'; value: number }

export const STAFF_RANGES = ['1-19', '20-49', '50-99', '100-249', '250+'] as const
export type StaffRange = (typeof STAFF_RANGES)[number]

export const SALE_TIMINGS = ['within_12_months', 'in_1_3_years', 'later', 'not_interested'] as const
export type SaleTiming = (typeof SALE_TIMINGS)[number]

export interface FormAnswers {
  revenue: Amount | null
  profit: Amount | null
  staff: StaffRange | null
  timing: SaleTiming | null
  notInterestedReason: string | null
  custom: { questionId: string; question: string; answer: string }[]
  message: string | null
  submittedAt: string
}

export interface ValuationResult {
  available: boolean
  low: number | null
  high: number | null
  p25: number | null
  p75: number | null
  dealCount: number
  nace2: string | null
}

export interface BuyerSlideItem {
  id: string
  name: string
  focus: string
  website: string | null
  logoFile: string | null
}

export type DealScope = 'sector' | 'recent'

export type BuyerScope = 'sector' | 'featured'

export interface DealCardItem {
  id: string
  year: number
  country: string
  text: string
  profitMultiple?: number
}

export interface SectorSummary {
  dealCount: number
  p25: number
  p75: number
}

export type TemplateVariables =
  | { template: 'facecam'; videoFile: string; analystName: string; transcript: string | null }
  | {
      template: 'who-we-are'
      buyers: BuyerSlideItem[]
      deals: DealCardItem[]
      buyerCount: number
    }
  | {
      template: 'your-company'
      company: string
      website: string | null
      lines: string[]
      linesSource: 'model' | 'analyst' | null
      screenshotFile: string | null
    }
  | {
      template: 'your-figures'
      mode: 'figures'
      revenue: number
      profit: number
      revenueText: string
      profitText: string
      fiscalYear: number
    }
  | { template: 'your-figures'; mode: 'ask'; calculator: boolean }
  | { template: 'buyers'; buyers: BuyerSlideItem[]; candidates?: BuyerSlideItem[]; scope?: BuyerScope }
  | { template: 'what-is-possible'; deals: DealCardItem[]; scope?: DealScope; summary?: SectorSummary | null }
  | { template: 'privacy' }
  | { template: 'book-meeting'; analystName: string; company: string }

export type AudioStatus = 'ok' | 'new' | 'missing' | 'failed'

export interface FacecamSegment {
  slide: 1
  template: 'facecam'
  variables: Extract<TemplateVariables, { template: 'facecam' }>
  labels: Record<string, string>
  durationS: number
  startS: number | null
  endS: number | null
}

export interface SlideSegment {
  slide: ScriptSlideNumber
  template: Exclude<TemplateName, 'facecam'>
  variables: Exclude<TemplateVariables, { template: 'facecam' }>
  labels: Record<string, string>
  script: string
  scriptSource: 'model' | 'analyst' | 'fallback' | null
  scriptCheck?: boolean
  audio: { file: string | null; durationS: number | null; status: AudioStatus; error: string | null }
  durationS: number | null
  startS: number | null
  endS: number | null
}

export type Segment = FacecamSegment | SlideSegment

export interface Timeline {
  dealId: number
  version: number
  language: Lang
  fps: number
  width: number
  height: number
  pauseS: number
  segments: Segment[]
  basis?: VideoBasis
}

export interface VideoBasis {
  website: string | null
  businessId: string | null
  nace: string | null
}

export interface SlideAnalytics {
  slide: SlideNumber
  watchS: number
  replays: number
}

export interface SessionAnalytics {
  watchS: number
  perSlide: SlideAnalytics[]
  stopSlide: SlideNumber | null
  replays: number
  completed: boolean
  played: boolean
  formActivity: boolean
}

export interface DealAnalytics {
  opens: number
  sessions: number
  totalWatchS: number
  perSlide: SlideAnalytics[]
  stopSlide: SlideNumber | null
  replays: number
  completed: boolean
  days: number
  lastEventId: number | null
  channel: SessionChannel | null
  firstChannel: SessionChannel | null
  buyerLinkTaps: number
  calculatorResults: number
  forwards: number
  interest?: InterestLevel | null
  signals?: SignalKey[] | null
  saleTiming?: SaleTiming | null
}

export const PLAYER_EVENT_TYPES = [
  'play',
  'pause',
  'seek',
  'slide_start',
  'slide_end',
  'complete',
  'page_hide',
] as const
export const PAGE_EVENT_TYPES = [
  'open',
  'scroll',
  'tap',
  'field_focus',
  'field_value',
  'buyer_link_tap',
  'forward',
  'calculator_result',
] as const
export type SessionEventType =
  | (typeof PLAYER_EVENT_TYPES)[number]
  | (typeof PAGE_EVENT_TYPES)[number]

export const DEAL_EVENT_TYPES = [
  'link_sent',
  'form_sent',
  'meeting_booked',
  'lost',
  'won',
  'reopened',
  'brief_written',
  'brief_read',
  'task_created',
  'task_done',
] as const
export type DealEventType = (typeof DEAL_EVENT_TYPES)[number]

export interface ClientEvent {
  seq: number
  type: SessionEventType
  at: string
  slide: SlideNumber | null
  vt: number | null
  data?: Record<string, string | number | boolean | null>
}

export interface SessionInfo {
  channel: SessionChannel
  device: 'mobile' | 'tablet' | 'desktop'
  browser: string
  os: string
  screen: string
  version: number
}

export interface EventBatch {
  sessionId: string
  session: SessionInfo
  events: ClientEvent[]
}

export interface RecordingEvent {
  type: number
  timestamp: number
  [key: string]: unknown
}

export interface RecordingChunk {
  sessionId: string
  session: SessionInfo
  part: number
  events: RecordingEvent[]
}

export interface StoredEvent {
  id: number
  dealId: number
  sessionId: string | null
  seq: number | null
  type: SessionEventType | DealEventType
  slide: number | null
  videoTime: number | null
  channel: string | null
  clientAt: string | null
  at: string
  data: Record<string, unknown>
}

export const SIGNAL_KEYS = [
  'watched_to_end',
  'replayed_figures_or_buyers',
  'tapped_buyer_link',
  'used_calculator',
  'gave_exact_figures',
  'forwarded_link',
  'came_back',
  'answered_custom_questions',
  'stopped_early',
  'short_watch',
] as const
export type SignalKey = (typeof SIGNAL_KEYS)[number]

export const EVIDENCE_EVENT_TYPES = [
  'open',
  'complete',
  'slide_start',
  'buyer_link_tap',
  'calculator_result',
  'forward',
  'form_sent',
] as const
export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number]

export interface SignalEvidenceEvent {
  type: EvidenceEventType
  at: string
  slide: number | null
  channel: SessionChannel | null
}

export interface Signal {
  key: SignalKey
  type: 'positive' | 'negative'
  evidenceEventId: number | null
  evidenceText: string | null
  evidenceEvent: SignalEvidenceEvent | null
}

export type InterestLevel = 'high' | 'medium' | 'low'

export interface FigureValue {
  type: 'range' | 'exact'
  min: number | null
  max: number | null
  value: number | null
  source: 'asiakastieto' | 'form' | 'calculator'
  fiscalYear: number | null
}

export interface MeetingBrief {
  version: number
  language: Lang
  writtenAt: string
  header: {
    company: string
    owner: string
    ownerRole: string | null
    meetingAt: string
    timeZone: string
    language: Lang
    interest: InterestLevel
    summary: string | null
  }
  company: {
    lines: string[]
    country: string
    nace: string | null
    staffCount: number | null
  }
  figures: {
    revenue: FigureValue | null
    profit: FigureValue | null
    valuation: FigureValue | null
  }
  engagement: {
    opens: number
    sessions: number
    totalWatchS: number
    perSlide: SlideAnalytics[]
    stopSlide: SlideNumber | null
    replays: number
    channels: { channel: SessionChannel; device: string }[]
  }
  signals: Signal[]
  form: {
    answers: { key: string; value: string }[]
    custom: { question: string; answer: string }[]
  } | null
  customQuestions: { question: string; answer: string | null }[]
  buyers:{ id: string; name: string; website: string | null; tapped: boolean }[]
  questions: string[] | null
}

export interface VideoPageData {
  code: string
  dealId: number
  company: string
  ownerFirstName: string
  analystName: string
  analystEmail: string | null
  pageLanguage: Lang
  videoLanguage: Lang
  country: string
  version: number
  media: { video720: string; video1080: string; poster: string; captions: string }
  slides: { slide: SlideNumber; startS: number; endS: number }[]
  durationS: number
  buyers: { id: string; name: string; focus: string; website: string | null; logoUrl: string | null }[]
  buyerScope: BuyerScope
  calculator: { p25: number; p75: number; dealCount: number } | null
  calculatorEnabled: boolean
  customQuestions: CustomQuestion[]
  formSent: boolean
  meetingAt: string | null
  expiresAt: string
  preview: boolean
  contact: MergeroContact
}

export interface MergeroContact {
  company: string
  address: string
  email: string
  phone: string
  website: string
  privacyUrl: string
}

export interface Brand {
  primary: string
  ink: string
  text: string
  muted: string
  surface: string
  white: string
  logoOnDark: string
  logoOnLight: string
}

export interface RenderInput {
  timeline: Timeline
  storageDir: string
  repoRoot: string
  brand: Brand
}
