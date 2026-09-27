import type { Lang, MgxBuyer, MgxClosedDeal, Stage } from '@mergero/shared'

export interface PipedriveConfig {
  pipelineId: number
  stages: Record<Stage, number>
  dealFields: {
    video: string
    revenueRange: string
    profitRange: string
    staffRange: string
    valuationRange: string
    watchTimeS: string
    stopSlide: string
    replayCount: string
    watchPerSlide: string
    linkChannel: string
  }
  orgFields: {
    businessId: string
    nace: string
  }
  personFields: {
    role: string | null
  }
}

export interface PipedriveUser {
  id: number
  name: string
  email: string | null
  active: boolean
  timeZone: string | null
}

export interface PipedriveDeal {
  id: number
  title: string
  ownerId: number
  personId: number | null
  orgId: number | null
  stageId: number | null
  status: 'open' | 'won' | 'lost' | 'deleted'
  videoUrl: string | null
}

export interface PipedrivePerson {
  id: number
  name: string
  firstName: string | null
  jobTitle: string | null
  email: string | null
  phone: string | null
}

export interface PipedriveOrg {
  id: number
  name: string
  website: string | null
  countryCode: string | null
  businessId: string | null
  nace: string | null
}

export interface PipedriveChange {
  type: 'deal' | 'person' | 'organization'
  id: number
  updatedAt: string | null
  deal: Pick<PipedriveDeal, 'status' | 'ownerId' | 'personId' | 'orgId'> & { lostReason: string | null } | null
}

export interface PipedriveChanges {
  changes: PipedriveChange[]
  cursor: string
  budget: { limit: number; remaining: number } | null
}

export type PipedriveOrgPatch = Partial<Pick<PipedriveOrg, 'name' | 'website' | 'businessId' | 'nace'>>
export type PipedrivePersonPatch = Partial<Pick<PipedrivePerson, 'name' | 'jobTitle' | 'email' | 'phone'>>

export interface PipedriveDealFields {
  revenueRange?: string | null
  profitRange?: string | null
  staffRange?: string | null
  valuationRange?: string | null
  watchTimeS?: number | null
  stopSlide?: number | null
  replayCount?: number | null
  watchPerSlide?: string | null
  linkChannel?: string | null
}

export interface PipedriveActivityInput {
  dealId: number
  ownerId: number
  type: 'call' | 'task'
  subject: string
  note: string | null
  dueDate: string
}

export interface PipedriveClient {
  readonly mode: 'real' | 'fake'
  listUsers(): Promise<PipedriveUser[]>
  getDeal(id: number): Promise<PipedriveDeal | null>
  getPerson(id: number): Promise<PipedrivePerson | null>
  getOrg(id: number): Promise<PipedriveOrg | null>
  listOpenDeals(): Promise<PipedriveDeal[]>
  listChanges(since: string): Promise<PipedriveChanges>
  updateOrg(id: number, patch: PipedriveOrgPatch): Promise<void>
  updatePerson(id: number, patch: PipedrivePersonPatch): Promise<void>
  setVideoField(dealId: number, url: string): Promise<void>
  moveStage(dealId: number, stage: Stage): Promise<void>
  setLost(dealId: number, reason: string): Promise<void>
  setDealFields(dealId: number, fields: PipedriveDealFields): Promise<void>
  addActivity(input: PipedriveActivityInput): Promise<number>
  markActivityDone(activityId: number): Promise<void>
  upsertNote(dealId: number, noteId: number | null, html: string): Promise<number>
  dealUrl(dealId: number): string
}

export interface ScrapePageResult {
  url: string
  markdown: string
  links: string[]
  screenshotPng: Buffer | null
  language: string | null
  statusCode: number | null
}

export interface ScraperClient {
  readonly mode: 'real' | 'fake'
  scrapeHome(url: string, country?: string): Promise<ScrapePageResult>
  scrapeMarkdown(url: string, country?: string): Promise<ScrapePageResult>
}

export interface ChatJsonRequest {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
  maxTokens: number
  temperature?: number
}

export interface LanguageModelClient {
  readonly mode: 'real' | 'fake'
  completeJson(request: ChatJsonRequest): Promise<unknown>
}

export interface SpeechRequest {
  voiceId: string
  text: string
  language: Lang
}

export interface SpeechClient {
  readonly mode: 'real' | 'fake'
  synthesize(request: SpeechRequest): Promise<Buffer>
  cloneVoice(name: string, sample: Buffer, fileName: string): Promise<{ voiceId: string }>
}

export interface MgxClient {
  searchBuyers(input: { nace?: string; country?: string }): Promise<MgxBuyer[]>
  listClosedDeals(input: { nace?: string }): Promise<MgxClosedDeal[]>
  submitForm(input: { dealId: number; values: Record<string, unknown> }): Promise<{ receiptId: string }>
  close(): Promise<void>
}

export interface FinancialsRecord {
  businessId: string
  revenue: number
  profit: number
  fiscalYear: number
}

export interface FinancialsClient {
  get(businessId: string): Promise<FinancialsRecord | null>
}

export interface LinkedInProfile {
  languages: Lang[]
  staffCount: number | null
}

export interface LinkedInSource {
  get(input: { email: string | null; name: string; company: string }): Promise<LinkedInProfile | null>
}

export interface Providers {
  pipedrive: PipedriveClient
  scraper: ScraperClient
  model: LanguageModelClient
  speech: SpeechClient
  mgx: MgxClient
  financials: FinancialsClient
  linkedin: LinkedInSource
}
