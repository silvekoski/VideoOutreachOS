import type {
  Channel,
  CustomQuestion,
  DealAnalytics,
  DealSnapshot,
  DealStatus,
  Financials,
  FormAnswers,
  IntroUpload,
  Lang,
  MeetingBrief,
  MgxData,
  ReviewReason,
  ScrapeResult,
  SessionAnalytics,
  SessionChannel,
  SessionInfo,
  StoredEvent,
  Timeline,
  ValuationResult,
} from '@mergero/shared'

export function parseJson<T>(text: string): T
export function parseJson<T>(text: string | null): T | null
export function parseJson<T>(text: string | null): T | null {
  return text === null ? null : (JSON.parse(text) as T)
}

export function toJson(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

export interface AnalystIntro {
  file: string | null
  durationS: number | null
  recordedAt: string
  transcript: string | null
  status: 'processing' | 'ready' | 'failed'
  pending?: IntroUpload
}

export type CloneStatus = 'none' | 'pending' | 'ready' | 'failed'

export interface AnalystColumns {
  id: number
  name: string
  email: string | null
  time_zone: string
  intros: string
  voice_sample_file: string | null
  voice_id: string | null
  clone_status: string
  consent_date: string | null
  consent_file: string | null
  photo_file: string | null
  default_expiry_days: number
  default_second_channel: string
  brief_language: string
  alerts_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface AnalystRow {
  id: number
  name: string
  email: string | null
  timeZone: string
  intros: Partial<Record<Lang, AnalystIntro>>
  voiceSampleFile: string | null
  voiceId: string | null
  cloneStatus: CloneStatus
  consentDate: string | null
  consentFile: string | null
  photoFile: string | null
  defaultExpiryDays: number
  defaultSecondChannel: Channel
  briefLanguage: Lang
  alertsSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export function toAnalystRow(c: AnalystColumns): AnalystRow {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    timeZone: c.time_zone,
    intros: parseJson<Partial<Record<Lang, AnalystIntro>>>(c.intros),
    voiceSampleFile: c.voice_sample_file,
    voiceId: c.voice_id,
    cloneStatus: c.clone_status as CloneStatus,
    consentDate: c.consent_date,
    consentFile: c.consent_file,
    photoFile: c.photo_file,
    defaultExpiryDays: c.default_expiry_days,
    defaultSecondChannel: c.default_second_channel as Channel,
    briefLanguage: c.brief_language as Lang,
    alertsSeenAt: c.alerts_seen_at,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }
}

export interface DealColumns {
  id: number
  analyst_id: number
  status: string
  review_reasons: string
  link_code: string
  language: string
  page_language: string
  country: string
  snapshot: string
  scrape: string | null
  financials: string | null
  mgx: string | null
  custom_questions: string
  removed_buyers: string
  form: string | null
  form_sent_at: string | null
  mgx_receipt_id: string | null
  valuation: string | null
  expiry_days: number
  published_at: string | null
  published_version: number | null
  expires_at: string | null
  expired_at: string | null
  first_open_at: string | null
  meeting_at: string | null
  meeting_email: string | null
  booked_at: string | null
  lost_at: string | null
  lost_reason: string | null
  analytics: string | null
  pipedrive_note_id: number | null
  created_at: string
  updated_at: string
}

export interface DealRow {
  id: number
  analystId: number
  status: DealStatus
  reviewReasons: ReviewReason[]
  linkCode: string
  language: Lang
  pageLanguage: Lang
  country: string
  snapshot: DealSnapshot
  scrape: ScrapeResult | null
  financials: Financials | null
  mgx: MgxData | null
  customQuestions: CustomQuestion[]
  removedBuyers: string[]
  form: FormAnswers | null
  formSentAt: string | null
  mgxReceiptId: string | null
  valuation: ValuationResult | null
  expiryDays: number
  publishedAt: string | null
  publishedVersion: number | null
  expiresAt: string | null
  expiredAt: string | null
  firstOpenAt: string | null
  meetingAt: string | null
  meetingEmail: string | null
  bookedAt: string | null
  lostAt: string | null
  lostReason: string | null
  analytics: DealAnalytics | null
  pipedriveNoteId: number | null
  createdAt: string
  updatedAt: string
}

export type DealPatch = Partial<Omit<DealRow, 'id' | 'createdAt' | 'updatedAt'>>

export const DEAL_COLUMNS: Record<keyof DealPatch, { column: keyof DealColumns; json: boolean }> = {
  analystId: { column: 'analyst_id', json: false },
  status: { column: 'status', json: false },
  reviewReasons: { column: 'review_reasons', json: true },
  linkCode: { column: 'link_code', json: false },
  language: { column: 'language', json: false },
  pageLanguage: { column: 'page_language', json: false },
  country: { column: 'country', json: false },
  snapshot: { column: 'snapshot', json: true },
  scrape: { column: 'scrape', json: true },
  financials: { column: 'financials', json: true },
  mgx: { column: 'mgx', json: true },
  customQuestions: { column: 'custom_questions', json: true },
  removedBuyers: { column: 'removed_buyers', json: true },
  form: { column: 'form', json: true },
  formSentAt: { column: 'form_sent_at', json: false },
  mgxReceiptId: { column: 'mgx_receipt_id', json: false },
  valuation: { column: 'valuation', json: true },
  expiryDays: { column: 'expiry_days', json: false },
  publishedAt: { column: 'published_at', json: false },
  publishedVersion: { column: 'published_version', json: false },
  expiresAt: { column: 'expires_at', json: false },
  expiredAt: { column: 'expired_at', json: false },
  firstOpenAt: { column: 'first_open_at', json: false },
  meetingAt: { column: 'meeting_at', json: false },
  meetingEmail: { column: 'meeting_email', json: false },
  bookedAt: { column: 'booked_at', json: false },
  lostAt: { column: 'lost_at', json: false },
  lostReason: { column: 'lost_reason', json: false },
  analytics: { column: 'analytics', json: true },
  pipedriveNoteId: { column: 'pipedrive_note_id', json: false },
}

export function toDealRow(c: DealColumns): DealRow {
  return {
    id: c.id,
    analystId: c.analyst_id,
    status: c.status as DealStatus,
    reviewReasons: parseJson<ReviewReason[]>(c.review_reasons),
    linkCode: c.link_code,
    language: c.language as Lang,
    pageLanguage: c.page_language as Lang,
    country: c.country,
    snapshot: parseJson<DealSnapshot>(c.snapshot),
    scrape: parseJson<ScrapeResult>(c.scrape),
    financials: parseJson<Financials>(c.financials),
    mgx: parseJson<MgxData>(c.mgx),
    customQuestions: parseJson<CustomQuestion[]>(c.custom_questions),
    removedBuyers: parseJson<string[]>(c.removed_buyers),
    form: parseJson<FormAnswers>(c.form),
    formSentAt: c.form_sent_at,
    mgxReceiptId: c.mgx_receipt_id,
    valuation: parseJson<ValuationResult>(c.valuation),
    expiryDays: c.expiry_days,
    publishedAt: c.published_at,
    publishedVersion: c.published_version,
    expiresAt: c.expires_at,
    expiredAt: c.expired_at,
    firstOpenAt: c.first_open_at,
    meetingAt: c.meeting_at,
    meetingEmail: c.meeting_email,
    bookedAt: c.booked_at,
    lostAt: c.lost_at,
    lostReason: c.lost_reason,
    analytics: parseJson<DealAnalytics>(c.analytics),
    pipedriveNoteId: c.pipedrive_note_id,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  }
}

export type RenderStatus = 'pending' | 'rendering' | 'rendered' | 'failed'

export interface TimelineColumns {
  id: number
  deal_id: number
  version: number
  json: string
  render_status: string
  approved_at: string | null
  rendered_at: string | null
  created_at: string
}

export interface TimelineRow {
  id: number
  dealId: number
  version: number
  timeline: Timeline
  renderStatus: RenderStatus
  approvedAt: string | null
  renderedAt: string | null
  createdAt: string
}

export function toTimelineRow(c: TimelineColumns): TimelineRow {
  return {
    id: c.id,
    dealId: c.deal_id,
    version: c.version,
    timeline: parseJson<Timeline>(c.json),
    renderStatus: c.render_status as RenderStatus,
    approvedAt: c.approved_at,
    renderedAt: c.rendered_at,
    createdAt: c.created_at,
  }
}

export interface SessionColumns {
  id: string
  deal_id: number
  version: number
  started_at: string
  last_seen_at: string
  local_day: string
  channel: string
  device: string
  browser: string
  os: string
  screen: string
  analytics: string | null
}

export interface SessionRow {
  id: string
  dealId: number
  version: number
  startedAt: string
  lastSeenAt: string
  localDay: string
  channel: SessionChannel
  device: SessionInfo['device']
  browser: string
  os: string
  screen: string
  analytics: SessionAnalytics | null
}

export function toSessionRow(c: SessionColumns): SessionRow {
  return {
    id: c.id,
    dealId: c.deal_id,
    version: c.version,
    startedAt: c.started_at,
    lastSeenAt: c.last_seen_at,
    localDay: c.local_day,
    channel: c.channel as SessionChannel,
    device: c.device as SessionInfo['device'],
    browser: c.browser,
    os: c.os,
    screen: c.screen,
    analytics: parseJson<SessionAnalytics>(c.analytics),
  }
}

export interface EventColumns {
  id: number
  deal_id: number
  session_id: string | null
  seq: number | null
  type: string
  slide: number | null
  video_time: number | null
  channel: string | null
  client_at: string | null
  at: string
  data: string
}

export function toStoredEvent(c: EventColumns): StoredEvent {
  return {
    id: c.id,
    dealId: c.deal_id,
    sessionId: c.session_id,
    seq: c.seq,
    type: c.type as StoredEvent['type'],
    slide: c.slide,
    videoTime: c.video_time,
    channel: c.channel,
    clientAt: c.client_at,
    at: c.at,
    data: parseJson<Record<string, unknown>>(c.data),
  }
}

export type TaskType = 'call' | 'second_channel'

export interface TaskColumns {
  id: number
  deal_id: number
  type: string
  channel: string | null
  status: string
  pipedrive_activity_id: number | null
  created_at: string
  done_at: string | null
}

export interface TaskRow {
  id: number
  dealId: number
  type: TaskType
  channel: Channel | null
  status: 'open' | 'done'
  pipedriveActivityId: number | null
  createdAt: string
  doneAt: string | null
}

export function toTaskRow(c: TaskColumns): TaskRow {
  return {
    id: c.id,
    dealId: c.deal_id,
    type: c.type as TaskType,
    channel: c.channel as Channel | null,
    status: c.status as TaskRow['status'],
    pipedriveActivityId: c.pipedrive_activity_id,
    createdAt: c.created_at,
    doneAt: c.done_at,
  }
}

export interface BriefColumns {
  id: number
  deal_id: number
  version: number
  last_event_id: number
  language: string
  json: string
  created_at: string
}

export interface BriefRow {
  id: number
  dealId: number
  version: number
  lastEventId: number
  language: Lang
  brief: MeetingBrief
  createdAt: string
}

export function toBriefRow(c: BriefColumns): BriefRow {
  return {
    id: c.id,
    dealId: c.deal_id,
    version: c.version,
    lastEventId: c.last_event_id,
    language: c.language as Lang,
    brief: parseJson<MeetingBrief>(c.json),
    createdAt: c.created_at,
  }
}
