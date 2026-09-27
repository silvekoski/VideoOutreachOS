import { createElement, createRef } from 'react'
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANGUAGES } from '@mergero/shared'
import type { VideoPageData } from '@mergero/shared'
import { STRINGS } from '@mergero/shared/i18n'
import { PROFIT_RANGES, REVENUE_RANGES, fill, formatEur } from '@mergero/shared/i18n/base'
import { BuyerLinks } from '../../src/video/buyer-links.tsx'
import { Calendar } from '../../src/video/calendar.tsx'
import { AmountFieldset, CompanyForm, FormStatus } from '../../src/video/company-form.tsx'
import { detectPlatform } from '../../src/video/device.ts'
import { Player } from '../../src/video/player.tsx'
import { ProgressBar } from '../../src/video/progress-bar.tsx'
import { viewerTimeZone } from '../../src/video/slots.ts'
import { progressText } from '../../src/video/timeline.ts'
import { Transcript } from '../../src/video/transcript.tsx'

const de = STRINGS.de

const SLIDES: VideoPageData['slides'] = [
  { slide: 1, startS: 0, endS: 31.2 },
  { slide: 2, startS: 31.2, endS: 43.6 },
  { slide: 3, startS: 43.6, endS: 56 },
  { slide: 4, startS: 56, endS: 68.4 },
  { slide: 5, startS: 68.4, endS: 80.8 },
  { slide: 6, startS: 80.8, endS: 93.2 },
  { slide: 7, startS: 93.2, endS: 105.6 },
  { slide: 8, startS: 105.6, endS: 118 },
]

function pageData(patch: Partial<VideoPageData> = {}): VideoPageData {
  return {
    code: 'AbCdEfGhIjKlMnOpQrStUv',
    dealId: 4007,
    company: 'Muster GmbH',
    ownerFirstName: 'Hans',
    analystName: 'Jonas Weber',
    analystEmail: 'jonas@mergero.test',
    pageLanguage: 'de',
    videoLanguage: 'de',
    country: 'DE',
    version: 2,
    media: { video720: '/720.mp4', video1080: '/1080.mp4', poster: '/poster.jpg', captions: '/captions.v2.vtt' },
    slides: SLIDES,
    durationS: 118,
    transcript: [],
    buyers: [],
    buyerScope: 'sector',
    calculator: null,
    calculatorEnabled: false,
    customQuestions: [],
    formSent: false,
    meetingAt: null,
    expiresAt: '2026-10-26T12:00:00.000Z',
    preview: false,
    contact: {
      company: 'Mergero',
      address: 'Hardturmstrasse 120, 8005 Zürich',
      email: 'office@mergero.com',
      phone: '+41 79 558 4490',
      website: 'https://mergero.com',
      privacyUrl: 'https://mergero.com/privacy-policy/',
    },
    ...patch,
  }
}

function decode(text: string): string {
  return text.replace(/&quot;/gu, '"').replace(/&#x27;/gu, "'").replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&')
}

function openTags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, 'gu')) ?? []
}

