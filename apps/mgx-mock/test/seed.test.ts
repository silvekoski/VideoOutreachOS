import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { mgxSeedSchema } from '../src/seed.ts'
import { listClosedDeals, nace2, searchBuyers } from '../src/tools.ts'
import { seedDir } from './test-server.ts'

interface PipedriveSeed {
  users: { id: number; name: string; email: string; active: boolean }[]
  organizations: { id: number; name: string; website: string | null; countryCode: string; businessId: string | null; nace: string | null }[]
  persons: { id: number; name: string; firstName: string; jobTitle: string; email: string; phone: string | null; orgId: number }[]
  deals: { id: number; title: string; ownerId: number; personId: number; orgId: number; stage: string | null; status: string; videoUrl: string | null }[]
  activities: unknown[]
  notes: unknown[]
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(seedDir, file), 'utf8')) as T

const mgx = mgxSeedSchema.parse(readJson('mgx.json'))
const pipedrive = readJson<PipedriveSeed>('pipedrive.json')
const financials = readJson<{ companies: Record<string, { revenue: number; profit: number; fiscalYear: number }> }>('asiakastieto.json')
const linkedin = readJson<{ profiles: Record<string, { languages: string[]; staffCount: number | null }> }>('linkedin.json')
const sequence = readJson<{ deals: { n: number; sentAt: string; opened: boolean; meetingBooked: boolean }[] }>('text-sequence.json')

const COUNTRY_LANGUAGES: Record<string, string[]> = { FI: ['fi', 'sv'], SE: ['sv'], NO: ['nb'], DK: ['da'], DE: ['de'], AT: ['de'], CH: ['de'], IS: ['en'] }
const ANALYST_BY_COUNTRY: Record<string, number> = { FI: 1001, SE: 1001, DE: 1002, AT: 1002, CH: 1002, NO: 1003, DK: 1003, IS: 1003 }

const finnishOrgs = pipedrive.organizations.filter((org) => org.countryCode === 'FI')

function validFinnishBusinessId(id: string): boolean {
  const match = /^(\d{7})-(\d)$/.exec(id)
  if (!match?.[1] || !match[2]) return false
  const weights = [7, 9, 10, 5, 8, 4, 2]
  const remainder = [...match[1]].reduce((sum, digit, i) => sum + Number(digit) * (weights[i] ?? 0), 0) % 11
  return remainder !== 1 && (remainder === 0 ? 0 : 11 - remainder) === Number(match[2])
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    return statSync(file).isDirectory() ? filesUnder(file) : [file]
  })
}

const nace2Of = (org: PipedriveSeed['organizations'][number]) => nace2(org.nace ?? '') ?? ''
const dealCount = (org: PipedriveSeed['organizations'][number]) =>
  mgx.closedDeals.filter((deal) => nace2(deal.nace) === nace2Of(org)).length

describe('mgx.json', () => {
  test('has 25 or more buyers and about 30 closed deals', () => {
    expect(mgx.buyers.length).toBeGreaterThanOrEqual(25)
    expect(mgx.closedDeals.length).toBeGreaterThanOrEqual(27)
    expect(mgx.closedDeals.length).toBeLessThanOrEqual(33)
  })

  test('each buyer has a public name, and 3 or more buyers are featured', () => {
    expect(mgx.buyers.every((buyer) => buyer.name_public)).toBe(true)
    expect(mgx.buyers.filter((buyer) => buyer.featured).length).toBeGreaterThanOrEqual(3)
  })

  test('each buyer has an SVG or PNG logo named after its ID', () => {
    for (const buyer of mgx.buyers) {
      expect(buyer.logo, buyer.id).toMatch(new RegExp(`^${buyer.id}\\.(svg|png)$`))
      const file = readFileSync(path.join(seedDir, 'logos', buyer.logo ?? ''))
      if (buyer.logo?.endsWith('.svg')) expect(file.toString('utf8'), buyer.id).toMatch(/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/)
      else expect(file.subarray(1, 4).toString('latin1'), buyer.id).toBe('PNG')
    }
  })

  test('each seed logo belongs to a buyer', () => {
    expect(readdirSync(path.join(seedDir, 'logos')).sort()).toEqual(mgx.buyers.map((buyer) => buyer.logo).sort())
  })

  test('each buyer website is an https address', () => {
    for (const buyer of mgx.buyers) expect(new URL(buyer.website ?? '').protocol, buyer.id).toBe('https:')
  })

  test('closed deals are from 2019 to 2026 with profit multiples from 3.0 to 9.0', () => {
    for (const deal of mgx.closedDeals) {
      expect(deal.year, deal.id).toBeGreaterThanOrEqual(2019)
      expect(deal.year, deal.id).toBeLessThanOrEqual(2026)
      expect(deal.profitMultiple, deal.id).toBeGreaterThanOrEqual(3)
      expect(deal.profitMultiple, deal.id).toBeLessThanOrEqual(9)
    }
  })
})

