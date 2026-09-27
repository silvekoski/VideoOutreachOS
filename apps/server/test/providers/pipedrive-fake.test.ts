import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProviderError } from '../../src/providers/errors.ts'
import { FakePipedriveClient } from '../../src/providers/pipedrive-fake.ts'

const seed = {
  users: [
    { id: 1, name: 'Aino Analyst', email: 'aino@mergero.test', active: true, timeZone: 'Europe/Helsinki' },
    { id: 2, name: 'Jonas Analyst', email: null, active: true },
  ],
  organizations: [
    { id: 20, name: 'Acme Oy', website: 'https://acme.test', countryCode: 'FI', businessId: '1234567-8', nace: '25.62' },
  ],
  persons: [
    { id: 30, name: 'Matti Meikäläinen', firstName: 'Matti', jobTitle: 'CEO', email: 'matti@acme.test', phone: null, orgId: 20 },
  ],
  deals: [
    { id: 40, title: 'Acme Oy', ownerId: 1, personId: 30, orgId: 20, stage: null, status: 'open', videoUrl: null },
    { id: 41, title: 'Beta AB', ownerId: 1, personId: null, orgId: null, stage: 'opened', status: 'open', videoUrl: 'https://tool.test/deals/41' },
    { id: 42, title: 'Gamma AS', ownerId: 1, personId: null, orgId: null, stage: null, status: 'lost', videoUrl: null },
  ],
  activities: [],
  notes: [],
}

let dir: string
let file: string
let seedFile: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mergero-fake-pipedrive-'))
  file = path.join(dir, 'data', 'fake-pipedrive.json')
  seedFile = path.join(dir, 'seed.json')
  await writeFile(seedFile, JSON.stringify(seed))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('FakePipedriveClient', () => {
  it('copies the seed on first use and reads it like the real client', async () => {
    const pipedrive = new FakePipedriveClient({ file, seedFile })
    expect(pipedrive.mode).toBe('fake')
    expect(await pipedrive.listUsers()).toEqual([seed.users[0], { ...seed.users[1], timeZone: null }])
    expect(await pipedrive.getDeal(40)).toEqual({
      id: 40,
      title: 'Acme Oy',
      ownerId: 1,
      personId: 30,
      orgId: 20,
      stageId: null,
      status: 'open',
      videoUrl: null,
    })
    expect((await pipedrive.getDeal(41))?.stageId).toBe(2)
    expect(await pipedrive.getDeal(99)).toBeNull()
    expect(await pipedrive.getPerson(30)).toEqual({
      id: 30,
      name: 'Matti Meikäläinen',
      firstName: 'Matti',
      jobTitle: 'CEO',
      email: 'matti@acme.test',
      phone: null,
    })
    expect(await pipedrive.getOrg(20)).toEqual(seed.organizations[0])
    expect((await pipedrive.listOpenDeals()).map((deal) => deal.id)).toEqual([40, 41])
    expect(JSON.parse(await readFile(file, 'utf8')).deals).toHaveLength(3)
    expect(pipedrive.dealUrl(40)).toBe('https://fake-pipedrive.invalid/deal/40')
  })

  it('writes each change to the file, and a new instance reads the changes', async () => {
    const pipedrive = new FakePipedriveClient({ file, seedFile })
    await pipedrive.setVideoField(40, 'https://tool.test/deals/40')
    await pipedrive.moveStage(40, 'form_sent')
    await pipedrive.setDealFields(40, {
      revenueRange: '1000000-3000000 EUR',
      watchTimeS: 95,
      stopSlide: undefined,
      watchPerSlide: '1: 31 s, 2: 18 s',
      linkChannel: 'WhatsApp',
    })
    const activityId = await pipedrive.addActivity({
      dealId: 40,
      ownerId: 1,
      type: 'call',
      subject: 'Call Matti',
      note: null,
      dueDate: '2026-09-28',
    })
    await pipedrive.markActivityDone(activityId)
    const noteId = await pipedrive.upsertNote(40, null, '<p>Brief</p>')
    expect(await pipedrive.upsertNote(40, noteId, '<p>Brief v2</p>')).toBe(noteId)
    await pipedrive.setLost(41, 'Not selling now')

    const reloaded = new FakePipedriveClient({ file, seedFile })
    expect(await reloaded.getDeal(40)).toMatchObject({ videoUrl: 'https://tool.test/deals/40', stageId: 3 })
    expect(await reloaded.getDeal(41)).toMatchObject({ status: 'lost' })
    expect((await reloaded.listOpenDeals()).map((deal) => deal.id)).toEqual([40])

    const stored = JSON.parse(await readFile(file, 'utf8'))
    expect(stored.deals[0]).toMatchObject({
      stage: 'form_sent',
      fields: { revenueRange: '1000000-3000000 EUR', watchTimeS: 95, watchPerSlide: '1: 31 s, 2: 18 s', linkChannel: 'WhatsApp' },
    })
    expect(stored.deals[0].fields).not.toHaveProperty('stopSlide')
    expect(stored.deals[1]).toMatchObject({ status: 'lost', lostReason: 'Not selling now' })
    expect(stored.activities).toEqual([
      expect.objectContaining({ id: activityId, dealId: 40, type: 'call', subject: 'Call Matti', done: true }),
    ])
    expect(stored.notes).toEqual([expect.objectContaining({ id: noteId, dealId: 40, content: '<p>Brief v2</p>' })])
    expect(JSON.parse(await readFile(seedFile, 'utf8'))).toEqual(seed)
    expect((await readdir(path.dirname(file))).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('serializes parallel writes', async () => {
    const pipedrive = new FakePipedriveClient({ file, seedFile })
    const ids = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        pipedrive.addActivity({ dealId: 40, ownerId: 1, type: 'task', subject: `Task ${n}`, note: null, dueDate: '2026-09-28' }),
      ),
    )
    expect(ids.sort()).toEqual([1, 2, 3, 4, 5])
    expect(JSON.parse(await readFile(file, 'utf8')).activities).toHaveLength(5)
  })

  it('throws a non-retryable 404 error for an unknown deal or activity', async () => {
    const pipedrive = new FakePipedriveClient({ file, seedFile })
    const error = await pipedrive.moveStage(99, 'opened').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ status: 404, retryable: false })
    await expect(pipedrive.markActivityDone(7)).rejects.toMatchObject({ status: 404 })
    expect(await pipedrive.addActivity({ dealId: 40, ownerId: 1, type: 'task', subject: 'After error', note: null, dueDate: '2026-09-28' })).toBe(1)
  })

  it('gives a clear error when the seed file is missing', async () => {
    const pipedrive = new FakePipedriveClient({ file, seedFile: path.join(dir, 'missing.json') })
    await expect(pipedrive.listUsers()).rejects.toThrow(/seed file is missing/)
  })
})
