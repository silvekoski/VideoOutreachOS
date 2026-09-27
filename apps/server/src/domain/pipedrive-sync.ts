import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import type { PipedriveChange, PipedriveClient } from '../providers/types.ts'
import { ensureDeal } from './ensure.ts'
import type { EnsureProviders } from './ensure.ts'
import { advance } from './pipeline.ts'
import { followPipedriveStatus } from './stages.ts'

export interface SyncProviders extends EnsureProviders {
  pipedrive: EnsureProviders['pipedrive'] & Pick<PipedriveClient, 'listChanges'>
}

export interface SyncOutcome {
  dealIds: number[]
  prospects: boolean
}

interface LocalDeal {
  id: number
  person_id: number | null
  org_id: number | null
}

export async function applyPipedriveChanges(
  db: Db,
  providers: EnsureProviders,
  changes: readonly PipedriveChange[],
  now: Date = new Date(),
): Promise<SyncOutcome> {
  const local = sql<LocalDeal>(
    db,
    `SELECT id, json_extract(snapshot, '$.personId') AS person_id, json_extract(snapshot, '$.orgId') AS org_id FROM deals`,
  ).all()
  const known = new Set(local.map((deal) => deal.id))
  const remote = new Map<number, NonNullable<PipedriveChange['deal']>>()
  const touched = new Set<number>()
  let prospects = false
  for (const change of changes) {
    if (change.type === 'deal') {
      if (!known.has(change.id)) {
        prospects = true
        continue
      }
      touched.add(change.id)
      if (change.deal) remote.set(change.id, change.deal)
      continue
    }
    prospects = true
    const column = change.type === 'person' ? 'person_id' : 'org_id'
    for (const deal of local) if (deal[column] === change.id) touched.add(deal.id)
  }

  for (const dealId of touched) {
    const state = remote.get(dealId)
    if (state && followPipedriveStatus(db, dealId, state.status, state.lostReason, now) === 'draft') advance(db, dealId, now)
    if (state?.status !== 'deleted') await ensureDeal(db, providers, dealId, now)
  }
  return { dealIds: [...touched], prospects }
}
