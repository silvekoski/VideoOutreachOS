import type {
  AudioStatus,
  Channel,
  CustomQuestion,
  DealAnalytics,
  DealStatus,
  FormAnswers,
  InterestLevel,
  Lang,
  MeetingBrief,
  ReviewReason,
  SessionAnalytics,
  SessionChannel,
  SlideNumber,
  StoredEvent,
  Timeline,
  ValuationResult,
} from './types.ts'

export interface ApiError {
  error: string
  detail?: unknown
}

export const ADMIN_REQUEST_HEADER = 'X-Mergero-Admin'

export interface ProviderStatus {
  pipedrive: 'real' | 'fake'
  firecrawl: 'real' | 'fake'
  featherless: 'real' | 'fake'
  elevenlabs: 'real' | 'fake'
  mgxUrl: string
}

export interface IntroUpload {
  recordedAt: string
  transcript: string | null
  status: 'processing' | 'failed'
}

export interface IntroInfo {
  language: Lang
  status: 'processing' | 'ready' | 'failed'
  recordedAt: string
  durationS: number | null
  transcript: string | null
  url: string | null
  pending?: IntroUpload
}

export interface EnsureDealDto {
  id: number
  created: boolean
  refreshed: boolean
  refreshError: string | null
}

export interface AnalystDto {
  id: number
  name: string
  email: string | null
  timeZone: string
  intros: IntroInfo[]
  voice: {
    sampleUrl: string | null
    voiceId: string | null
    cloneStatus: 'none' | 'pending' | 'ready' | 'failed'
    consentDate: string | null
    consentUrl: string | null
  }
  defaultExpiryDays: number
  defaultSecondChannel: Channel
  briefLanguage: Lang
}

export interface AnalystPatch {
  defaultExpiryDays?: number
  defaultSecondChannel?: Channel
  briefLanguage?: Lang
  timeZone?: string
}

export interface VoiceIdBody {
  voiceId: string | null
}

export type InboxGroupKey = 'review' | 'meeting_today' | 'call' | 'second_channel'

export interface InboxRow {
  key: string
  dealId: number | null
  company: string
  context: string
  action:
    | { kind: 'review'; label: string }
    | { kind: 'retry'; label: string; jobId: number }
    | { kind: 'brief'; label: string }
    | { kind: 'call'; label: string; taskId: number }
    | { kind: 'second_channel'; label: string; taskId: number; channel: Channel }
  meetingAt?: string
  meetingEmail?: string | null
  interest?: InterestLevel | null
  lastSession?: string | null
}

export interface InboxDto {
  groups: { key: InboxGroupKey; rows: InboxRow[] }[]
}

export interface DealRowDto {
  id: number
  company: string
  country: string
  analystId: number
  analystName: string
  status: DealStatus
  watchS: number
  nextAction: string | null
  updatedAt: string
}

export interface DealTaskDto {
  id: number
  type: 'call' | 'second_channel'
  channel: Channel | null
  status: 'open' | 'done'
  createdAt: string
  ownerPhone: string | null
  ownerEmail: string | null
}

export interface SessionRowDto {
  id: string
  startedAt: string
  channel: SessionChannel
  device: string
  browser: string
  os: string
  screen: string
  analytics: SessionAnalytics | null
}

export interface DealDetailDto {
  id: number
  status: DealStatus
  reviewReasons: ReviewReason[]
  company: string
  website: string | null
  ownerName: string
  ownerRole: string | null
  language: Lang
  pageLanguage: Lang
  country: string
  analyst: { id: number; name: string; timeZone: string }
  pipedriveUrl: string
  link: string | null
  links: Record<Channel, string> | null
  expiresAt: string | null
  expiryDays: number
  expired: boolean
  publishedVersion: number | null
  pendingVersion: number | null
  download720: string | null
  previewUrl: string | null
  meetingAt: string | null
  meetingEmail: string | null
  events: StoredEvent[]
  analytics: DealAnalytics | null
  slideNames: Record<SlideNumber, string>
  sessions: SessionRowDto[]
  form: FormAnswers | null
  valuation: ValuationResult | null
  openTasks: DealTaskDto[]
  brief: MeetingBrief | null
  failedJobs: FailedJobDto[]
  pipeline: { running: boolean; step: string | null }
}

export interface FailedJobDto {
  id: number
  type: string
  error: string
  updatedAt: string
}

export interface ReviewSlideDto {
  slide: SlideNumber
  name: string
  script: string | null
  audioStatus: AudioStatus | null
  audioError: string | null
  audioUrl: string | null
  newAudio: boolean
}

export interface ReviewVideoDto {
  version: number
  url: string
  captionsUrl: string
  language: Lang
  slides: { slide: SlideNumber; startS: number; endS: number }[]
}

export interface ReviewDto {
  dealId: number
  status: DealStatus
  reviewReasons: ReviewReason[]
  version: number
  publishedVersion: number | null
  renderStatus: 'pending' | 'rendering' | 'rendered' | 'failed'
  approved: boolean
  expired: boolean
  video: ReviewVideoDto | null
  timeline: Timeline
  slides: ReviewSlideDto[]
  screenshotUrl: string | null
  lines: string[]
  linesSource: 'model' | 'analyst' | null
  scrapeOk: boolean
  financials: { mode: 'figures'; revenueText: string; profitText: string; fiscalYear: number } | { mode: 'ask' }
  buyers: { id: string; name: string; focus: string; logoUrl: string | null; removed: boolean }[]
  customQuestions: CustomQuestion[]
  expiryDays: number
  pageLanguage: Lang
  pipeline: { running: boolean; step: string | null }
  failedJobs: FailedJobDto[]
}

export interface ReviewPatch {
  scripts?: Partial<Record<SlideNumber, string>>
  lines?: string[]
  removedBuyers?: string[]
  customQuestions?: CustomQuestion[]
  expiryDays?: number
  pageLanguage?: Lang
}

export interface SessionEventsDto {
  session: SessionRowDto
  durationS: number
  slides: { slide: SlideNumber; startS: number; endS: number }[]
  events: StoredEvent[]
}

export interface AlertDto {
  id: number
  dealId: number
  company: string
  type: string
  text: string
  at: string
  unread: boolean
}

export interface MetricsRow {
  key: string
  label: string
  linksSent: number
  openRate: number | null
  avgWatchS: number | null
  formRate: number | null
  meetingRate: number | null
}

export interface MetricsDto {
  from: string
  to: string
  timeZone: string
  byAnalyst: MetricsRow[]
  byCountry: MetricsRow[]
  comparison: { n: number; video: number | null; text: number | null }[]
  videoDeals: number
  textDeals: number
}

export interface TemplatePreviewDto {
  slide: SlideNumber
  name: string
  imageUrl: string | null
}

export interface SlotDto {
  start: string
  end: string
}

export interface FormSubmitBody {
  revenue: FormAnswers['revenue']
  profit: FormAnswers['profit']
  staff: FormAnswers['staff']
  timing: FormAnswers['timing']
  notInterestedReason: string | null
  custom: { questionId: string; answer: string }[]
  message: string | null
}

export interface FormSubmitResult {
  ok: true
  valuation: ValuationResult | null
}

export interface BookBody {
  start: string
  email: string | null
}

export interface BookResult {
  ok: true
  meetingAt: string
}

export interface BookConflictDetail {
  meetingAt: string
}