function attr(tag: string | undefined, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`, 'iu').exec(tag ?? '')
  return match?.[1] === undefined ? null : decode(match[1])
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function textById(html: string, id: string): string | null {
  const match = new RegExp(`<(\\w+)\\b[^>]*\\sid="${escape(id)}"[^>]*>(.*?)</\\1>`, 'su').exec(html)
  return match?.[2] === undefined ? null : decode(match[2].replace(/<[^>]*>/gu, ''))
}

function labelFor(html: string, id: string): string | null {
  const match = new RegExp(`<label\\b[^>]*\\sfor="${escape(id)}"[^>]*>(.*?)</label>`, 'su').exec(html)
  return match?.[1] === undefined ? null : decode(match[1].replace(/<[^>]*>/gu, ''))
}

function amountFieldset(value: ComponentProps<typeof AmountFieldset>['value']): string {
  return renderToStaticMarkup(
    createElement(AmountFieldset, {
      name: 'revenue',
      legend: de.page.revenue,
      options: REVENUE_RANGES,
      labels: de.page.revenueRanges,
      value,
      locale: de.locale,
      strings: de.page,
      onChange: () => {},
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('revenue and profit fields', () => {
  it('names the range select by its field and gives the kind radios a group name', () => {
    const html = amountFieldset({ kind: 'range', range: '', exact: '' })
    const select = openTags(html, 'select')[0]
    expect(labelFor(html, attr(select, 'id') ?? '')).toBe('Umsatz')
    const group = openTags(html, 'div').find((tag) => attr(tag, 'role') === 'radiogroup')
    expect(attr(group, 'aria-label')).toBe('Umsatz: Spanne oder genauer Wert')
    expect(openTags(html, 'input').filter((tag) => attr(tag, 'type') === 'radio')).toHaveLength(2)
  })

  it('names the profit select by its field', () => {
    const html = renderToStaticMarkup(
      createElement(AmountFieldset, {
        name: 'profit',
        legend: de.page.profit,
        options: PROFIT_RANGES,
        labels: de.page.profitRanges,
        value: { kind: 'range', range: '', exact: '' },
        locale: de.locale,
        strings: de.page,
        onChange: () => {},
      }),
    )
    expect(labelFor(html, attr(openTags(html, 'select')[0], 'id') ?? '')).toBe('Betriebsergebnis')
  })

  it('shows an error text for an invalid exact value and links it to the field', () => {
    const html = amountFieldset({ kind: 'exact', range: '', exact: '0' })
    const input = openTags(html, 'input').find((tag) => attr(tag, 'type') === 'text')
    expect(attr(input, 'aria-invalid')).toBe('true')
    expect(textById(html, attr(input, 'aria-describedby') ?? '')).toBe(de.page.exactInvalid)
    const names = (attr(input, 'aria-labelledby') ?? '').split(' ').map((id) => textById(html, id))
    expect(names).toEqual(['Umsatz', de.page.exactValue])
  })

  it('describes a valid exact value with the formatted amount and no error', () => {
    const html = amountFieldset({ kind: 'exact', range: '', exact: '1 500 000' })
    const input = openTags(html, 'input').find((tag) => attr(tag, 'type') === 'text')
    expect(attr(input, 'aria-invalid')).toBeNull()
    expect(textById(html, attr(input, 'aria-describedby') ?? '')).toBe(formatEur(1_500_000, de.locale))
    expect(html).not.toContain(de.page.exactInvalid)
  })
})

describe('form status', () => {
  it('says in each language that the answers were already sent, and not that they were received', () => {
    for (const lang of LANGUAGES) {
      const page = STRINGS[lang].page
      const html = renderToStaticMarkup(createElement(FormStatus, { status: 'alreadySent', page }))
      expect(attr(openTags(html, 'p')[0], 'aria-live'), lang).toBe('polite')
      expect(decode(html.replace(/<[^>]*>/gu, '')), lang).toBe(page.alreadySent)
      expect(page.alreadySent, lang).not.toBe(page.sent)
    }
  })
})

describe('preview mode', () => {
  it('disables Send in the form and says why', () => {
    const html = renderToStaticMarkup(createElement(CompanyForm, { data: pageData({ preview: true }), strings: de }))
    const send = openTags(html, 'button').find((tag) => attr(tag, 'type') === 'submit')
    expect(attr(send, 'disabled')).toBe('')
    expect(textById(html, attr(send, 'aria-describedby') ?? '')).toBe(de.page.previewNote)
    const live = renderToStaticMarkup(createElement(CompanyForm, { data: pageData(), strings: de }))
    expect(live).not.toContain(de.page.previewNote)
  })

  it('disables Book in the calendar and says why', () => {
    const calendar = (preview: boolean) =>
      renderToStaticMarkup(
        createElement(Calendar, { data: pageData({ preview }), strings: de.page, locale: de.locale, headingRef: createRef<HTMLHeadingElement>() }),
      )
    const html = calendar(true)
    const book = openTags(html, 'button').find((tag) => attr(tag, 'type') === 'submit')
    expect(attr(book, 'disabled')).toBe('')
    expect(textById(html, attr(book, 'aria-describedby') ?? '')).toBe(de.page.previewNote)
    expect(calendar(false)).not.toContain(de.page.previewNote)
  })
})

describe('calendar', () => {
  it('names the time zone with the IANA name and shows no email error at first', () => {
    const html = renderToStaticMarkup(
      createElement(Calendar, { data: pageData(), strings: de.page, locale: de.locale, headingRef: createRef<HTMLHeadingElement>() }),
    )
    expect(html).toContain(fill(de.page.timeZone, { zone: viewerTimeZone() }))
    const email = openTags(html, 'input').find((tag) => attr(tag, 'type') === 'email')
    expect(labelFor(html, attr(email, 'id') ?? '')).toBe(de.page.email)
    expect(attr(email, 'aria-invalid')).toBeNull()
    expect(html).not.toContain(de.page.emailInvalid)
  })
})

describe('buyer links', () => {
  it('names the heading after the scope of slide 5', () => {
    const buyers = [{ id: 'b1', name: 'Nordic Industrial Partners', focus: 'Metal', website: null }]
    const heading = (scope: 'sector' | 'featured') =>
      renderToStaticMarkup(createElement(BuyerLinks, { buyers, scope, strings: de.page }))
    expect(heading('sector')).toContain(de.page.buyersHeading)
    expect(heading('featured')).toContain(de.page.buyersHeadingFeatured)
    expect(heading('featured')).not.toContain(de.page.buyersHeading)
  })

  it('puts the buyer name in the accessible name of each link', () => {
    const buyers = [
      { id: 'b1', name: 'Nordic Industrial Partners', focus: 'Metal', website: 'https://nip.test' },
      { id: 'b2', name: 'Baltic Growth Fund', focus: 'Family firms', website: null },
      { id: 'b3', name: 'Alpen Holding', focus: 'Services', website: 'alpen.test' },
    ]
    const html = renderToStaticMarkup(createElement(BuyerLinks, { buyers, scope: 'sector', strings: de.page }))
    expect(openTags(html, 'a').map((tag) => attr(tag, 'aria-label'))).toEqual([
      'Website besuchen: Nordic Industrial Partners',
      'Website besuchen: Alpen Holding',
    ])
  })
})

describe('progress slider', () => {
  it('writes the value text as time of duration with the slide name', () => {
    expect(progressText(STRINGS.en.page.progressValue, 87, 150, 'Your figures')).toBe('1:27 of 2:30, Your figures')
    expect(progressText(de.page.progressValue, 0, 118, null)).toBe('0:00 von 1:58')
  })

  it('puts the value text on the slider', () => {
    const html = renderToStaticMarkup(
      createElement(ProgressBar, {
        time: 87,
        duration: 150,
        buffered: 0,
        slides: SLIDES,
        strings: STRINGS.en.page,
        valueText: '1:27 of 2:30, Your figures',
        onSeek: () => {},
        onKeySeek: () => {},
        onJump: () => {},
      }),
    )
    const slider = openTags(html, 'div').find((tag) => attr(tag, 'role') === 'slider')
    expect(attr(slider, 'aria-label')).toBe(STRINGS.en.page.progress)
    expect(attr(slider, 'aria-valuetext')).toBe('1:27 of 2:30, Your figures')
  })
})

describe('player', () => {
  it('sets the captions language and label and the slider value text', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    vi.stubGlobal('document', { fullscreenEnabled: false })
    const html = renderToStaticMarkup(
      createElement(Player, {
        data: pageData({ pageLanguage: 'en', videoLanguage: 'fi' }),
        strings: STRINGS.en.page,
        locale: STRINGS.en.locale,
        title: 'Video',
        platform: detectPlatform('curl/8.9', 0),
        onSlideChange: () => {},
        onEnded: () => {},
      }),
    )
    const track = openTags(html, 'track')[0]
    expect(attr(track, 'srclang')).toBe('fi')
    expect(attr(track, 'label')).toBe('Finnish')
    expect(attr(track, 'src')).toBe('/captions.v2.vtt')
    const slider = openTags(html, 'div').find((tag) => attr(tag, 'role') === 'slider')
    expect(attr(slider, 'aria-valuetext')).toBe(`0:00 of 1:58, ${STRINGS.en.page.slideNames[1]}`)
  })
})

describe('transcript', () => {
  it('lists the text on screen of each slide under a label, in the video language', () => {
    const html = renderToStaticMarkup(
      createElement(Transcript, {
        transcript: [
          { slide: 1, text: 'Hei, olen Aino Mergerosta.', screen: ['Aino Analyst'] },
          { slide: 6, text: '', screen: ['Mahdollisuudet toimialallasi', '2025, Saksa: Hydraulic cylinder maker sold to a strategic buyer'] },
        ],
        lang: 'fi',
        strings: STRINGS.en.page,
      }),
    )
    const lists = openTags(html, 'ul')
    expect(lists).toHaveLength(2)
    for (const list of lists) {
      expect(attr(list, 'lang')).toBe('fi')
      expect(textById(html, attr(list, 'aria-labelledby') ?? '')).toBe(STRINGS.en.page.onScreen)
    }
    expect(html).toContain('<li>2025, Saksa: Hydraulic cylinder maker sold to a strategic buyer</li>')
    expect(openTags(html, 'p').filter((tag) => attr(tag, 'lang') === 'fi')).toHaveLength(1)
  })
})

describe('value calculator', () => {
  it('shows the fixed text when MGX has too few closed deals for a range', () => {
    const html = renderToStaticMarkup(
      createElement(CompanyForm, { data: pageData({ calculatorEnabled: true, calculator: null }), strings: de }),
    )
    expect(html).toContain(de.page.calculatorNoRange)
  })
})
