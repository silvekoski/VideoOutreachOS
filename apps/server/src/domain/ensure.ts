import { isClosedStatus, resolveLanguage } from '@mergero/shared'
import type { DealSnapshot } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import type { DealPatch, DealRow } from '../db/rows.ts'
import { log } from '../log.ts'
import { enqueue, jobKeys } from '../queue/index.ts'
import type {
  LinkedInProfile,
  LinkedInSource,
  PipedriveClient,
  PipedriveDeal,
  PipedriveOrg,
  PipedrivePerson,
} from '../providers/types.ts'
import { getAnalyst, syncAnalysts } from './analysts.ts'
import { getDeal, newLinkCode, requireDeal, updateDeal } from './deals.ts'
import { DomainError } from './errors.ts'
import { advance, refreshFromPipedrive } from './pipeline.ts'

const COUNTRY_CODE = /^[A-Z]{2}$/u

export interface EnsureProviders {
  pipedrive: Pick<PipedriveClient, 'getDeal' | 'getPerson' | 'getOrg' | 'listUsers'>
  linkedin: LinkedInSource
}

export interface EnsureResult {
  deal: DealRow
  created: boolean
  refreshed: boolean
  refreshError: string | null
}

interface PipedriveRead {
  source: PipedriveDeal
  person: PipedrivePerson | null
  org: PipedriveOrg
  country: string
}

async function linkedInProfile(
  linkedin: LinkedInSource,
  person: PipedrivePerson | null,
  company: string,
): Promise<LinkedInProfile | null> {
  if (!person) return null
  try {
    return await linkedin.get({ email: person.email, name: person.name, company })
  } catch (error) {
    log.warn('LinkedIn data could not be read, the deal uses no LinkedIn data', { personId: person.id, error })
    return null
  }
}

function firstName(person: PipedrivePerson | null): string {
  return person?.firstName?.trim() || person?.name.trim().split(/\s+/u)[0] || ''
}

function snapshotOf(
  dealId: number,
  title: string,
  org: PipedriveOrg,
  country: string,
  person: PipedrivePerson | null,
  profile: LinkedInProfile | null,
  readAt: string,
): DealSnapshot {
  return {
    pipedriveDealId: dealId,
    title,
    company: org.name.trim(),
    website: org.website?.trim() || null,
    businessId: org.businessId?.trim() || null,
    nace: org.nace?.trim() || null,
    country,
    ownerName: person?.name.trim() ?? '',
    ownerFirstName: firstName(person),
    ownerRole: person?.jobTitle?.trim() || null,
    ownerEmail: person?.email?.trim() || null,
    ownerPhone: person?.phone?.trim() || null,
    personId: person?.id ?? null,
    orgId: org.id,
    staffCount: profile?.staffCount ?? null,
    linkedinLanguages: profile?.languages ?? [],
    readAt,
  }
}

async function readPipedrive(pipedrive: EnsureProviders['pipedrive'], dealId: number): Promise<PipedriveRead> {
  const source = await pipedrive.getDeal(dealId)
  if (!source || source.status === 'deleted') throw new DomainError(404, `Pipedrive has no deal ${dealId}`)
  const [person, org] = await Promise.all([
    source.personId === null ? null : pipedrive.getPerson(source.personId),
    source.orgId === null ? null : pipedrive.getOrg(source.orgId),
  ])
  if (!org) throw new DomainError(409, `The Pipedrive deal ${dealId} has no organization. Add the organization in Pipedrive.`)
  const country = org.countryCode?.trim().toUpperCase() ?? ''
  if (!COUNTRY_CODE.test(country)) {
    throw new DomainError(409, `The organization ${org.name} has no country in Pipedrive. Add the address country in Pipedrive.`)
  }
  return { source, person, org, country }
}

function sameSnapshot(a: DealSnapshot, b: DealSnapshot): boolean {
  return JSON.stringify({ ...a, readAt: '' }) === JSON.stringify({ ...b, readAt: '' })
}

// A published video keeps its names, so a published or closed deal takes only new contact details of the same person.
async function refreshContactDetails(providers: EnsureProviders, db: Db, deal: DealRow, now: Date): Promise<boolean> {
  const personId = deal.snapshot.personId
  const person = personId === null ? null : await providers.pipedrive.getPerson(personId)
  if (!person) return false
  const snapshot: DealSnapshot = {
    ...deal.snapshot,
    ownerRole: person.jobTitle?.trim() || null,
    ownerEmail: person.email?.trim() || null,
    ownerPhone: person.phone?.trim() || null,
    readAt: nowIso(now),
  }
  if (sameSnapshot(snapshot, deal.snapshot)) return false
  updateDeal(db, deal.id, { snapshot }, now)
  return true
}

