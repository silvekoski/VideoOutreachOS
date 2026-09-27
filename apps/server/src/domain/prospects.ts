import type { GenerateResultDto, ProspectDto } from '@mergero/shared'
import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { log } from '../log.ts'
import type { PipedriveClient } from '../providers/types.ts'
import { ensureDeal } from './ensure.ts'
import type { EnsureProviders } from './ensure.ts'
import { DomainError } from './errors.ts'

export const PROSPECT_LIMIT = 50

export async function listProspects(
  db: Db,
  pipedrive: Pick<PipedriveClient, 'listOpenDeals' | 'getOrg' | 'getPerson'>,
  analystId: number,
): Promise<ProspectDto[]> {
  const known = new Set(sql<{ id: number }>(db, 'SELECT id FROM deals').all().map((row) => row.id))
  const deals = (await pipedrive.listOpenDeals())
    .filter((deal) => deal.ownerId === analystId && !known.has(deal.id))
    .slice(0, PROSPECT_LIMIT)
  return Promise.all(
    deals.map(async (deal) => {
      const [org, person] = await Promise.all([
        deal.orgId === null ? null : pipedrive.getOrg(deal.orgId),
        deal.personId === null ? null : pipedrive.getPerson(deal.personId),
      ])
      return {
        dealId: deal.id,
        company: org?.name.trim() || deal.title,
        ownerName: person?.name.trim() || null,
        ownerRole: person?.jobTitle?.trim() || null,
        country: org?.countryCode?.trim().toUpperCase() || null,
      }
    }),
  )
}

export async function generateVideos(db: Db, providers: EnsureProviders, dealIds: number[], now: Date): Promise<GenerateResultDto[]> {
  const results: GenerateResultDto[] = []
  for (const dealId of new Set(dealIds)) {
    try {
      const { created } = await ensureDeal(db, providers, dealId, now)
      results.push({ dealId, created, error: null })
    } catch (error) {
      if (!(error instanceof DomainError)) log.warn('a video could not be started', { dealId, error })
      const message = error instanceof DomainError ? error.message : 'Pipedrive could not be read. Try again later.'
      results.push({ dealId, created: false, error: message })
    }
  }
  return results
}
