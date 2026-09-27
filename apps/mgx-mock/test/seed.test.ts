import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { mgxSeedSchema } from '../src/seed.ts'
import { listClosedDeals, nace2, searchBuyers } from '../src/tools.ts'
import { seedDir } from './test-server.ts'

interface PipedriveSeed {
  users: { id: number; name: string; email: string; active: boolean }[]
  organizations: { id: number; name: string; website: string | null; countryCode: string; businessId: string | null; nace: string | null }[]
  persons: { id: number; name: string; firstName: string; jobTitle: string; email: string; phone: string; orgId: number }[]
  deals: { id: number; title: string; ownerId: number; personId: number; orgId: number; stage: string | null; status: string; videoUrl: string | null }[]
  activities: unknown[]
  notes: unknown[]
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(seedDir, file), 'utf8')) as T

const mgx = mgxSeedSchema.parse(readJson('mgx.json'))
const pipedrive = readJson<PipedriveSeed>('pipedrive.json')
const financials = readJson<{ companies: Record<string, { revenue: number; profit: number; fiscalYear: number }> }>('asiakastieto.json')
const linkedin = readJson<{ profiles: Record<string, { languages: string[]; staffCount: number }> }>('linkedin.json')
const sequence = readJson<{ deals: { n: number; sentAt: string; opened: boolean; meetingBooked: boolean }[] }>('text-sequence.json')

const COUNTRY_LANGUAGES: Record<string, string[]> = { FI: ['fi', 'sv'], SE: ['sv'], NO: ['nb'], DK: ['da'], DE: ['de'], AT: ['de'], CH: ['de'], IS: ['en'] }
const ANALYST_BY_COUNTRY: Record<string, number> = { FI: 1001, SE: 1001, DE: 1002, AT: 1002, CH: 1002, NO: 1003, DK: 1003, IS: 1003 }
const ABOUT_PATH_WORDS = ['about', 'meista', 'yritys', 'om-oss', 'om-os', 'ueber-uns']

const finnishOrgs = pipedrive.organizations.filter((org) => org.countryCode === 'FI')
const siteOrgs = pipedrive.organizations.filter((org) => org.website !== null)

function validFinnishBusinessId(id: string): boolean {
  const match = /^(\d{7})-(\d)$/.exec(id)
  if (!match?.[1] || !match[2]) return false
  const weights = [7, 9, 10, 5, 8, 4, 2]
  const remainder = [...match[1]].reduce((sum, digit, i) => sum + Number(digit) * (weights[i] ?? 0), 0) % 11
  return remainder !== 1 && (remainder === 0 ? 0 : 11 - remainder) === Number(match[2])
}

function siteDir(website: string): string {
  const slug = /^\/sites\/([a-z0-9-]+)\/$/.exec(new URL(website).pathname)?.[1]
  if (!slug) throw new Error(`Website is not a demo site: ${website}`)
  return path.join(seedDir, 'sites', slug)
}

function aboutWord(dir: string): string | undefined {
  return ABOUT_PATH_WORDS.find((word) => existsSync(path.join(dir, word, 'index.html')))
}

