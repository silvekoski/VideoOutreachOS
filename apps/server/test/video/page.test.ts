import { rmSync } from 'node:fs'
import path from 'node:path'
import { fill, slideLabels, t } from '@mergero/shared'
import type { DealCardItem, VideoPageData } from '@mergero/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { completeIntro, startIntro } from '../../src/domain/analysts.ts'
import { requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { updateVersion } from '../../src/domain/timelines.ts'
import { BUYERS, DEAL_ID, SLIDE_TIMES, T0, snapshot } from '../domain/fixtures.ts'
import { PUBLIC_BASE_URL, addRenderedVersion, createHarness, draftDeal, mgxData, publishedDeal } from './harness.ts'
import type { Harness } from './harness.ts'

let h: Harness

beforeEach(() => {
  h = createHarness()
})

afterEach(() => {
  h.close()
})

function bootstrap(html: string): VideoPageData {
  const match = /<script type="application\/json" id="bootstrap">(.*?)<\/script>/su.exec(html)
  if (!match?.[1]) throw new Error('The page has no bootstrap script')
  return JSON.parse(match[1]) as VideoPageData
}

function meta(html: string, key: string): string | null {
  const match = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`, 'u').exec(html)
  return match?.[1] ?? null
}

describe('GET /v/:code', () => {
  it('renders the page with Open Graph tags, noindex and the bootstrap data', async () => {
    const deal = publishedDeal(h, { patch: { customQuestions: [{ id: 'q1', text: 'Do you own the building?' }] } })
    const res = await h.request(`/v/${deal.linkCode}?c=whatsapp`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(res.headers.get('cache-control')).toBe('no-store')
    const html = await res.text()
    expect(html.startsWith('<!DOCTYPE html>\n<html lang="fi">')).toBe(true)
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(html).toContain(`<title>${fill(t('fi').page.documentTitle, { company: 'Acme Oy' })}</title>`)
    const pageUrl = `${PUBLIC_BASE_URL}/v/${deal.linkCode}`
    expect(meta(html, 'og:title')).toBe(fill(t('fi').og.title, { analyst: 'Aino Analyst', company: 'Acme Oy' }))
    expect(meta(html, 'og:description')).toBe(t('fi').og.description)
    expect(meta(html, 'og:url')).toBe(pageUrl)
    expect(meta(html, 'og:type')).toBe('website')
    expect(meta(html, 'og:site_name')).toBe('Mergero')
    expect(meta(html, 'og:image')).toBe(`${pageUrl}/og-image.jpg`)
    expect(meta(html, 'og:image:width')).toBe('1200')
    expect(meta(html, 'og:image:height')).toBe('630')
    expect(meta(html, 'twitter:card')).toBe('summary_large_image')
    expect(html).toContain('<script type="module" src="http://vite.test/@vite/client"></script>')
    expect(html).toContain('<script type="module" src="http://vite.test/src/video/main.tsx"></script>')
    expect(html).toContain('<div id="root"></div>')

    const data = bootstrap(html)
    expect(data).toMatchObject({
      code: deal.linkCode,
      dealId: DEAL_ID,
      company: 'Acme Oy',
      ownerFirstName: 'Matti',
      analystName: 'Aino Analyst',
      analystEmail: 'aino@mergero.test',
      pageLanguage: 'fi',
      videoLanguage: 'fi',
      country: 'FI',
      version: 1,
      media: {
        video720: `/v/${deal.linkCode}/media/video-720.v1.mp4`,
        video1080: `/v/${deal.linkCode}/media/video-1080.v1.mp4`,
        poster: `/v/${deal.linkCode}/media/poster.v1.jpg`,
        captions: `/v/${deal.linkCode}/captions.v1.vtt`,
      },
      durationS: 118,
      calculator: null,
      calculatorEnabled: false,
      customQuestions: [{ id: 'q1', text: 'Do you own the building?' }],
      formSent: false,
      meetingAt: null,
      expiresAt: '2026-10-26T12:00:00.000Z',
      preview: false,
      contact: { company: 'Mergero', address: 'Mannerheiminaukio 1A, 00100 Helsinki, Finland', email: 'office@mergero.com' },
    })
    expect(data.slides).toEqual(SLIDE_TIMES)
    expect(data.transcript[0]).toEqual({ slide: 1, text: 'Hei, olen Aino Mergerosta.', screen: ['Aino Analyst'] })
    expect(data.transcript.map((item) => item.slide)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(data.buyers).toEqual([
      { id: 'b1', name: 'Nordic Industrial Partners', focus: 'Buys metal workshops', website: 'https://nip.test' },
      { id: 'b2', name: 'Baltic Growth Fund', focus: 'Invests in family firms', website: null },
      { id: 'b3', name: 'Helsinki Holding', focus: 'Buys industrial service firms', website: 'https://hh.test' },
    ])
  })

  it('keeps the intro transcript of the published version after a new recording', async () => {
    const deal = publishedDeal(h)
    const recordedAt = '2026-09-26T13:00:00.000Z'
    startIntro(h.db, 10, 'fi', { recordedAt, transcript: 'Uuden tallenteen sanat.' }, T0)
    completeIntro(h.db, 10, 'fi', recordedAt, { file: 'analysts/10/intro-fi.mp4', durationS: 28 }, T0)

    const data = bootstrap(await (await h.request(`/v/${deal.linkCode}`)).text())
    expect(data.transcript[0]).toMatchObject({ slide: 1, text: 'Hei, olen Aino Mergerosta.' })
    const captions = await (await h.request(`/v/${deal.linkCode}/captions.v1.vtt`)).text()
    expect(captions).toContain('Hei, olen Aino Mergerosta.')
    expect(captions).not.toContain('Uuden tallenteen')
  })

  it('lists the text that each slide of the served version shows in the transcript', async () => {
    const deal = publishedDeal(h, { patch: { country: 'DE', pageLanguage: 'en' }, timeline: { language: 'de' } })
    const recent: DealCardItem[] = [
      { id: 'r1', year: 2025, country: 'FI', text: 'Owner-led supplier of turned parts sold to a Swiss family office' },
      { id: 'r2', year: 2024, country: 'SE', text: 'Plumbing and ventilation installer with 55 staff joined a service group' },
    ]
    const sector: DealCardItem[] = [
      { id: 's1', year: 2025, country: 'DE', text: 'Hydraulic cylinder maker with 85 staff sold to a strategic buyer' },
      { id: 's2', year: 2024, country: 'AT', text: 'Machine tool builder sold to a German mid-market fund' },
    ]
    updateVersion(h.db, deal.id, 1, (timeline) => ({
      ...timeline,
      segments: timeline.segments.map((segment) => {
        const labels = segment.template === 'facecam' ? {} : slideLabels('de', segment.template)
        const v = segment.variables
        if (v.template === 'who-we-are') return { ...segment, labels, variables: { ...v, buyers: BUYERS.slice(0, 2), deals: recent } }
        if (v.template === 'what-is-possible') return { ...segment, labels, variables: { ...v, deals: sector } }
        return { ...segment, labels }
      }) as typeof timeline.segments,
    }))
    const de = t('de').slides
    const { transcript } = bootstrap(await (await h.request(`/v/${deal.linkCode}`)).text())
    const screen = (slide: number) => transcript.find((part) => part.slide === slide)?.screen
    expect(screen(2)).toEqual([
      'Mergero verbindet Inhaber mit 2.200 Käufern',
      `${de['who-we-are']['buyers-heading']}: Nordic Industrial Partners, Baltic Growth Fund`,
      de['who-we-are']['deals-heading'],
      '2025, Finnland: Owner-led supplier of turned parts sold to a Swiss family office',
      '2024, Schweden: Plumbing and ventilation installer with 55 staff joined a service group',
    ])
    expect(screen(3)).toEqual([de['your-company'].headline, 'Acme Oy', 'Acme makes steel parts.', 'It has 46 staff.', 'It sells to ship yards.'])
    expect(screen(4)).toEqual([de['your-figures'].headline, de['your-figures']['ask-form']])
    expect(screen(5)).toEqual([
      de.buyers.headline,
      'Nordic Industrial Partners: Buys metal workshops',
      'Baltic Growth Fund: Invests in family firms',
      'Helsinki Holding: Buys industrial service firms',
    ])
    expect(screen(6)).toEqual([
      de['what-is-possible'].headline,
      '2025, Deutschland: Hydraulic cylinder maker with 85 staff sold to a strategic buyer',
      '2024, Österreich: Machine tool builder sold to a German mid-market fund',
    ])
    expect(screen(7)).toEqual([de.privacy.headline, de.privacy['point-1'], de.privacy['point-2'], de.privacy['point-3']])
    expect(screen(8)).toEqual([de['book-meeting'].headline, de['book-meeting'].line, 'Aino Analyst'])
  })

  it('lists the empty panel text of slides 5 and 6 without buyers or deals', async () => {
    const deal = publishedDeal(h, { timeline: { language: 'de' } })
    updateVersion(h.db, deal.id, 1, (timeline) => ({
      ...timeline,
      segments: timeline.segments.map((segment) => {
        const v = segment.variables
        if (v.template === 'buyers') return { ...segment, labels: slideLabels('de', 'buyers'), variables: { ...v, buyers: [] } }
        if (v.template === 'what-is-possible') return { ...segment, labels: slideLabels('de', 'what-is-possible'), variables: { ...v, deals: [] } }
        return segment
      }) as typeof timeline.segments,
    }))
    const de = t('de').slides
    const { transcript } = bootstrap(await (await h.request(`/v/${deal.linkCode}`)).text())
    const screen = (slide: number) => transcript.find((part) => part.slide === slide)?.screen
    expect(screen(5)).toEqual([de.buyers.headline, de.buyers.empty])
    expect(screen(6)).toEqual([de['what-is-possible'].headline, de['what-is-possible'].empty])
  })

  it('gives the buyer scope of the served version', async () => {
    const deal = publishedDeal(h)
    const scopeOf = async () => bootstrap(await (await h.request(`/v/${deal.linkCode}`)).text()).buyerScope
    expect(await scopeOf()).toBe('sector')
    updateVersion(h.db, deal.id, 1, (timeline) => ({
      ...timeline,
      segments: timeline.segments.map((segment) =>
        segment.variables.template === 'buyers'
          ? { ...segment, variables: { ...segment.variables, scope: 'featured' as const } }
          : segment,
      ) as typeof timeline.segments,
    }))
    expect(await scopeOf()).toBe('featured')
  })

  it('escapes < in the bootstrap JSON and the text of the head', async () => {
    const company = 'Acme </script><script>alert(1)</script> & "Sons"'
    const deal = publishedDeal(h)
    updateDeal(h.db, deal.id, { snapshot: { ...snapshot(), company } })
    const html = await (await h.request(`/v/${deal.linkCode}`)).text()
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).toContain('Acme \\u003c/script>\\u003cscript>alert(1)\\u003c/script> & \\"Sons\\"')
    const escaped = 'Acme &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Sons&quot;'
    expect(html).toContain(`<title>${fill(t('fi').page.documentTitle, { company: escaped })}</title>`)
    expect(meta(html, 'og:title')).toBe(fill(t('fi').og.title, { analyst: 'Aino Analyst', company: escaped }))
    expect(bootstrap(html).company).toBe(company)
  })

  it('gives the video language apart from the page language', async () => {
    const deal = publishedDeal(h, { patch: { pageLanguage: 'en' } })
    const html = await (await h.request(`/v/${deal.linkCode}`)).text()
    expect(html.startsWith('<!DOCTYPE html>\n<html lang="en">')).toBe(true)
    expect(bootstrap(html)).toMatchObject({ pageLanguage: 'en', videoLanguage: 'fi' })
  })

  it('leaves out og:image when the file does not exist', async () => {
    const deal = publishedDeal(h)
    rmSync(path.join(h.storageDir, 'deals', String(deal.id), 'og-image.jpg'))
    const html = await (await h.request(`/v/${deal.linkCode}`)).text()
    expect(meta(html, 'og:image')).toBeNull()
    expect(meta(html, 'twitter:card')).toBe('summary')
  })

  it('shows the calculator range for a DACH deal with enough closed deals', async () => {
    const deal = publishedDeal(h, { patch: { country: 'DE', pageLanguage: 'de', mgx: mgxData([4, 5, 6, 7]) } })
    const data = bootstrap(await (await h.request(`/v/${deal.linkCode}`)).text())
    expect(data.calculatorEnabled).toBe(true)
    expect(data.calculator).toEqual({ p25: 4.75, p75: 6.25, dealCount: 4 })
    expect(data.contact.address).toContain('Frankfurt')
  })

  it('returns a 404 page with the privacy notice for an unknown or malformed code', async () => {
    for (const code of ['AAAAAAAAAAAAAAAAAAAAAA', 'short', 'AAAAAAAAAAAAAAAAAAAAA%3F']) {
      const res = await h.request(`/v/${code}`, { headers: { 'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8' } })
      expect(res.status).toBe(404)
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
      expect(res.headers.get('x-frame-options')).toBe('DENY')
      const html = await res.text()
      expect(html.startsWith('<!DOCTYPE html>\n<html lang="de">')).toBe(true)
      expect(html).toContain(t('de').page.notFoundTitle)
      expect(html).toContain(t('de').page.privacyHeading)
      expect(html).toContain('https://mergero.com/privacy-policy/')
      expect(html).not.toContain('id="bootstrap"')
    }
  })

  it('returns 404 for an unpublished deal and the newest rendered version with preview=1', async () => {
    const deal = draftDeal(h)
    expect((await h.request(`/v/${deal.linkCode}?preview=1`)).status).toBe(404)
    addRenderedVersion(h)
    addRenderedVersion(h)
    addRenderedVersion(h)
    const res = await h.request(`/v/${deal.linkCode}`)
    expect(res.status).toBe(404)
    expect(await res.text()).toContain(t('en').page.notFoundTitle)
    const preview = await h.request(`/v/${deal.linkCode}?preview=1`)
    expect(preview.status).toBe(200)
    const data = bootstrap(await preview.text())
    expect(data.preview).toBe(true)
    expect(data.version).toBe(3)
    expect(data.media.video720).toBe(`/v/${deal.linkCode}/media/video-720.v3.mp4?preview=1`)
    expect(data.expiresAt).toBe('2026-10-26T12:00:00.000Z')
    expect((await h.request(data.media.video720)).status).toBe(200)
    expect((await h.request(`/v/${deal.linkCode}/media/video-720.v3.mp4`)).status).toBe(404)
  })

  it('keeps the published version in preview mode of a published deal', async () => {
    const deal = publishedDeal(h)
    addRenderedVersion(h)
    const data = bootstrap(await (await h.request(`/v/${deal.linkCode}?preview=1`)).text())
    expect(data.preview).toBe(true)
    expect(data.version).toBe(1)
  })

  it('returns a 410 page in the page language with the contact details after expiry', async () => {
    const deal = publishedDeal(h, { patch: { country: 'AT', pageLanguage: 'de' } })
    h.clock.now = new Date(requireDeal(h.db, deal.id).expiresAt ?? T0)
    const res = await h.request(`/v/${deal.linkCode}`)
    expect(res.status).toBe(410)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const html = await res.text()
    expect(html.startsWith('<!DOCTYPE html>\n<html lang="de">')).toBe(true)
    expect(html).toContain(t('de').page.expiredTitle)
    expect(html).toContain(t('de').page.contactHeading)
    expect(html).toContain('Hardturmstrasse 120, 8005 Zürich, Switzerland')
    expect(html).toContain('<a href="tel:+41795584490">+41 79 558 4490</a>')
    expect(html).toContain('<a href="mailto:office@mergero.com">office@mergero.com</a>')
    expect(html).toContain(t('de').page.privacyText)
    expect(html).not.toContain('id="bootstrap"')
  })

  it('answers HEAD requests', async () => {
    const deal = publishedDeal(h)
    const res = await h.request(`/v/${deal.linkCode}`, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(await res.text()).toBe('')
  })

  it('adds the robots header to unknown paths below /v/', async () => {
    const deal = publishedDeal(h)
    const res = await h.request(`/v/${deal.linkCode}/nothing-here`)
    expect(res.status).toBe(404)
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})
