import type { SlideSegment, Timeline } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { getAnalyst } from '../../src/domain/analysts.ts'
import { LINK_CODE_PATTERN, requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { DomainError } from '../../src/domain/errors.ts'
import { ensureDeal } from '../../src/domain/ensure.ts'
import type { EnsureProviders } from '../../src/domain/ensure.ts'
import { advance } from '../../src/domain/pipeline.ts'
import { createVersion, getTimeline, markRenderStatus, newestTimeline, setApproval, updateVersion } from '../../src/domain/timelines.ts'
import { jobsForDeal } from '../../src/queue/index.ts'
import type { PipedriveDeal, PipedriveOrg, PipedrivePerson, PipedriveUser } from '../../src/providers/types.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { T0, later, makeTimeline, readyIntroFor } from './fixtures.ts'

let t: TempDb

const users: PipedriveUser[] = [
  { id: 1, name: 'Aino Analyst', email: 'aino@mergero.test', active: true, timeZone: 'Europe/Helsinki' },
  { id: 2, name: 'Former Analyst', email: null, active: false, timeZone: null },
]
const deal: PipedriveDeal = { id: 40, title: 'Acme deal', ownerId: 1, personId: 30, orgId: 20, stageId: null, status: 'open', videoUrl: null }
const person: PipedrivePerson = {
  id: 30,
  name: 'Henrik Lindholm',
  firstName: null,
  jobTitle: ' CEO ',
  email: 'Henrik@Acme.test',
  phone: null,
}
const org: PipedriveOrg = { id: 20, name: 'Acme Ab', website: 'https://acme.test', countryCode: 'fi', businessId: '1234567-8', nace: '49.41' }

function providers(
  overrides: {
    deal?: PipedriveDeal | null
    org?: PipedriveOrg | null
    person?: PipedrivePerson
    users?: PipedriveUser[]
    linkedin?: () => Promise<unknown>
  } = {},
) {
  const mocks = {
    listUsers: vi.fn(async () => overrides.users ?? users),
    getDeal: vi.fn(async () => (overrides.deal === undefined ? deal : overrides.deal)),
    getPerson: vi.fn(async () => overrides.person ?? person),
    getOrg: vi.fn(async () => (overrides.org === undefined ? org : overrides.org)),
    linkedin: vi.fn(overrides.linkedin ?? (async () => ({ languages: ['sv', 'en'], staffCount: 38 }))),
  }
  const value: EnsureProviders = {
    pipedrive: { listUsers: mocks.listUsers, getDeal: mocks.getDeal, getPerson: mocks.getPerson, getOrg: mocks.getOrg },
    linkedin: { get: mocks.linkedin as EnsureProviders['linkedin']['get'] },
  }
  return { value, mocks }
}

beforeEach(() => {
  t = tempDb()
})

afterEach(() => {
  t.close()
})

async function domainError(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof DomainError) return error
    throw error
  }
  throw new Error('expected a DomainError')
}