function countWords(html: string, withBanner: boolean): number {
  let text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  if (!withBanner) text = text.replace(/<section id="cookie-banner"[\s\S]*?<\/section>/g, ' ')
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

function siteWords(org: PipedriveSeed['organizations'][number], withBanner: boolean) {
  const dir = siteDir(org.website ?? '')
  const home = countWords(readFileSync(path.join(dir, 'index.html'), 'utf8'), withBanner)
  const about = countWords(readFileSync(path.join(dir, aboutWord(dir) ?? '', 'index.html'), 'utf8'), withBanner)
  return { home, total: home + about }
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

  test('has 10 organizations: 3 FI, 1 SE, 1 NO, 1 DK, 1 DE, 1 AT, 1 CH, 1 IS', () => {
    const counts: Record<string, number> = {}
    for (const org of pipedrive.organizations) counts[org.countryCode] = (counts[org.countryCode] ?? 0) + 1
    expect(counts).toEqual({ FI: 3, SE: 1, NO: 1, DK: 1, DE: 1, AT: 1, CH: 1, IS: 1 })
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

  test('exactly one Finnish company has no website', () => {
    expect(finnishOrgs.filter((org) => org.website === null)).toHaveLength(1)
    expect(pipedrive.organizations.filter((org) => org.website === null)).toHaveLength(1)
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
  test('have financials for two of the three Finnish companies', () => {
    const ids = Object.keys(financials.companies)
    expect(ids).toHaveLength(2)
    expect(finnishOrgs.filter((org) => org.businessId !== null && ids.includes(org.businessId))).toHaveLength(2)
  })

  test('each Finnish company with financials has a business ID, and the figures are for 2025', () => {
    for (const [businessId, figures] of Object.entries(financials.companies)) {
      expect(finnishOrgs.some((org) => org.businessId === businessId), businessId).toBe(true)
      expect(figures.fiscalYear).toBe(2025)
      expect(figures.profit).toBeGreaterThan(0)
      expect(figures.revenue).toBeGreaterThan(figures.profit)
    }
  })

  test('have a profile for each person with languages of the country and 20 or more staff', () => {
    for (const person of pipedrive.persons) {
      const org = pipedrive.organizations.find((item) => item.id === person.orgId)
      const profile = linkedin.profiles[person.email.toLowerCase()]
      expect(profile, person.email).toBeDefined()
      expect(profile?.languages.every((lang) => ['fi', 'sv', 'nb', 'da', 'de', 'en'].includes(lang)), person.email).toBe(true)
      expect(profile?.languages.some((lang) => COUNTRY_LANGUAGES[org?.countryCode ?? '']?.includes(lang)), person.email).toBe(true)
      expect(profile?.staffCount, person.email).toBeGreaterThanOrEqual(20)
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

  test('AT has 1 or 2 closed deals in its sector, so the calculator shows the text for after the meeting', () => {
    const austrian = dach.find((org) => org.countryCode === 'AT')
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

describe('demo sites', () => {
  test('each website has a home page and an about page with a known path word that the home page links to', () => {
    for (const org of siteOrgs) {
      const dir = siteDir(org.website ?? '')
      const word = aboutWord(dir)
      expect(word, org.name).toBeDefined()
      expect(readFileSync(path.join(dir, 'index.html'), 'utf8'), org.name).toContain(`href="${word}/"`)
    }
  })

  test('each page sets a language of the country and has a cookie banner with an accept button', () => {
    for (const org of siteOrgs) {
      const dir = siteDir(org.website ?? '')
      for (const file of [path.join(dir, 'index.html'), path.join(dir, aboutWord(dir) ?? '', 'index.html')]) {
        const html = readFileSync(file, 'utf8')
        const lang = /<html lang="([a-zA-Z-]+)">/.exec(html)?.[1]?.split('-')[0]
        expect(COUNTRY_LANGUAGES[org.countryCode], file).toContain(lang)
        expect(html, file).toMatch(/<section id="cookie-banner" class="cookie-banner"/)
        expect(html, file).toMatch(/<button type="button" id="cookie-accept"/)
      }
    }
  })

  test('each site has 250 to 600 words and 200 or more on the home page, except one short site', () => {
    const short = siteOrgs.filter((org) => siteWords(org, true).total < 200)
    expect(short).toHaveLength(1)
    for (const org of siteOrgs.filter((item) => !short.includes(item))) {
      const words = siteWords(org, false)
      expect(words.home, org.name).toBeGreaterThanOrEqual(200)
      expect(words.total, org.name).toBeGreaterThanOrEqual(250)
      expect(words.total, org.name).toBeLessThanOrEqual(600)
    }
  })

  test('every site file starts with <!DOCTYPE html>', () => {
    const files = filesUnder(path.join(seedDir, 'sites')).filter((file) => file.endsWith('.html'))
    expect(files.length).toBeGreaterThanOrEqual(16)
    for (const file of files) expect(readFileSync(file, 'utf8').startsWith('<!DOCTYPE html>\n'), file).toBe(true)
  })

  test('no site page loads an external resource', () => {
    for (const file of filesUnder(path.join(seedDir, 'sites'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/(src|href)="(https?:)?\/\//)
    }
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
