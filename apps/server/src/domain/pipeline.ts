import { LANGUAGE_NAMES, checkTimelineSlots, resolveLanguage } from '@mergero/shared'
import type {
  BuyerSlideItem,
  DealStatus,
  Lang,
  ReviewPatch,
  ReviewReason,
  ScriptSlideNumber,
  SlideSegment,
  Timeline,
  VideoBasis,
} from '@mergero/shared'
import { nowIso, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import type { AnalystRow, DealPatch, DealRow, TimelineRow } from '../db/rows.ts'
import { enqueue, jobKeys, jobsForDeal, retryJob } from '../queue/index.ts'
import type { AnyJob, Job, JobType } from '../queue/index.ts'
import { getAnalyst, readyIntro } from './analysts.ts'
import { isExpired, linkExpiresAt, listDeals, requireDeal, setExpiry, updateDeal } from './deals.ts'
import { DomainError } from './errors.ts'
import { moveStage } from './stages.ts'
import {
  createVersion,
  getTimeline,
  listTimelines,
  markRenderStatus,
  newestTimeline,
  setApproval,
  updateVersion,
} from './timelines.ts'

export const SCRIPT_SLIDES: readonly ScriptSlideNumber[] = [2, 3, 4, 5, 6, 7, 8]
export const MIN_COMPANY_LINES = 2
export const LINES_SLOT = 'your-company.line'
const PIPELINE_JOBS: readonly JobType[] = ['scrape', 'write-script', 'audio', 'render']
const CHECK_CAUSES: Partial<Record<ScriptSlideNumber, string>> = { 3: 'company name, the website or the lines', 5: 'buyer list' }
const BASIS_NAMES: Record<keyof VideoBasis, string> = { website: 'website', businessId: 'business ID', nace: 'NACE code' }

export type AdvanceAction =
  | 'none'
  | 'wait'
  | 'review'
  | 'blocked'
  | 'failed'
  | 'scrape'
  | 'write-script'
  | 'audio'
  | 'render'
  | 'publish'

export interface AdvanceResult {
  action: AdvanceAction
  status: DealStatus
  reasons: ReviewReason[]
}

const UNPUBLISHED_STATUS: Record<AdvanceAction, 'draft' | 'review' | 'failed' | null> = {
  none: null,
  wait: 'draft',
  review: 'review',
  blocked: 'review',
  failed: 'failed',
  scrape: 'draft',
  'write-script': 'draft',
  audio: 'draft',
  render: 'draft',
  publish: null,
}

type CompanyVariables = Extract<SlideSegment['variables'], { template: 'your-company' }>
type BuyersVariables = Extract<SlideSegment['variables'], { template: 'buyers' }>

function scriptSegments(timeline: Timeline): SlideSegment[] {
  return timeline.segments.filter((segment): segment is SlideSegment => segment.template !== 'facecam')
}

function scriptSegment(timeline: Timeline, slide: number): SlideSegment | undefined {
  return scriptSegments(timeline).find((segment) => segment.slide === slide)
}

function companyVariables(timeline: Timeline): CompanyVariables | null {
  const variables = scriptSegment(timeline, 3)?.variables
  return variables?.template === 'your-company' ? variables : null
}

function filledLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => line !== '')
}

export function companyLines(timeline: Timeline | null | undefined): string[] {
  const variables = timeline ? companyVariables(timeline) : null
  return variables ? filledLines(variables.lines) : []
}

function linesMissing(timeline: Timeline): boolean {
  const variables = companyVariables(timeline)
  return variables !== null && filledLines(variables.lines).length < MIN_COMPANY_LINES
}

function buyersRemoved(timeline: Timeline): boolean {
  const variables = scriptSegment(timeline, 5)?.variables
  return variables?.template === 'buyers' && variables.buyers.length === 0 && (variables.candidates?.length ?? 0) > 0
}

function scriptEmpty(timeline: Timeline, slide: number): boolean {
  const segment = scriptSegment(timeline, slide)
  return segment !== undefined && segment.script.trim() === ''
}