describe('pipedrive.json', () => {
  test('has three active analysts with the IDs 1001 to 1003', () => {
    expect(pipedrive.users.map((user) => user.id)).toEqual([1001, 1002, 1003])
    expect(pipedrive.users.every((user) => user.active)).toBe(true)
  })

  test('has 30 organizations: 9 FI, 4 SE, 3 NO, 3 DK, 4 DE, 2 AT, 3 CH, 2 IS', () => {
    const counts: Record<string, number> = {}
    for (const org of pipedrive.organizations) counts[org.countryCode] = (counts[org.countryCode] ?? 0) + 1
    expect(counts).toEqual({ FI: 9, SE: 4, NO: 3, DK: 3, DE: 4, AT: 2, CH: 3, IS: 2 })
  })

  test('organization, person and deal IDs are unique', () => {
    for (const items of [pipedrive.organizations, pipedrive.persons, pipedrive.deals]) {
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length)
    }
  })

  test('the Finnish business ID check accepts valid IDs and rejects others', () => {
    expect(validFinnishBusinessId('0712834-9')).toBe(true)
    expect(validFinnishBusinessId('0712834-8')).toBe(false)
    expect(validFinnishBusinessId('712834-9')).toBe(false)
  })

  test('each Finnish company has a business ID with a valid check digit', () => {
    for (const org of finnishOrgs) expect(validFinnishBusinessId(org.businessId ?? ''), org.name).toBe(true)
  })

  test('each organization has a NACE code like "25.62"', () => {
    for (const org of pipedrive.organizations) expect(org.nace, org.name).toMatch(/^\d{2}\.\d{2}$/)
  })

  test('exactly one Finnish company has no website, and each website is a public https address', () => {
    expect(finnishOrgs.filter((org) => org.website === null)).toHaveLength(1)
    expect(pipedrive.organizations.filter((org) => org.website === null)).toHaveLength(1)
    for (const org of pipedrive.organizations.filter((item) => item.website !== null)) {
      const url = new URL(org.website ?? '')
      expect(url.protocol, org.name).toBe('https:')
      expect(url.hostname, org.name).toMatch(/\.[a-z]{2,}$/)
      expect(url.hostname, org.name).not.toMatch(/^(localhost|127\.|localtest\.me$)/)
    }
  })

  test('each deal points to an existing person, organization and user, and the person works there', () => {
    for (const deal of pipedrive.deals) {
      const person = pipedrive.persons.find((item) => item.id === deal.personId)
      expect(person, deal.title).toBeDefined()
      expect(pipedrive.organizations.some((org) => org.id === deal.orgId), deal.title).toBe(true)
      expect(pipedrive.users.some((user) => user.id === deal.ownerId), deal.title).toBe(true)
      expect(person?.orgId, deal.title).toBe(deal.orgId)
    }
  })

  test('each organization has one open deal before the tool stages, owned by the analyst of its country', () => {
    for (const org of pipedrive.organizations) {
      const deals = pipedrive.deals.filter((deal) => deal.orgId === org.id)
      expect(deals, org.name).toHaveLength(1)
      expect(deals[0], org.name).toMatchObject({ ownerId: ANALYST_BY_COUNTRY[org.countryCode], stage: null, status: 'open', videoUrl: null })
    }
  })
})

