import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { updateContact } from '../../src/domain/contact.ts'
import { requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { ensureDeal } from '../../src/domain/ensure.ts'
import { listEvents } from '../../src/domain/events.ts'
import { applyPipedriveChanges } from '../../src/domain/pipedrive-sync.ts'
import { FakePipedriveClient } from '../../src/providers/pipedrive-fake.ts'
import { jobsForDeal } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { T0 } from './fixtures.ts'

let t: TempDb
let store: string
let pipedrive: FakePipedriveClient

const seed = {
  users: [{ id: 1, name: 'Aino Analyst', email: 'aino@mergero.test', active: true, timeZone: 'Europe/Helsinki' }],
  organizations: [
    { id: 20, name: 'Acme Oy', website: 'https://acme.test/', countryCode: 'FI', businessId: '1234567-8', nace: '25.62' },
    { id: 21, name: 'Other Oy', website: null, countryCode: 'FI', businessId: null, nace: '49.41' },
  ],
  persons: [
    { id: 30, name: 'Henrik Lindholm', firstName: 'Henrik', jobTitle: 'CEO', email: 'henrik@example.com', phone: null, orgId: 20 },
    { id: 31, name: 'Other Person', firstName: 'Other', jobTitle: 'CEO', email: null, phone: null, orgId: 21 },
  ],
  deals: [
    { id: 40, title: 'Acme Oy', ownerId: 1, personId: 30, orgId: 20, stage: null, status: 'open', videoUrl: null },
    { id: 41, title: 'Other Oy', ownerId: 1, personId: 31, orgId: 21, stage: null, status: 'open', videoUrl: null },
  ],
}

const linkedin = { get: async () => null }

function edit(change: (json: typeof seed) => void): void {
  const json = JSON.parse(readFileSync(store, 'utf8')) as typeof seed
  change(json)
  writeFileSync(store, JSON.stringify(json))
}

async function sync() {
  const { changes } = await pipedrive.listChanges('2026-09-26 12:00:00')
  return applyPipedriveChanges(t.db, { pipedrive, linkedin }, changes, T0)
}

beforeEach(async () => {
  t = tempDb()
  store = path.join(t.dir, 'pipedrive.json')
  writeFileSync(store, JSON.stringify(seed))
  pipedrive = new FakePipedriveClient({ file: store, seedFile: store })
  await ensureDeal(t.db, { pipedrive, linkedin }, 40, T0)
  await pipedrive.listChanges('2026-09-26 12:00:00')
})

afterEach(() => {
  t.close()
})

describe('applyPipedriveChanges', () => {
  it('reads a local deal again when its organization or person changes', async () => {
    edit((json) => {
      json.organizations[0]!.name = 'Acme Group Oy'
      json.persons[0]!.email = 'henrik.lindholm@example.com'
    })
    expect(await sync()).toEqual({ dealIds: [40], prospects: true })
    expect(requireDeal(t.db, 40).snapshot).toMatchObject({ company: 'Acme Group Oy', ownerEmail: 'henrik.lindholm@example.com' })
  })

  it('asks for new prospects when a deal that is not in the tool changes', async () => {
    edit((json) => {
      json.deals[1]!.title = 'Other Oy, new title'
    })
    expect(await sync()).toEqual({ dealIds: [], prospects: true })
  })

  it('follows lost, won and open from Pipedrive and writes nothing back', async () => {
    edit((json) => {
      Object.assign(json.deals[0]!, { status: 'lost', lostReason: 'No interest' })
    })
    await sync()
    expect(requireDeal(t.db, 40)).toMatchObject({ status: 'lost', lostReason: 'No interest' })

    edit((json) => {
      json.deals[0]!.status = 'won'
    })
    await sync()
    expect(requireDeal(t.db, 40).status).toBe('won')

    edit((json) => {
      json.deals[0]!.status = 'open'
    })
    await sync()
    expect(requireDeal(t.db, 40)).toMatchObject({ status: 'draft', lostReason: null, lostAt: null })
    expect(listEvents(t.db, 40).map((event) => event.type)).toEqual(['lost', 'won', 'reopened'])
    expect(jobsForDeal(t.db, 40, ['pipedrive-write'])).toEqual([])
  })

  it('gives a published deal back its stage when it opens again', async () => {
    updateDeal(t.db, 40, { publishedVersion: 1, status: 'opened', firstOpenAt: T0.toISOString() }, T0)
    edit((json) => {
      json.deals[0]!.status = 'lost'
    })
    await sync()
    edit((json) => {
      json.deals[0]!.status = 'open'
    })
    await sync()
    expect(requireDeal(t.db, 40).status).toBe('opened')
  })

  it('marks a deleted deal as lost and does not read it again', async () => {
    edit((json) => {
      json.deals[0]!.status = 'deleted'
    })
    await sync()
    expect(requireDeal(t.db, 40)).toMatchObject({ status: 'lost', lostReason: 'Deleted in Pipedrive' })
  })
})

describe('updateContact', () => {
  it('writes the change to Pipedrive, then reads the deal again', async () => {
    await updateContact(t.db, { pipedrive, linkedin }, 40, { company: 'Acme Group Oy', ownerPhone: '+358 40 123 4567' }, T0)
    const json = JSON.parse(readFileSync(store, 'utf8')) as typeof seed
    expect(json.organizations[0]!.name).toBe('Acme Group Oy')
    expect(json.persons[0]!.phone).toBe('+358 40 123 4567')
    expect(requireDeal(t.db, 40).snapshot).toMatchObject({ company: 'Acme Group Oy', ownerPhone: '+358 40 123 4567' })
  })

  it('keeps the names of a published deal and takes only the contact details', async () => {
    updateDeal(t.db, 40, { publishedVersion: 1 }, T0)
    await updateContact(t.db, { pipedrive, linkedin }, 40, { ownerName: 'Henrik L', ownerEmail: 'new@example.com' }, T0)
    expect(requireDeal(t.db, 40).snapshot).toMatchObject({ ownerName: 'Henrik Lindholm', ownerEmail: 'new@example.com' })
  })
})