describe('ensureDeal', () => {
  it('reads Pipedrive and LinkedIn, syncs the owner, makes the draft deal and adds the scrape job', async () => {
    const { value, mocks } = providers()
    const { deal: row, created } = await ensureDeal(t.db, value, 40, T0)
    expect(created).toBe(true)
    expect(mocks.linkedin).toHaveBeenCalledWith({ email: 'Henrik@Acme.test', name: 'Henrik Lindholm', company: 'Acme Ab' })
    expect(getAnalyst(t.db, 1)?.name).toBe('Aino Analyst')
    expect(getAnalyst(t.db, 2)).toBeNull()
    expect(row).toMatchObject({
      id: 40,
      analystId: 1,
      status: 'draft',
      language: 'sv',
      pageLanguage: 'sv',
      country: 'FI',
      expiryDays: 30,
      scrape: null,
      publishedVersion: null,
      reviewReasons: [],
    })
    expect(row.linkCode).toMatch(LINK_CODE_PATTERN)
    expect(row.snapshot).toEqual({
      pipedriveDealId: 40,
      title: 'Acme deal',
      company: 'Acme Ab',
      website: 'https://acme.test',
      businessId: '1234567-8',
      nace: '49.41',
      country: 'FI',
      ownerName: 'Henrik Lindholm',
      ownerFirstName: 'Henrik',
      ownerRole: 'CEO',
      ownerEmail: 'Henrik@Acme.test',
      ownerPhone: null,
      personId: 30,
      orgId: 20,
      staffCount: 38,
      linkedinLanguages: ['sv', 'en'],
      readAt: T0.toISOString(),
    })
    expect(jobsForDeal(t.db, 40).map((job) => job.key)).toEqual(['scrape:40'])
  })

  it('returns the same row on a second call and reads Pipedrive again while the deal is not published', async () => {
    const { value, mocks } = providers()
    const first = await ensureDeal(t.db, value, 40, T0)
    expect(first).toMatchObject({ created: true, refreshed: true, refreshError: null })
    const second = await ensureDeal(t.db, value, 40, later(5))
    expect(second).toEqual({ deal: first.deal, created: false, refreshed: true, refreshError: null })
    expect(mocks.getDeal).toHaveBeenCalledTimes(2)
    expect(mocks.linkedin).toHaveBeenCalledTimes(1)
    expect(jobsForDeal(t.db, 40)).toHaveLength(1)

    updateDeal(t.db, 40, { publishedVersion: 1 }, T0)
    expect(await ensureDeal(t.db, value, 40, later(6))).toMatchObject({ created: false, refreshed: false, refreshError: null })
    expect(mocks.getDeal).toHaveBeenCalledTimes(2)
  })

  it('writes the new Pipedrive names into the newest version that is not approved', async () => {
    const longName = `Acme ${'Konepaja '.repeat(12)}Oy`
    await ensureDeal(t.db, providers({ org: { ...org, name: longName } }).value, 40, T0)
    const slide = (timeline: Timeline | undefined, n: number) => timeline?.segments.find((segment) => segment.slide === n) as SlideSegment
    createVersion(t.db, 40, makeTimeline(40), T0)
    updateVersion(t.db, 40, 1, (timeline) => {
      Object.assign(slide(timeline, 3).variables, { company: longName })
      Object.assign(slide(timeline, 4), { script: `The figures of ${longName}.` })
      Object.assign(slide(timeline, 8), { script: `Book a meeting about ${longName}.`, scriptSource: 'analyst' })
      Object.assign(slide(timeline, 8).variables, { company: longName })
      return timeline
    })
    expect(advance(t.db, 40, T0).reasons).toContainEqual(expect.objectContaining({ code: 'text_too_long', slot: 'your-company.company' }))

    const renamedUsers = [{ ...(users[0] as PipedriveUser), name: 'Aino Uusi' }, users[1] as PipedriveUser]
    const renamed = providers({ org: { ...org, name: 'Acme Konepaja' }, users: renamedUsers })
    const result = await ensureDeal(t.db, renamed.value, 40, later(5))
    expect(result).toMatchObject({ refreshed: true, refreshError: null, deal: { snapshot: { company: 'Acme Konepaja' } } })
    expect(getAnalyst(t.db, 1)?.name).toBe('Aino Uusi')
    const v1 = getTimeline(t.db, 40, 1)?.timeline
    expect(newestTimeline(t.db, 40)?.version).toBe(1)
    expect(slide(v1, 3).variables).toMatchObject({ company: 'Acme Konepaja' })
    expect(slide(v1, 8).variables).toMatchObject({ company: 'Acme Konepaja', analystName: 'Aino Uusi' })
    expect(v1?.segments[0]?.variables).toMatchObject({ analystName: 'Aino Uusi' })
    expect(slide(v1, 4)).toMatchObject({ script: '', scriptSource: null })
    expect(slide(v1, 8)).toMatchObject({ script: `Book a meeting about ${longName}.`, scriptCheck: true })
    expect(requireDeal(t.db, 40).reviewReasons).toContainEqual(
      expect.objectContaining({ code: 'script_check', slide: 8, detail: expect.stringContaining('the names or the data of the slide changed') }),
    )
    expect(jobsForDeal(t.db, 40, ['write-script']).map((job) => job.key)).toEqual(['write-script:40:1:4:edit-1'])
    expect(requireDeal(t.db, 40).reviewReasons.map((reason) => reason.code)).not.toContain('text_too_long')

    markRenderStatus(t.db, 40, 1, 'rendered', later(6))
    await ensureDeal(t.db, providers({ org: { ...org, name: 'Acme' }, users: renamedUsers }).value, 40, later(7))
    expect(getTimeline(t.db, 40, 1)?.timeline).toEqual(v1)
    expect(slide(getTimeline(t.db, 40, 2)?.timeline, 3).variables).toMatchObject({ company: 'Acme' })

    setApproval(t.db, 40, 2, true, later(8))
    await ensureDeal(t.db, providers({ org: { ...org, name: 'Acme Group' }, users: renamedUsers }).value, 40, later(9))
    expect(requireDeal(t.db, 40).snapshot.company).toBe('Acme Group')
    expect(newestTimeline(t.db, 40)?.version).toBe(2)
    expect(slide(getTimeline(t.db, 40, 2)?.timeline, 3).variables).toMatchObject({ company: 'Acme' })
  })

  it('moves an unpublished deal to a new Pipedrive owner, with the new name, intro and voice in the newest version', async () => {
    const bo: PipedriveUser = { id: 3, name: 'Bo Berg', email: 'bo@mergero.test', active: true, timeZone: 'Europe/Stockholm' }
    const team = [...users, bo]
    const slide = (timeline: Timeline | undefined, n: number) => timeline?.segments.find((segment) => segment.slide === n) as SlideSegment
    await ensureDeal(t.db, providers({ users: team }).value, 40, T0)
    createVersion(t.db, 40, makeTimeline(40, { audio: 'ok', scripts: { 2: 'I am Aino Analyst from Mergero.' } }), T0)
    setApproval(t.db, 40, 1, true, T0)

    const moved = await ensureDeal(t.db, providers({ deal: { ...deal, ownerId: 3 }, users: team }).value, 40, later(5))
    expect(moved).toMatchObject({ refreshed: true, refreshError: null, deal: { analystId: 3 } })
    const v1 = newestTimeline(t.db, 40)
    expect(v1).toMatchObject({ version: 1, approvedAt: null })
    expect(v1?.timeline.segments[0]).toMatchObject({ durationS: 0, variables: { analystName: 'Bo Berg', videoFile: '', transcript: null } })
    expect(slide(v1?.timeline, 8).variables).toMatchObject({ analystName: 'Bo Berg', company: 'Acme Ab' })
    expect(slide(v1?.timeline, 2)).toMatchObject({ script: '', scriptSource: null, audio: { status: 'missing' } })
    for (const n of [3, 4, 5, 6, 7, 8]) expect(slide(v1?.timeline, n).audio.status).toBe('new')
    expect(requireDeal(t.db, 40).reviewReasons).toEqual([
      { code: 'no_intro', slide: 1, detail: 'Bo Berg has no Finnish face-cam intro' },
      { code: 'no_voice', detail: 'Bo Berg has no voice clone' },
    ])
    expect(jobsForDeal(t.db, 40, ['write-script']).map((job) => job.key)).toEqual(['write-script:40:1:2:edit-1'])

    const unknown = await ensureDeal(t.db, providers({ deal: { ...deal, ownerId: 99 }, users: team }).value, 40, later(6))
    expect(unknown.refreshError).toBe('The deal owner 99 is not a Pipedrive user')
    expect(requireDeal(t.db, 40).analystId).toBe(3)

    sql(t.db, 'UPDATE analysts SET intros = ? WHERE id = 1').run(JSON.stringify({ fi: readyIntroFor('fi') }))
    markRenderStatus(t.db, 40, 1, 'rendered', later(7))
    const back = await ensureDeal(t.db, providers({ users: team }).value, 40, later(8))
    expect(back.deal.analystId).toBe(1)
    expect(getTimeline(t.db, 40, 1)?.timeline).toEqual(v1?.timeline)
    const v2 = getTimeline(t.db, 40, 2)?.timeline
    expect(v2?.segments[0]).toMatchObject({ durationS: 31.2, variables: { analystName: 'Aino Analyst', videoFile: 'analysts/10/intro-fi.mp4' } })
    expect(slide(v2, 8).variables).toMatchObject({ analystName: 'Aino Analyst' })
    expect(slide(v2, 4).audio.status).toBe('new')
  })

  it('rewrites each script that greets the old contact person, and asks for a new video in the language of the new person', async () => {
    const slide = (timeline: Timeline | undefined, n: number) => timeline?.segments.find((segment) => segment.slide === n) as SlideSegment
    await ensureDeal(t.db, providers().value, 40, T0)
    const scripts = { 2: 'Tack för att du tittar, Henrik.', 3: 'Henriks företag Acme Ab.', 5: 'Köpare som passar Acme Ab.', 7: 'Hej Henrik, dina data är trygga.' }
    createVersion(t.db, 40, { ...makeTimeline(40, { language: 'sv', scripts }), basis: { website: 'https://acme.test', businessId: '1234567-8', nace: '49.41' } }, T0)
    updateVersion(t.db, 40, 1, (timeline) => {
      Object.assign(slide(timeline, 7), { scriptSource: 'analyst' })
      return timeline
    })
    expect(advance(t.db, 40, T0).reasons.map((reason) => reason.code)).not.toContain('remake_needed')

    const jussi: PipedrivePerson = { id: 31, name: 'Jussi Virtanen', firstName: null, jobTitle: 'CEO', email: 'jussi@acme.test', phone: null }
    const next = providers({ person: jussi, linkedin: async () => ({ languages: ['fi'], staffCount: 38 }) })
    const result = await ensureDeal(t.db, next.value, 40, later(5))
    expect(result.deal.snapshot).toMatchObject({ ownerFirstName: 'Jussi', personId: 31, linkedinLanguages: ['fi'] })
    const v1 = getTimeline(t.db, 40, 1)?.timeline
    expect(slide(v1, 2)).toMatchObject({ script: '', scriptSource: null })
    expect(slide(v1, 3)).toMatchObject({ script: '', scriptSource: null })
    expect(slide(v1, 5)).toMatchObject({ script: 'Köpare som passar Acme Ab.', scriptSource: 'model' })
    expect(slide(v1, 7)).toMatchObject({ script: 'Hej Henrik, dina data är trygga.', scriptCheck: true })
    expect(jobsForDeal(t.db, 40, ['write-script']).map((job) => job.key)).toEqual(['write-script:40:1:2-3:edit-1'])
    const reasons = requireDeal(t.db, 40).reviewReasons
    expect(reasons[0]).toEqual({
      code: 'remake_needed',
      detail:
        'The contact person changed in Pipedrive. The video must now be in Finnish, not in Swedish. The video still uses the old data. Click "Make the video again": the tool reads the website, the figures and the buyers again and writes new scripts.',
    })
    expect(reasons).toContainEqual(expect.objectContaining({ code: 'script_check', slide: 7 }))
  })

  it('stores the remake reason when only the NACE code changed in Pipedrive', async () => {
    const acme = { ...org, name: 'Acme Oy' }
    await ensureDeal(t.db, providers({ org: acme }).value, 40, T0)
    createVersion(t.db, 40, { ...makeTimeline(40, { language: 'sv' }), basis: { website: 'https://acme.test', businessId: '1234567-8', nace: '49.41' } }, T0)
    advance(t.db, 40, T0)
    const before = newestTimeline(t.db, 40)?.timeline
    await ensureDeal(t.db, providers({ org: { ...acme, nace: '33.12' } }).value, 40, later(5))
    expect(newestTimeline(t.db, 40)?.timeline).toEqual(before)
    expect(requireDeal(t.db, 40).reviewReasons[0]).toMatchObject({
      code: 'remake_needed',
      detail: expect.stringContaining('The NACE code changed in Pipedrive after the tool made the video.'),
    })
  })

  it('keeps the deal and reports the error when Pipedrive cannot be read again', async () => {
    const created = await ensureDeal(t.db, providers().value, 40, T0)
    const broken = providers()
    broken.mocks.getDeal.mockRejectedValueOnce(new Error('socket hang up'))
    expect(await ensureDeal(t.db, broken.value, 40, later(5))).toEqual({
      deal: created.deal,
      created: false,
      refreshed: false,
      refreshError: 'Pipedrive could not be read. Try again later.',
    })
    const noOrg = await ensureDeal(t.db, providers({ org: null }).value, 40, later(6))
    expect(noOrg.refreshError).toBe('The Pipedrive deal 40 has no organization. Add the organization in Pipedrive.')
    expect(requireDeal(t.db, 40)).toEqual(created.deal)
  })

  it('uses the expiry default of a known analyst and syncs an inactive owner', async () => {
    const at = T0.toISOString()
    sql(t.db, 'INSERT INTO analysts (id, name, default_expiry_days, created_at, updated_at) VALUES (1, ?, 14, ?, ?)').run('Aino', at, at)
    const { value, mocks } = providers()
    expect((await ensureDeal(t.db, value, 40, T0)).deal.expiryDays).toBe(14)
    expect(mocks.listUsers).not.toHaveBeenCalled()

    const inactive = providers({ deal: { ...deal, id: 41, ownerId: 2 } })
    expect((await ensureDeal(t.db, inactive.value, 41, T0)).deal.analystId).toBe(2)
    expect(getAnalyst(t.db, 2)?.name).toBe('Former Analyst')
  })

  it('goes on without LinkedIn data when the source fails', async () => {
    const { value } = providers({
      linkedin: async () => {
        throw new Error('seed file broken')
      },
    })
    const { deal: row } = await ensureDeal(t.db, value, 40, T0)
    expect(row.snapshot.linkedinLanguages).toEqual([])
    expect(row.language).toBe('fi')
  })

  it('refuses a missing deal with 404 and a deal without organization or country with 409', async () => {
    expect((await domainError(ensureDeal(t.db, providers({ deal: null }).value, 40, T0))).status).toBe(404)
    expect((await domainError(ensureDeal(t.db, providers({ deal: { ...deal, status: 'deleted' } }).value, 40, T0))).status).toBe(404)
    expect((await domainError(ensureDeal(t.db, providers({ org: null }).value, 40, T0))).status).toBe(409)
    const noCountry = await domainError(ensureDeal(t.db, providers({ org: { ...org, countryCode: null } }).value, 40, T0))
    expect(noCountry.status).toBe(409)
    expect(noCountry.message).toContain('no country')
    const unknownOwner = await domainError(ensureDeal(t.db, providers({ deal: { ...deal, ownerId: 99 } }).value, 40, T0))
    expect(unknownOwner.status).toBe(409)
    expect(sql<{ n: number }>(t.db, 'SELECT COUNT(*) AS n FROM deals').get()?.n).toBe(0)
  })
})