async function refreshDeal(db: Db, providers: EnsureProviders, deal: DealRow, now: Date): Promise<EnsureResult> {
  const kept: EnsureResult = { deal, created: false, refreshed: false, refreshError: null }
  try {
    if (deal.publishedVersion !== null || isClosedStatus(deal.status)) {
      const refreshed = await refreshContactDetails(providers, db, deal, now)
      return { ...kept, deal: requireDeal(db, deal.id), refreshed }
    }
    const { source, person, org } = await readPipedrive(providers.pipedrive, deal.id)
    await syncAnalysts(db, providers.pipedrive, { ensureIds: [source.ownerId], now })
    const analyst = getAnalyst(db, source.ownerId)
    if (!analyst) throw new DomainError(409, `The deal owner ${source.ownerId} is not a Pipedrive user`)
    const ownerChanged = analyst.id !== deal.analystId
    const profile =
      person?.id === deal.snapshot.personId
        ? { staffCount: deal.snapshot.staffCount, languages: deal.snapshot.linkedinLanguages }
        : await linkedInProfile(providers.linkedin, person, org.name)
    const snapshot = snapshotOf(deal.id, source.title, org, deal.country, person, profile, nowIso(now))
    transaction(db, () => {
      const patch: DealPatch = {}
      if (!sameSnapshot(snapshot, deal.snapshot)) patch.snapshot = snapshot
      if (ownerChanged) patch.analystId = analyst.id
      if (Object.keys(patch).length > 0) updateDeal(db, deal.id, patch, now)
      const ownerFirstName = { from: deal.snapshot.ownerFirstName, to: snapshot.ownerFirstName }
      const edited = refreshFromPipedrive(db, deal.id, { company: snapshot.company, analyst, ownerChanged, ownerFirstName }, now)
      if (!edited && Object.keys(patch).length > 0) advance(db, deal.id, now)
    })
    if (ownerChanged) log.info('deal owner changed in Pipedrive', { dealId: deal.id, from: deal.analystId, to: analyst.id })
    return { deal: requireDeal(db, deal.id), created: false, refreshed: true, refreshError: null }
  } catch (error) {
    log.warn('the deal could not be read from Pipedrive again, it keeps its data', { dealId: deal.id, error })
    const refreshError = error instanceof DomainError ? error.message : 'Pipedrive could not be read. Try again later.'
    return { ...kept, refreshError }
  }
}

export async function ensureDeal(db: Db, providers: EnsureProviders, dealId: number, now: Date = new Date()): Promise<EnsureResult> {
  const existing = getDeal(db, dealId)
  if (existing) return refreshDeal(db, providers, existing, now)

  const { pipedrive } = providers
  const { source, person, org, country } = await readPipedrive(pipedrive, dealId)
  let analyst = getAnalyst(db, source.ownerId)
  if (!analyst) {
    await syncAnalysts(db, pipedrive, { ensureIds: [source.ownerId], now })
    analyst = getAnalyst(db, source.ownerId)
  }
  if (!analyst) throw new DomainError(409, `The deal owner ${source.ownerId} is not a Pipedrive user`)

  const profile = await linkedInProfile(providers.linkedin, person, org.name)
  const at = nowIso(now)
  const snapshot = snapshotOf(dealId, source.title, org, country, person, profile, at)
  const language = resolveLanguage({ country, siteLanguage: null, linkedinLanguages: snapshot.linkedinLanguages })
  const analystId = analyst.id
  const expiryDays = analyst.defaultExpiryDays

  const created = transaction(db, () => {
    const inserted = sql(
      db,
      `INSERT INTO deals (id, analyst_id, status, link_code, language, page_language, country, snapshot, expiry_days, created_at, updated_at)
       VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    ).run(dealId, analystId, newLinkCode(), language, language, country, JSON.stringify(snapshot), expiryDays, at, at)
    if (inserted.changes === 0) return false
    enqueue(db, 'scrape', jobKeys.scrape(dealId), { dealId }, { now })
    return true
  })
  if (created) log.info('deal created', { dealId, analystId, country, language })
  return { deal: requireDeal(db, dealId), created, refreshed: true, refreshError: null }
}