describe('asiakastieto.json and linkedin.json', () => {
  test('have no financials, because the demo companies are real', () => {
    expect(financials.companies).toEqual({})
  })

  test('have a profile for each person with languages of the country and a staff count or null', () => {
    for (const person of pipedrive.persons) {
      const org = pipedrive.organizations.find((item) => item.id === person.orgId)
      const profile = linkedin.profiles[person.email.toLowerCase()]
      expect(profile, person.email).toBeDefined()
      expect(profile?.languages.every((lang) => ['fi', 'sv', 'nb', 'da', 'de', 'en'].includes(lang)), person.email).toBe(true)
      expect(profile?.languages.some((lang) => COUNTRY_LANGUAGES[org?.countryCode ?? '']?.includes(lang)), person.email).toBe(true)
      if (profile?.staffCount !== null) expect(profile?.staffCount, person.email).toBeGreaterThan(0)
    }
  })

  test('one Finnish owner has Swedish as the first language', () => {
    const finnishEmails = pipedrive.persons.filter((person) => finnishOrgs.some((org) => org.id === person.orgId)).map((person) => person.email)
    expect(finnishEmails.filter((email) => linkedin.profiles[email]?.languages[0] === 'sv')).toHaveLength(1)
  })
})

describe('MGX data for the demo companies', () => {
  const dach = pipedrive.organizations.filter((org) => ['DE', 'AT', 'CH'].includes(org.countryCode))

  test('DE and CH have 3 or more closed deals in their sector, so the calculator shows a range', () => {
    for (const org of dach.filter((item) => item.countryCode !== 'AT')) expect(dealCount(org), org.name).toBeGreaterThanOrEqual(3)
  })

  test('the Austrian bakery has 1 or 2 closed deals in its sector, so the calculator shows the text for after the meeting', () => {
    const austrian = dach.find((org) => org.countryCode === 'AT' && org.nace === '10.71')
    expect(austrian && dealCount(austrian)).toBeGreaterThanOrEqual(1)
    expect(austrian && dealCount(austrian)).toBeLessThan(3)
  })

  test('each demo company has at least one closed deal in its sector', () => {
    for (const org of pipedrive.organizations) {
      expect(listClosedDeals(mgx, { nace: org.nace ?? '' }).length, org.name).toBeGreaterThanOrEqual(1)
    }
  })

  test('the Finnish machining company has 3 or more buyers in its sector', () => {
    const org = pipedrive.organizations.find((item) => item.countryCode === 'FI' && item.nace === '25.62')
    expect(searchBuyers(mgx, { nace: org?.nace ?? '', country: 'FI' }, 'http://localhost:3100').length).toBeGreaterThanOrEqual(3)
  })
})

describe('text-sequence.json', () => {
  const rows = sequence.deals

  test('has 100 weekday rows in order from 2026-03-02', () => {
    expect(rows.map((row) => row.n)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(rows[0]?.sentAt).toBe('2026-03-02')
    for (const [i, row] of rows.entries()) {
      const day = new Date(`${row.sentAt}T00:00:00Z`).getUTCDay()
      expect(day, row.sentAt).toBeGreaterThanOrEqual(1)
      expect(day, row.sentAt).toBeLessThanOrEqual(5)
      if (i > 0) expect(row.sentAt >= (rows[i - 1]?.sentAt ?? '')).toBe(true)
    }
  })

  test('about 45 percent opened and about 8 percent booked a meeting, only after an open', () => {
    const opened = rows.filter((row) => row.opened).length
    const booked = rows.filter((row) => row.meetingBooked)
    expect(opened).toBeGreaterThanOrEqual(40)
    expect(opened).toBeLessThanOrEqual(50)
    expect(booked.length).toBeGreaterThanOrEqual(6)
    expect(booked.length).toBeLessThanOrEqual(10)
    expect(booked.every((row) => row.opened)).toBe(true)
    expect(booked.some((row) => row.n <= 50) && booked.some((row) => row.n > 50)).toBe(true)
  })
})

test('no seed file contains an em dash or an en dash', () => {
  for (const file of filesUnder(seedDir)) expect(readFileSync(file, 'utf8'), file).not.toMatch(/[\u2013\u2014]/)
})