function introDetail(analyst: AnalystRow | null, lang: Lang): string {
  const language = LANGUAGE_NAMES[lang]
  if (!analyst) return 'The analyst of this deal is unknown'
  switch (analyst.intros[lang]?.status) {
    case 'processing':
      return `The ${language} face-cam intro of ${analyst.name} is still processing`
    case 'failed':
      return `The ${language} face-cam intro of ${analyst.name} could not be processed. Record it again.`
    default:
      return `${analyst.name} has no ${language} face-cam intro`
  }
}

export function recomputeReviewReasons(
  deal: Pick<DealRow, 'reviewReasons'>,
  timeline: Timeline,
  analyst: AnalystRow | null,
): ReviewReason[] {
  const missingLines = linesMissing(timeline)
  const modelFailed = deal.reviewReasons.filter(
    (reason) =>
      reason.code === 'model_failed' &&
      (reason.slot === LINES_SLOT ? missingLines : reason.slide !== undefined && scriptEmpty(timeline, reason.slide)),
  )
  const reasons: ReviewReason[] = []
  if (missingLines) {
    reasons.push({ code: 'lines_missing', slide: 3, detail: 'Slide 3 needs two or three lines about the company' })
  }
  if (buyersRemoved(timeline)) {
    reasons.push({ code: 'slide_empty', slide: 5, detail: 'Slide 5 has no buyers. Restore at least one buyer in the list.' })
  }
  for (const segment of scriptSegments(timeline)) {
    if (segment.script.trim() !== '') continue
    if (modelFailed.some((reason) => reason.slide === segment.slide && reason.slot !== LINES_SLOT)) continue
    reasons.push({ code: 'script_missing', slide: segment.slide, detail: `Slide ${segment.slide} has no script` })
  }
  for (const segment of scriptSegments(timeline)) {
    if (!segment.scriptCheck || segment.script.trim() === '') continue
    reasons.push({
      code: 'script_check',
      slide: segment.slide,
      detail: `Slide ${segment.slide}: the ${CHECK_CAUSES[segment.slide] ?? 'names or the data of the slide'} changed after you wrote the script. Check that the script matches the slide. Then edit it, or click "Script is correct".`,
    })
  }
  reasons.push(...modelFailed, ...checkTimelineSlots(timeline))
  for (const segment of scriptSegments(timeline)) {
    if (segment.audio.status !== 'failed') continue
    reasons.push({
      code: 'audio_failed',
      slide: segment.slide,
      detail: `Slide ${segment.slide}: ${segment.audio.error ?? 'the audio could not be made'}`,
    })
  }
  if (!readyIntro(analyst, timeline.language)) {
    reasons.push({ code: 'no_intro', slide: 1, detail: introDetail(analyst, timeline.language) })
  }
  if (!analyst?.voiceId) {
    const detail = !analyst
      ? 'The analyst of this deal is unknown'
      : analyst.cloneStatus === 'pending'
        ? `The voice clone of ${analyst.name} is not ready yet`
        : `${analyst.name} has no voice clone`
    reasons.push({ code: 'no_voice', detail })
  }
  return reasons
}

function reasonKey(reason: ReviewReason): string {
  return `${reason.code}:${reason.slide ?? ''}:${reason.slot ?? ''}`
}

export function recordReviewReasons(db: Db, dealId: number, reasons: readonly ReviewReason[], now: Date = new Date()): DealRow {
  return transaction(db, () => {
    const deal = requireDeal(db, dealId)
    const merged = new Map(deal.reviewReasons.map((reason) => [reasonKey(reason), reason]))
    for (const reason of reasons) merged.set(reasonKey(reason), reason)
    return updateDeal(db, dealId, { reviewReasons: [...merged.values()] }, now)
  })
}

