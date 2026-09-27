import type { ContactPatch } from '@mergero/shared'
import type { Db } from '../db/index.ts'
import type { PipedriveClient } from '../providers/types.ts'
import { requireDeal } from './deals.ts'
import { ensureDeal } from './ensure.ts'
import type { EnsureProviders, EnsureResult } from './ensure.ts'
import { DomainError } from './errors.ts'

export interface ContactProviders extends EnsureProviders {
  pipedrive: EnsureProviders['pipedrive'] & Pick<PipedriveClient, 'updateOrg' | 'updatePerson'>
}

function defined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>
}

// Pipedrive stays the one store of contact data: the edit goes to Pipedrive, then the deal reads Pipedrive again.
export async function updateContact(
  db: Db,
  providers: ContactProviders,
  dealId: number,
  patch: ContactPatch,
  now: Date = new Date(),
): Promise<EnsureResult> {
  const { orgId, personId } = requireDeal(db, dealId).snapshot
  const org = defined({ name: patch.company, website: patch.website, businessId: patch.businessId, nace: patch.nace })
  const person = defined({ name: patch.ownerName, jobTitle: patch.ownerRole, email: patch.ownerEmail, phone: patch.ownerPhone })
  if (Object.keys(org).length > 0) {
    if (orgId === null) throw new DomainError(409, 'The deal has no organization in Pipedrive. Add the organization in Pipedrive.')
    await providers.pipedrive.updateOrg(orgId, org)
  }
  if (Object.keys(person).length > 0) {
    if (personId === null) throw new DomainError(409, 'The deal has no contact person in Pipedrive. Add the person in Pipedrive.')
    await providers.pipedrive.updatePerson(personId, person)
  }
  return ensureDeal(db, providers, dealId, now)
}