function jobVersion(job: AnyJob): number | null {
  if (job.type === 'write-script') return job.payload.version
  if (job.type === 'audio' && job.payload.kind === 'slides') return job.payload.version
  if (job.type === 'render' && job.payload.kind === 'deal') return job.payload.version
  return null
}

function latestJob<T extends JobType>(jobs: readonly AnyJob[], type: T, version: number): Job<T> | undefined {
  return jobs.filter((job): job is Job<T> & AnyJob => job.type === type && jobVersion(job) === version).at(-1)
}

function unresolvedWrite(job: Job<'write-script'>, timeline: Timeline): boolean {
  return job.payload.slides.some((slide) => scriptEmpty(timeline, slide)) || (job.payload.lines && linesMissing(timeline))
}

export function videoBasis(deal: Pick<DealRow, 'country' | 'snapshot'>): VideoBasis {
  const { website, businessId, nace } = deal.snapshot
  return { website, businessId: deal.country === 'FI' ? businessId : null, nace }
}

function listText(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`
}

function remakeReason(deal: DealRow, timeline: Timeline): ReviewReason | null {
  const basis = timeline.basis
  if (!basis || deal.publishedVersion !== null) return null
  const current = videoBasis(deal)
  const fields = (Object.keys(BASIS_NAMES) as (keyof VideoBasis)[]).filter((key) => current[key] !== basis[key])
  const language = resolveLanguage({
    country: deal.country,
    siteLanguage: deal.scrape?.siteLanguage ?? null,
    linkedinLanguages: deal.snapshot.linkedinLanguages,
  })
  const causes: string[] = []
  if (fields.length > 0) {
    causes.push(`The ${listText(fields.map((key) => BASIS_NAMES[key]))} changed in Pipedrive after the tool made the video.`)
  }
  if (language !== timeline.language) {
    causes.push(
      `The contact person changed in Pipedrive. The video must now be in ${LANGUAGE_NAMES[language]}, not in ${LANGUAGE_NAMES[timeline.language]}.`,
    )
  }
  if (causes.length === 0) return null
  return {
    code: 'remake_needed',
    detail: `${causes.join(' ')} The video still uses the old data. Click "Make the video again": the tool reads the website, the figures and the buyers again and writes new scripts.`,
  }
}

function remakeKey(dealId: number, version: number): string {
  return `${jobKeys.scrape(dealId)}:remake-${version}`
}

function remakePending(jobs: readonly AnyJob[], dealId: number, row: TimelineRow | null): boolean {
  return row !== null && jobs.some((job) => job.key === remakeKey(dealId, row.version + 1))
}

function assertNotRemaking(db: Db, dealId: number): void {
  if (remakePending(jobsForDeal(db, dealId, ['scrape']), dealId, newestTimeline(db, dealId))) {
    throw new DomainError(409, 'The tool is making the video again. Wait until the new version is ready.')
  }
}

interface PipelineState {
  deal: DealRow
  row: TimelineRow | null
  analyst: AnalystRow | null
  jobs: AnyJob[]
  reasons: ReviewReason[]
}

function pipelineState(db: Db, deal: DealRow, finishedJobId: number | null = null): PipelineState {
  const jobs = jobsForDeal(db, deal.id, PIPELINE_JOBS)
  const row = newestTimeline(db, deal.id)
  const analyst = getAnalyst(db, deal.analystId)
  if (!row || remakePending(jobs, deal.id, row)) return { deal, row, analyst, jobs, reasons: [] }
  const remake = remakeReason(deal, row.timeline)
  if (row.renderStatus !== 'pending') return { deal, row, analyst, jobs, reasons: remake ? [remake] : [] }
  const writing = new Set<number>(
    jobs.flatMap((job) =>
      job.type === 'write-script' &&
      job.id !== finishedJobId &&
      job.payload.version === row.version &&
      (job.status === 'queued' || job.status === 'running')
        ? job.payload.slides
        : [],
    ),
  )
  const reasons = [
    ...(remake ? [remake] : []),
    ...recomputeReviewReasons(deal, row.timeline, analyst).filter(
      (reason) => !(reason.code === 'script_missing' && reason.slide !== undefined && writing.has(reason.slide)),
    ),
  ]
  const audio = latestJob(jobs, 'audio', row.version)
  if (audio?.status === 'failed' && !reasons.some((reason) => reason.code === 'audio_failed')) {
    reasons.push({ code: 'audio_failed', detail: audio.error ?? 'The audio job failed' })
  }
  return { deal, row, analyst, jobs, reasons }
}

interface ScriptWrite {
  slides: ScriptSlideNumber[]
  lines: boolean
  key: string
}

function scriptWrite(state: PipelineState, approved: boolean): ScriptWrite | null {
  const { deal, row, jobs, reasons } = state
  if (!row) return null
  const slides = new Set<ScriptSlideNumber>()
  let lines = false
  const company = companyVariables(row.timeline)
  const linesFailed = reasons.some((reason) => reason.code === 'model_failed' && reason.slot === LINES_SLOT)
  if (!approved && deal.scrape?.ok && company?.linesSource !== 'analyst' && linesMissing(row.timeline) && !linesFailed) {
    slides.add(3)
    lines = true
  }
  if (approved) {
    for (const reason of reasons) {
      if (reason.code === 'script_missing' && reason.slide !== undefined && reason.slide !== 1) slides.add(reason.slide)
    }
  }
  if (slides.size === 0) return null
  const list = [...slides].sort((a, b) => a - b)
  const key = jobKeys.writeScript(deal.id, row.version, list)
  return jobs.some((job) => job.key === key) ? null : { slides: list, lines, key }
}

export function withCurrentIntro(timeline: Timeline, analyst: AnalystRow | null): Timeline {
  const intro = readyIntro(analyst, timeline.language)
  if (!intro || !analyst) return timeline
  return {
    ...timeline,
    segments: timeline.segments.map((segment) =>
      segment.template === 'facecam'
        ? {
            ...segment,
            durationS: intro.durationS,
            variables: { ...segment.variables, videoFile: intro.file, analystName: analyst.name, transcript: intro.transcript },
          }
        : segment,
    ),
  }
}

function nextStep(db: Db, state: PipelineState, now: Date): AdvanceAction {
  const { deal, row, analyst, jobs, reasons } = state
  if (deal.scrape === null) {
    const job = jobs.filter((item) => item.type === 'scrape').at(-1)
    if (job?.status === 'failed') return 'failed'
    if (job) return 'wait'
    enqueue(db, 'scrape', jobKeys.scrape(deal.id), { dealId: deal.id }, { now })
    return 'scrape'
  }
  if (!row || remakePending(jobs, deal.id, row)) {
    const version = row ? row.version + 1 : 1
    const key = jobKeys.writeScript(deal.id, version, SCRIPT_SLIDES)
    const job = jobs.find((item) => item.key === key)
    if (job?.status === 'failed') return 'failed'
    if (job) return 'wait'
    enqueue(db, 'write-script', key, { dealId: deal.id, version, slides: [...SCRIPT_SLIDES], lines: deal.scrape.ok }, { now })
    return 'write-script'
  }
  switch (row.renderStatus) {
    case 'rendering':
    case 'failed': {
      const render = latestJob(jobs, 'render', row.version)?.status
      if (render === 'queued' || render === 'running') return 'wait'
      return render === 'failed' || row.renderStatus === 'failed' ? 'failed' : 'wait'
    }
    case 'rendered':
      if (deal.publishedVersion === row.version) return 'none'
      if (row.approvedAt === null) return 'review'
      if (reasons.length > 0) return 'blocked'
      publish(db, deal.id, row.version, now)
      return 'publish'
    case 'pending':
      break
  }
  if (jobs.some((job) => job.status === 'queued')) return 'wait'
  const write = latestJob(jobs, 'write-script', row.version)
  if (write?.status === 'failed' && unresolvedWrite(write, row.timeline)) return 'failed'
  const next = scriptWrite(state, row.approvedAt !== null)
  if (next) {
    enqueue(db, 'write-script', next.key, { dealId: deal.id, version: row.version, slides: next.slides, lines: next.lines }, { now })
    return 'write-script'
  }
  if (reasons.length > 0) return 'blocked'
  const segments = scriptSegments(row.timeline)
  if (segments.some((segment) => segment.script.trim() === '')) return 'wait'
  if (segments.some((segment) => segment.audio.status !== 'ok')) {
    const run = jobs.filter((job) => job.type === 'audio' && jobVersion(job) === row.version).length + 1
    enqueue(db, 'audio', jobKeys.audioSlides(deal.id, row.version, run), { kind: 'slides', dealId: deal.id, version: row.version }, { now })
    return 'audio'
  }
  updateVersion(db, deal.id, row.version, (timeline) => withCurrentIntro(timeline, analyst))
  markRenderStatus(db, deal.id, row.version, 'rendering', now)
  enqueue(db, 'render', jobKeys.render(deal.id, row.version), { kind: 'deal', dealId: deal.id, version: row.version }, { now })
  return 'render'
}

function sameReasons(a: readonly ReviewReason[], b: readonly ReviewReason[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export interface AdvanceOptions {
  finishedJobId?: number
}

export function advance(db: Db, dealId: number, now: Date = new Date(), options: AdvanceOptions = {}): AdvanceResult {
  return transaction(db, () => {
    const deal = requireDeal(db, dealId)
    if (deal.status === 'lost' || isExpired(deal, now)) {
      return { action: 'none', status: deal.status, reasons: deal.reviewReasons }
    }
    const state = pipelineState(db, deal, options.finishedJobId ?? null)
    const action = nextStep(db, state, now)
    const current = requireDeal(db, dealId)
    const reasons = action === 'write-script' ? pipelineState(db, current, options.finishedJobId ?? null).reasons : state.reasons
    const patch: DealPatch = {}
    if (!sameReasons(current.reviewReasons, reasons)) patch.reviewReasons = reasons
    const status = current.publishedVersion === null ? UNPUBLISHED_STATUS[action] : null
    if (status !== null && status !== current.status) patch.status = status
    const updated = Object.keys(patch).length > 0 ? updateDeal(db, dealId, patch, now) : current
    return { action, status: updated.status, reasons: updated.reviewReasons }
  })
}

export function advanceAnalystDeals(db: Db, analystId: number, now: Date = new Date()): number[] {
  const blocked = listDeals(db, { analystId }).filter((deal) =>
    deal.reviewReasons.some((reason) => reason.code === 'no_intro' || reason.code === 'no_voice'),
  )
  for (const deal of blocked) advance(db, deal.id, now)
  return blocked.map((deal) => deal.id)
}

export function publish(db: Db, dealId: number, version: number, now: Date = new Date()): DealRow {
  return transaction(db, () => {
    const deal = requireDeal(db, dealId)
    if (deal.status === 'lost') throw new DomainError(409, 'The deal is lost')
    const row = getTimeline(db, dealId, version)
    if (!row || row.renderStatus !== 'rendered') throw new DomainError(409, `Version ${version} is not rendered`)
    if (row.approvedAt === null) throw new DomainError(409, `Version ${version} is not approved`)
    const first = deal.publishedVersion === null
    updateDeal(
      db,
      dealId,
      {
        publishedVersion: version,
        publishedAt: deal.publishedAt ?? nowIso(now),
        expiresAt: linkExpiresAt(deal, now, deal.expiryDays),
      },
      now,
    )
    if (first) moveStage(db, dealId, 'link_sent', { now, data: { version } })
    return requireDeal(db, dealId)
  })
}

function assertEditable(deal: DealRow, now: Date): void {
  if (deal.status === 'lost') throw new DomainError(409, 'The deal is lost')
  if (isExpired(deal, now)) throw new DomainError(409, 'The link has expired')
}

export interface ApproveResult {
  deal: DealRow
  timeline: TimelineRow
  advance: AdvanceResult
}

export function approveDeal(db: Db, dealId: number, now: Date = new Date()): ApproveResult {
  return transaction(db, () => {
    const deal = requireDeal(db, dealId)
    assertEditable(deal, now)
    const state = pipelineState(db, deal)
    const row = state.row
    if (!row) throw new DomainError(409, 'The video has no script yet', [])
    assertNotRemaking(db, dealId)
    const writable = new Set<number>(row.renderStatus === 'pending' ? (scriptWrite(state, true)?.slides ?? []) : [])
    const remaining = state.reasons.filter(
      (reason) => !(reason.code === 'script_missing' && reason.slide !== undefined && writable.has(reason.slide)),
    )
    if (remaining.length > 0) throw new DomainError(409, 'The video has open review reasons', remaining)
    setApproval(db, dealId, row.version, true, now)
    const result = advance(db, dealId, now)
    return { deal: requireDeal(db, dealId), timeline: newestTimeline(db, dealId) ?? row, advance: result }
  })
}

function buyerCandidates(db: Db, dealId: number): BuyerSlideItem[] {
  const seen = new Map<string, BuyerSlideItem>()
  for (const row of listTimelines(db, dealId)) {
    const variables = scriptSegment(row.timeline, 5)?.variables
    if (variables?.template !== 'buyers') continue
    for (const buyer of variables.candidates ?? variables.buyers) if (!seen.has(buyer.id)) seen.set(buyer.id, buyer)
  }
  return [...seen.values()]
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function markNewAudio(segment: SlideSegment): void {
  segment.audio = { ...segment.audio, status: segment.script.trim() === '' ? 'missing' : 'new', error: null }
}

function slideContentChanged(segment: SlideSegment): void {
  if (segment.scriptSource === 'analyst') {
    segment.scriptCheck = true
  } else {
    segment.script = ''
    segment.scriptSource = null
  }
  markNewAudio(segment)
}

interface TimelineEdit {
  timeline: Timeline
  changed: boolean
  rewrite: ScriptSlideNumber[]
}

function editTimeline(timeline: Timeline, patch: ReviewPatch, buyers: () => BuyerSlideItem[]): TimelineEdit {
  const next = structuredClone(timeline)
  const contentChanged: SlideSegment[] = []
  if (patch.lines !== undefined) {
    const segment = scriptSegment(next, 3)
    if (segment?.variables.template !== 'your-company') throw new DomainError(400, 'Slide 3 has no company lines')
    const lines = filledLines(patch.lines)
    if (!sameList(lines, segment.variables.lines)) {
      segment.variables = { ...segment.variables, lines, linesSource: 'analyst' }
      contentChanged.push(segment)
    }
  }
  if (patch.removedBuyers !== undefined) {
    const segment = scriptSegment(next, 5)
    if (segment?.variables.template !== 'buyers') throw new DomainError(400, 'Slide 5 has no buyer list')
    const removed = new Set(patch.removedBuyers)
    const candidates = segment.variables.candidates ?? buyers()
    const kept: BuyersVariables['buyers'] = candidates.filter((buyer) => !removed.has(buyer.id))
    if (!sameList(kept.map((buyer) => buyer.id), segment.variables.buyers.map((buyer) => buyer.id))) {
      segment.variables = { ...segment.variables, buyers: kept, candidates }
      contentChanged.push(segment)
    }
  }
  for (const segment of contentChanged) slideContentChanged(segment)
  let changed = contentChanged.length > 0
  for (const [key, text] of Object.entries(patch.scripts ?? {})) {
    if (text === undefined) continue
    const slide = Number(key)
    if (slide === 1) throw new DomainError(400, 'Slide 1 is the face-cam intro and has no script')
    const segment = scriptSegment(next, slide)
    if (!segment) throw new DomainError(400, `Slide ${key} does not exist`)
    const script = text.trim()
    if (segment.scriptCheck) {
      delete segment.scriptCheck
      changed = true
    }
    if (script === segment.script) continue
    segment.script = script
    segment.scriptSource = script === '' ? null : 'analyst'
    markNewAudio(segment)
    changed = true
  }
  const rewrite = contentChanged.filter((segment) => segment.scriptSource !== 'analyst').map((segment) => segment.slide)
  return { timeline: next, changed, rewrite }
}

export interface PipedriveRefresh {
  company: string
  analyst: AnalystRow
  ownerChanged: boolean
  ownerFirstName: { from: string; to: string }
}

function newOwner(timeline: Timeline, analyst: AnalystRow): void {
  const intro = readyIntro(analyst, timeline.language)
  for (const segment of timeline.segments) {
    if (segment.template !== 'facecam') {
      markNewAudio(segment)
      continue
    }
    segment.variables = { ...segment.variables, videoFile: intro?.file ?? '', transcript: intro?.transcript ?? null }
    segment.durationS = intro?.durationS ?? 0
  }
}

function mentions(script: string, name: string): boolean {
  const text = name.trim().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return text !== '' && new RegExp(`(?<![\\p{L}\\p{N}])${text}`, 'u').test(script)
}

function refreshed(timeline: Timeline, refresh: PipedriveRefresh): TimelineEdit {
  const names = { company: refresh.company, analystName: refresh.analyst.name }
  const next = structuredClone(timeline)
  const replaced = new Set<string>()
  const rename = (current: string, name: string): string => {
    if (current !== name) replaced.add(current)
    return name
  }
  for (const segment of next.segments) {
    const variables = segment.variables
    if (variables.template === 'facecam') variables.analystName = rename(variables.analystName, names.analystName)
    if (variables.template === 'your-company') variables.company = rename(variables.company, names.company)
    if (variables.template === 'book-meeting') {
      variables.company = rename(variables.company, names.company)
      variables.analystName = rename(variables.analystName, names.analystName)
    }
  }
  const variablesChanged = replaced.size > 0
  if (refresh.ownerFirstName.from !== refresh.ownerFirstName.to) replaced.add(refresh.ownerFirstName.from)
  const stale = scriptSegments(next).filter((segment) => [...replaced].some((name) => mentions(segment.script, name)))
  for (const segment of stale) slideContentChanged(segment)
  if (refresh.ownerChanged) newOwner(next, refresh.analyst)
  const rewrite = stale.filter((segment) => segment.scriptSource !== 'analyst').map((segment) => segment.slide)
  return { timeline: next, changed: variablesChanged || stale.length > 0 || refresh.ownerChanged, rewrite }
}

function enqueueRewrite(db: Db, dealId: number, version: number, slides: ScriptSlideNumber[], now: Date): void {
  const run = jobsForDeal(db, dealId, ['write-script']).filter((job) => jobVersion(job) === version).length + 1
  const key = `${jobKeys.writeScript(dealId, version, slides)}:edit-${run}`
  enqueue(db, 'write-script', key, { dealId, version, slides, lines: false }, { now })
}

function withoutTimes(timeline: Timeline): Timeline {
  return { ...timeline, segments: timeline.segments.map((segment) => ({ ...segment, startS: null, endS: null })) }
}

function savePendingEdit(db: Db, dealId: number, version: number, timeline: Timeline, now: Date): void {
  updateVersion(db, dealId, version, () => timeline)
  setApproval(db, dealId, version, false, now)
  const audio = latestJob(jobsForDeal(db, dealId, ['audio']), 'audio', version)
  if (audio?.status === 'failed') retryJob(db, audio.id, now)
}

export interface ReviewPatchResult {
  deal: DealRow
  timeline: TimelineRow | null
  newVersion: boolean
  advance: AdvanceResult
}

export function applyReviewPatch(db: Db, dealId: number, patch: ReviewPatch, now: Date = new Date()): ReviewPatchResult {
  return transaction(db, () => {
    assertEditable(requireDeal(db, dealId), now)
    if (patch.scripts !== undefined || patch.lines !== undefined || patch.removedBuyers !== undefined) assertNotRemaking(db, dealId)
    const dealPatch: DealPatch = {}
    if (patch.customQuestions !== undefined) {
      dealPatch.customQuestions = patch.customQuestions.map((question) => ({ id: question.id, text: question.text.trim() }))
    }
    if (patch.pageLanguage !== undefined) dealPatch.pageLanguage = patch.pageLanguage
    if (patch.removedBuyers !== undefined) dealPatch.removedBuyers = [...new Set(patch.removedBuyers)]
    if (Object.keys(dealPatch).length > 0) updateDeal(db, dealId, dealPatch, now)
    if (patch.expiryDays !== undefined) setExpiry(db, dealId, patch.expiryDays, now)

    let newVersion = false
    const editsTimeline = patch.scripts !== undefined || patch.lines !== undefined || patch.removedBuyers !== undefined
    const row = newestTimeline(db, dealId)
    if (editsTimeline && !row && (patch.scripts !== undefined || patch.lines !== undefined)) {
      throw new DomainError(409, 'The video has no script yet')
    }
    if (editsTimeline && row) {
      const edit = editTimeline(row.timeline, patch, () => buyerCandidates(db, dealId))
      let version = row.version
      if (edit.changed && row.renderStatus === 'pending') {
        savePendingEdit(db, dealId, row.version, edit.timeline, now)
      } else if (edit.changed) {
        version = createVersion(db, dealId, withoutTimes(edit.timeline), now).version
        newVersion = true
      }
      if (edit.rewrite.length > 0) enqueueRewrite(db, dealId, version, edit.rewrite, now)
    }
    const result = advance(db, dealId, now)
    return { deal: requireDeal(db, dealId), timeline: newestTimeline(db, dealId), newVersion, advance: result }
  })
}

export function refreshFromPipedrive(db: Db, dealId: number, refresh: PipedriveRefresh, now: Date = new Date()): boolean {
  return transaction(db, () => {
    const row = newestTimeline(db, dealId)
    if (!row || (row.approvedAt !== null && !refresh.ownerChanged)) return false
    if (remakePending(jobsForDeal(db, dealId, ['scrape']), dealId, row)) return false
    const edit = refreshed(row.timeline, refresh)
    if (!edit.changed) return false
    let version = row.version
    if (row.renderStatus === 'pending') savePendingEdit(db, dealId, row.version, edit.timeline, now)
    else version = createVersion(db, dealId, withoutTimes(edit.timeline), now).version
    if (edit.rewrite.length > 0) enqueueRewrite(db, dealId, version, edit.rewrite, now)
    advance(db, dealId, now)
    return true
  })
}

export interface RemakeResult {
  deal: DealRow
  advance: AdvanceResult
}

export function remakeDeal(db: Db, dealId: number, now: Date = new Date()): RemakeResult {
  return transaction(db, () => {
    const deal = requireDeal(db, dealId)
    assertEditable(deal, now)
    if (deal.publishedVersion !== null) throw new DomainError(409, 'The link is published. The video stays as it is.')
    const row = newestTimeline(db, dealId)
    if (!row) throw new DomainError(409, 'The video has no script yet')
    assertNotRemaking(db, dealId)
    updateDeal(db, dealId, { scrape: null, reviewReasons: [] }, now)
    enqueue(db, 'scrape', remakeKey(dealId, row.version + 1), { dealId }, { now })
    const result = advance(db, dealId, now)
    return { deal: requireDeal(db, dealId), advance: result }
  })
}

export function dealPipelineState(db: Db, dealId: number): { running: boolean; step: JobType | null } {
  const active = jobsForDeal(db, dealId, PIPELINE_JOBS).filter((job) => job.status === 'queued' || job.status === 'running')
  const current = active.find((job) => job.status === 'running') ?? active[0]
  return { running: active.length > 0, step: current?.type ?? null }
}
