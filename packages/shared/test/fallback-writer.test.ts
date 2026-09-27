import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkBriefText, checkLines, checkScript } from '../src/checks.ts'
import { fallbackBriefText, fallbackLines, fallbackScript } from '../src/fallback-writer.ts'
import type { ScriptContext } from '../src/fallback-writer.ts'
import { SLOT_LIMITS, textLength } from '../src/slots.ts'
import { LANGUAGES } from '../src/types.ts'
import type { Financials, Lang, ScriptSlideNumber } from '../src/types.ts'
import { brief } from './fixtures.ts'

const SLIDES: ScriptSlideNumber[] = [2, 3, 4, 5, 6, 7, 8]
const DASHES = /[\u2013\u2014]/u

const NATIVE_LINES: Record<Lang, string> = {
  fi: 'Nordic Steel valmistaa teräsrakenteita rakennusyhtiöille ja teollisuudelle koko Suomessa.',
  sv: 'Nordic Steel tillverkar stålkonstruktioner för byggföretag och industri i hela Finland.',
  nb: 'Nordic Steel produserer stålkonstruksjoner for byggefirmaer og industri over hele Norge.',
  da: 'Nordic Steel fremstiller stålkonstruktioner til byggefirmaer og industri i hele Danmark.',
  de: 'Nordic Steel fertigt Stahlkonstruktionen für Bauunternehmen und die Industrie in ganz Deutschland.',
  en: 'Nordic Steel makes steel structures for construction companies and industry across Finland.',
}

const FIGURES: Financials[] = [
  { source: 'asiakastieto', revenue: 4_200_000, profit: 610_000, fiscalYear: 2025 },
  { source: 'asiakastieto', revenue: 950_000, profit: -150_000, fiscalYear: 2024 },
  { source: 'ask_in_form' },
]

function context(lang: Lang, overrides: Partial<ScriptContext> = {}): ScriptContext {
  return {
    lang,
    company: 'Nordic Steel Oy',
    ownerFirstName: 'Matti',
    analystName: 'Johanna Virtanen',
    buyerNames: ['Nordic Industrial Partners', 'Stena Adactum', 'Axcel Capital'],
    buyerCount: 2200,
    figures: FIGURES[0] as Financials,
    calculator: false,
    lines: [NATIVE_LINES[lang]],
    linesSource: 'model',
    hasWebsite: true,
    dealTexts: ['A Finnish metal workshop with 45 staff sold to a Swedish industrial group in 2024.'],
    country: 'FI',
    ...overrides,
  }
}

const CONTEXTS: [string, Partial<ScriptContext>][] = [
  ['typical', {}],
  [
    'long names',
    {
      company: 'Oy Pohjolan Metalli- ja Konepaja Kokkola Ab',
      buyerNames: ['Industrial Growth Holdings International Group', 'Nordic Mid Market Buyout Fund', 'Fund'],
      lines: ['Makes things.'],
    },
  ],
  ['no names', { ownerFirstName: '', buyerNames: [], lines: [], dealTexts: [] }],
  ['no website', { hasWebsite: false, linesSource: 'analyst' }],
  ['no website and no names', { hasWebsite: false, ownerFirstName: '', lines: [], dealTexts: [] }],
  ['recent deals of all sectors', { dealScope: 'recent' }],
  ['no deal in any sector', { dealScope: 'recent', ownerFirstName: '', dealTexts: [], company: 'Oy Pohjolan Metalli- ja Konepaja Kokkola Ab' }],
  ['featured buyers', { buyerScope: 'featured' }],
  [
    'featured buyers with long names',
    {
      buyerScope: 'featured',
      company: 'Oy Pohjolan Metalli- ja Konepaja Kokkola Ab',
      buyerNames: ['Industrial Growth Holdings International Group', 'Nordic Mid Market Buyout Fund', 'Fund'],
    },
  ],
  ['no buyers at all', { buyerScope: 'featured', buyerNames: [] }],
]

const SECTOR_WORDS: Record<Lang, RegExp> = {
  en: /your sector/iu,
  fi: /toimialallasi/iu,
  sv: /din bransch/iu,
  nb: /din bransje/iu,
  da: /din branche/iu,
  de: /Ihrer Branche/iu,
}

const WEBSITE_WORDS = /website|verkkosivu|webbplats|nettsted|hjemmeside/iu

const LIKE_YOURS: Record<Lang, RegExp> = {
  en: /like yours|companies like|your sector/iu,
  fi: /kaltaisiasi|sellainen yritys|toimialaltasi/iu,
  sv: /företag som|din bransch/iu,
  nb: /selskaper som|din bransje/iu,
  da: /virksomheder som|din branche/iu,
  de: /Unternehmen wie|Ihrer Branche/iu,
}

const LINK_WORDS = /links?\b|linkit|länkar|lenker/iu

describe('fallbackScript', () => {
  for (const lang of LANGUAGES) {
    for (const [name, overrides] of CONTEXTS) {
      it(`passes checkScript for every slide in ${lang} with ${name}`, () => {
        for (const slide of SLIDES) {
          const figureCases = slide === 4 ? FIGURES : [FIGURES[0] as Financials]
          for (const figures of figureCases) {
            for (const calculator of figures.source === 'ask_in_form' ? [false, true] : [false]) {
              const ctx = context(lang, { ...overrides, figures, calculator })
              const script = fallbackScript(slide, ctx)
              expect(checkScript(script, lang, ctx), `${lang} slide ${slide}: ${script}`).toEqual({ ok: true, errors: [] })
              expect(script).not.toMatch(/[{}]/u)
              expect(script).not.toMatch(/ ,|,,|\.\./u)
              expect(script).not.toMatch(DASHES)
            }
          }
        }
      })
    }
  }

  it.each(LANGUAGES)('uses the company, the buyers and the native company line in %s', (lang) => {
    const ctx = context(lang)
    expect(fallbackScript(5, ctx)).toContain('Stena Adactum')
    expect(fallbackScript(5, ctx)).toContain('Nordic Steel Oy')
    expect(fallbackScript(3, ctx)).toContain(NATIVE_LINES[lang])
  })

  it.each(LANGUAGES)('does not say "companies like yours" on slide 5 with featured buyers or without buyers in %s', (lang) => {
    expect(fallbackScript(5, context(lang))).toMatch(LIKE_YOURS[lang])
    const featured = fallbackScript(5, context(lang, { buyerScope: 'featured' }))
    expect(featured, featured).not.toMatch(LIKE_YOURS[lang])
    expect(featured).toContain('Stena Adactum')
    for (const buyerScope of ['sector', 'featured'] as const) {
      const empty = fallbackScript(5, context(lang, { buyerScope, buyerNames: [' '] }))
      expect(empty, empty).not.toMatch(LIKE_YOURS[lang])
      expect(empty, empty).not.toMatch(LINK_WORDS)
    }
  })

  it.each(LANGUAGES)('does not claim a website review on slide 3 without a website in %s', (lang) => {
    expect(fallbackScript(3, context(lang))).toMatch(WEBSITE_WORDS)
    for (const overrides of [{}, { lines: [] }, { ownerFirstName: '' }]) {
      const script = fallbackScript(3, context(lang, { ...overrides, hasWebsite: false }))
      expect(script, script).not.toMatch(WEBSITE_WORDS)
    }
    expect(fallbackScript(3, context(lang, { hasWebsite: false }))).toContain(NATIVE_LINES[lang])
  })

  it('does not quote a company line in the first person', () => {
    expect(fallbackScript(3, context('fi', { lines: ['Teemme pienet ja suuret sarjat samalla huolellisuudella koko Suomessa.'] }))).not.toContain('Teemme')
    expect(fallbackScript(3, context('de', { lines: ['Wir fertigen Stahlkonstruktionen für Bauunternehmen in ganz Deutschland.'] }))).not.toContain('Wir fertigen')
    expect(fallbackScript(3, context('en', { lines: ['Our team makes steel structures for construction companies across Finland.'] }))).not.toContain('Our team')
  })

  it('does not quote a company line that speaks to the reader', () => {
    expect(fallbackScript(3, context('fi', { lines: ['Sama yhteyshenkilö palvelee sinua tarjouksesta toimitukseen koko Suomessa.'] }))).not.toContain('sinua')
    expect(fallbackScript(3, context('de', { lines: ['Die Firma berät Sie gern bei allen Fragen rund um den Stahlbau.'] }))).not.toContain('berät Sie')
  })

  it.each(LANGUAGES)('does not say "in your sector" on slide 6 with recent deals of all sectors in %s', (lang) => {
    expect(fallbackScript(6, context(lang, { dealTexts: [] }))).toMatch(SECTOR_WORDS[lang])
    for (const dealTexts of [[], ['A Finnish metal workshop with 45 staff sold to a Swedish industrial group in 2024.']]) {
      const script = fallbackScript(6, context(lang, { dealScope: 'recent', dealTexts }))
      expect(script, script).not.toMatch(SECTOR_WORDS[lang])
    }
    expect(fallbackScript(6, context('en', { dealScope: 'recent' }))).toContain('Finnish metal workshop')
  })

  it('does not quote a company line that refers back to an earlier sentence', () => {
    const lines = ['Se lyhentää toimitusaikaa ja parantaa mittatarkkuutta koko Suomessa.', NATIVE_LINES.fi]
    expect(fallbackScript(3, context('fi', { lines }))).not.toContain('Se lyhentää')
  })

  it('writes the figures only as they appear in the context', () => {
    const script = fallbackScript(4, context('de'))
    expect(script).toContain('4.200.000 Euro')
    expect(script).toContain('610.000 Euro')
    expect(script).toContain('2025')
    const loss = fallbackScript(4, context('fi', { figures: FIGURES[1] as Financials }))
    expect(loss).toContain('liiketappio oli 150\u00A0000 euroa')
  })

  it('does not put a text of another language into the script', () => {
    const script = fallbackScript(6, context('fi'))
    expect(script).not.toContain('Finnish metal workshop')
    expect(fallbackScript(6, context('en'))).toContain('Finnish metal workshop')
  })

  it('addresses the owner by first name only when it exists', () => {
    expect(fallbackScript(7, context('en'))).toMatch(/^Your data stays private, Matti\./u)
    expect(fallbackScript(7, context('en', { ownerFirstName: ' ' }))).toMatch(/^Your data stays private\./u)
    expect(fallbackScript(7, context('de'))).not.toContain('Matti')
  })

  it('writes the calculator text only with the calculator', () => {
    const ask = { figures: FIGURES[2] as Financials }
    expect(fallbackScript(4, context('de', { ...ask, calculator: true }))).toContain('Rechner')
    expect(fallbackScript(4, context('de', { ...ask, calculator: false }))).not.toContain('Rechner')
  })
})

describe('fallbackLines', () => {
  const finnishSite = [
    '# Nordic Steel Oy',
    '[Etusivu](https://nordicsteel.example) | [Yhteystiedot](https://nordicsteel.example/yhteys)',
    'Käytämme evästeitä, jotta sivusto toimisi paremmin kaikilla laitteilla.',
    '## Meistä',
    'Nordic Steel valmistaa teräsrakenteita rakennusyhtiöille koko Suomessa.',
    '- Yritys on toiminut Kokkolassa vuodesta 1978 ja työllistää noin 45 henkeä.',
    'Sen asiakkaita ovat rakennusliikkeet, teollisuus ja julkinen sektori eri puolilla maata.',
    '![Tehdas](https://nordicsteel.example/tehdas.jpg)',
    'Lisätietoja saat sähköpostitse osoitteesta info@nordicsteel.example milloin tahansa.',
  ].join('\n')

  it('takes 3 sentences from the website text that pass checkLines', () => {
    const lines = fallbackLines(finnishSite, 'fi', 'Nordic Steel Oy')
    expect(lines).toEqual([
      'Nordic Steel valmistaa teräsrakenteita rakennusyhtiöille koko Suomessa.',
      'Yritys on toiminut Kokkolassa vuodesta 1978 ja työllistää noin 45 henkeä.',
      'Sen asiakkaita ovat rakennusliikkeet, teollisuus ja julkinen sektori eri puolilla maata.',
    ])
    const input = { task: 'company-lines', lang: 'fi', company: 'Nordic Steel Oy', text: finnishSite }
    expect(checkLines(lines, 'fi', input).ok).toBe(true)
  })

  it('skips website sentences in the first person', () => {
    const site = [
      'Teemme pienet ja suuret sarjat samalla huolellisuudella koko Suomessa.',
      'Sorvaamme akseleita, laippoja ja holkkeja teollisuuden asiakkaille eri puolille maata.',
      'Me palvelemme asiakkaitamme nopeasti ja joustavasti jo kolmannessa polvessa.',
      'Nordic Steel valmistaa teräsrakenteita rakennusyhtiöille ja teollisuudelle koko Suomessa.',
    ].join('\n')
    expect(fallbackLines(site, 'fi', 'Nordic Steel Oy')).toEqual([
      'Nordic Steel valmistaa teräsrakenteita rakennusyhtiöille ja teollisuudelle koko Suomessa.',
      'Yritys esittelee tuotteitaan ja palveluitaan verkkosivuillaan.',
      'Se palvelee asiakkaitaan omalla henkilöstöllään ja osaamisellaan.',
    ])
    const german = [
      'Wir fertigen Stahlkonstruktionen für Bauunternehmen in ganz Deutschland.',
      'Unsere Kunden kommen aus der Industrie und dem Handel in ganz Europa.',
      'Die Firma fertigt Stahlkonstruktionen für Bauunternehmen in ganz Bayern.',
      'Der Betrieb liefert Bauteile an Werften und Maschinenbauer in Norddeutschland.',
      'Das Unternehmen arbeitet mit eigenen Monteuren auf Baustellen in Österreich.',
    ].join('\n')
    expect(fallbackLines(german, 'de', 'Stahlbau GmbH')).toEqual([
      'Die Firma fertigt Stahlkonstruktionen für Bauunternehmen in ganz Bayern.',
      'Der Betrieb liefert Bauteile an Werften und Maschinenbauer in Norddeutschland.',
      'Das Unternehmen arbeitet mit eigenen Monteuren auf Baustellen in Österreich.',
    ])
  })

  it('drops a sentence that refers back to a dropped sentence, as on the Kivirannan website', () => {
    const html = readFileSync(new URL('../../../seed/sites/kivirannan-konepaja/index.html', import.meta.url), 'utf8')
    const markdown = [...html.matchAll(/<(h[1-3]|p|li)[^>]*>([\s\S]*?)<\/\1>/gu)]
      .map((match) => (match[2] ?? '').replace(/<[^>]+>/gu, ' ').trim())
      .join('\n')
    expect(markdown).toContain('Viisiakseliset työstökeskuksemme koneistavat monimutkaiset rungot ja kotelot yhdellä kiinnityksellä. Se lyhentää toimitusaikaa ja parantaa mittatarkkuutta.')
    const lines = fallbackLines(markdown, 'fi', 'Kivirannan Konepaja Oy')
    expect(markdown).toContain('Sama yhteyshenkilö palvelee sinua tarjouksesta toimitukseen.')
    expect(lines).toEqual([
      'Sarjakoot vaihtelevat yksittäisistä prototyypeistä tuhansien kappaleiden sarjoihin.',
      'Jokainen sarja tarkastetaan koordinaattimittauskoneella ennen lähetystä.',
      'Yritys esittelee tuotteitaan ja palveluitaan verkkosivuillaan.',
    ])
    expect(lines.join(' ')).not.toMatch(/sinua|Teollisuustie/u)
    const english = [
      'We build aluminum boats for fishermen and coast guards in Turku.',
      'It shortens the delivery time and keeps the hulls light and strong.',
      'Nordic Boats Oy sells its boats to customers in Finland and Sweden.',
      'They also get a service contract for the first five years of use.',
      'The yard employs about forty people and has its own design office.',
    ].join('\n')
    expect(fallbackLines(english, 'en', 'Nordic Boats Oy')).toEqual([
      'Nordic Boats Oy sells its boats to customers in Finland and Sweden.',
      'They also get a service contract for the first five years of use.',
      'The yard employs about forty people and has its own design office.',
    ])
  })

  it('skips website sentences that speak to the reader, questions, and names or addresses without a lowercase word', () => {
    const company = 'Nordic Steel Oy'
    const finnish = [
      'Sama yhteyshenkilö palvelee sinua tarjouksesta toimitukseen asti.',
      'Tarvitsetko luotettavan kumppanin teräsrakenteiden valmistukseen koko Suomessa?',
      'Nordic Steel Oy, Teollisuustie 14, 36220 Kangasala, Suomi.',
      'Nordic Steel valmistaa teräsrakenteita rakennusyhtiöille ja teollisuudelle koko Suomessa.',
      'Yritys on toiminut Kokkolassa vuodesta 1978 ja työllistää noin 45 henkeä.',
      'Asiakkaita ovat rakennusliikkeet, teollisuus ja julkinen sektori eri puolilla maata.',
    ].join('\n')
    expect(fallbackLines(finnish, 'fi', company)).toEqual([
      'Nordic Steel valmistaa teräsrakenteita rakennusyhtiöille ja teollisuudelle koko Suomessa.',
      'Yritys on toiminut Kokkolassa vuodesta 1978 ja työllistää noin 45 henkeä.',
      'Asiakkaita ovat rakennusliikkeet, teollisuus ja julkinen sektori eri puolilla maata.',
    ])
    const swedish = [
      'Behöver du en offert eller service för din fastighet i Mälardalen?',
      'Ni får alltid samma kontaktperson från offert till färdigt arbete.',
      'Wästerby Rör installerar VVS och ventilation i fastigheter i hela Mälardalen.',
      'Företaget byter stammar i flerbostadshus, skolor och kontor sedan många år.',
      'Montörerna har egna servicebilar och är på plats inom ett dygn.',
    ].join('\n')
    expect(fallbackLines(swedish, 'sv', 'Wästerby Rör AB')).toEqual([
      'Wästerby Rör installerar VVS och ventilation i fastigheter i hela Mälardalen.',
      'Företaget byter stammar i flerbostadshus, skolor och kontor sedan många år.',
      'Montörerna har egna servicebilar och är på plats inom ett dygn.',
    ])
    const german = [
      'Die Firma berät Sie gern bei allen Fragen rund um Hydraulik und Antriebe.',
      'Ihre Anlage steht still und Sie brauchen schnell ein Ersatzteil aus dem Lager?',
      'Die Firma fertigt Stahlkonstruktionen für Bauunternehmen in ganz Bayern.',
      'Der Betrieb liefert Bauteile an Werften und Maschinenbauer in Norddeutschland.',
      'Das Unternehmen arbeitet mit eigenen Monteuren auf Baustellen in Österreich.',
    ].join('\n')
    expect(fallbackLines(german, 'de', 'Stahlbau GmbH')).toEqual([
      'Die Firma fertigt Stahlkonstruktionen für Bauunternehmen in ganz Bayern.',
      'Der Betrieb liefert Bauteile an Werften und Maschinenbauer in Norddeutschland.',
      'Das Unternehmen arbeitet mit eigenen Monteuren auf Baustellen in Österreich.',
    ])
    const english = [
      'Your partner for aluminum boats on the Finnish coast since the year 1985.',
      'Nordic Boats Oy builds aluminum boats for fishermen and coast guards in Turku.',
      'The yard sells its boats to customers in Finland and Sweden every year.',
      'The yard employs about forty people and has its own design office.',
    ].join('\n')
    expect(fallbackLines(english, 'en', 'Nordic Boats Oy')).toEqual([
      'Nordic Boats Oy builds aluminum boats for fishermen and coast guards in Turku.',
      'The yard sells its boats to customers in Finland and Sweden every year.',
      'The yard employs about forty people and has its own design office.',
    ])
  })

  it.each(LANGUAGES)('returns 3 lines that pass checkLines in %s for any text', (lang) => {
    for (const markdown of [finnishSite, '', 'Short text.']) {
      const lines = fallbackLines(markdown, lang, 'Nordic Steel Oy')
      expect(lines).toHaveLength(3)
      for (const line of lines) expect(textLength(line)).toBeLessThanOrEqual(SLOT_LIMITS['your-company.line'] as number)
      expect(checkLines(lines, lang, { task: 'company-lines', lang, company: 'Nordic Steel Oy', text: markdown }).ok).toBe(true)
    }
  })
})

describe('fallbackBriefText', () => {
  it.each(LANGUAGES)('passes checkBriefText in %s', (lang) => {
    for (const data of [
      brief(),
      brief({ figures: { revenue: null, profit: null, valuation: null }, form: null }),
      brief({
        header: { ...brief().header, company: 'Oy Pohjolan Metalli- ja Konepaja Kokkola Ab', owner: 'Anna-Maria von Lindqvist' },
        signals: [
          { key: 'watched_to_end', type: 'positive', evidenceEventId: 3, evidenceText: null, evidenceEvent: null },
          { key: 'replayed_figures_or_buyers', type: 'positive', evidenceEventId: 4, evidenceText: null, evidenceEvent: null },
          { key: 'tapped_buyer_link', type: 'positive', evidenceEventId: 5, evidenceText: null, evidenceEvent: null },
          { key: 'used_calculator', type: 'positive', evidenceEventId: 6, evidenceText: null, evidenceEvent: null },
          { key: 'gave_exact_figures', type: 'positive', evidenceEventId: 7, evidenceText: null, evidenceEvent: null },
          { key: 'forwarded_link', type: 'positive', evidenceEventId: 8, evidenceText: null, evidenceEvent: null },
          { key: 'came_back', type: 'positive', evidenceEventId: 9, evidenceText: null, evidenceEvent: null },
          { key: 'answered_custom_questions', type: 'positive', evidenceEventId: 10, evidenceText: null, evidenceEvent: null },
        ],
      }),
      brief({ engagement: { ...brief().engagement, stopSlide: null, totalWatchS: 0 } }),
    ]) {
      const input = { lang, brief: { ...data, language: lang } }
      const output = fallbackBriefText(input)
      const result = checkBriefText(output, lang, { task: 'brief-text', ...input })
      expect(result, `${lang}: ${output.summary} | ${output.questions.join(' | ')}`).toEqual({ ok: true, errors: [] })
      expect(output.summary).not.toMatch(DASHES)
      expect(new Set(output.questions).size).toBe(output.questions.length)
    }
  })

  it('asks about gaps in the data first, also about a custom question without a form', () => {
    const perSlide = brief().engagement.perSlide.map((s) => ({ ...s, watchS: s.slide === 5 ? 0 : 20 }))
    const output = fallbackBriefText({
      lang: 'en',
      brief: brief({
        figures: { revenue: null, profit: brief().figures.profit, valuation: null },
        engagement: { ...brief().engagement, perSlide, stopSlide: 7 },
        form: null,
        customQuestions: [{ question: 'Successor?', answer: null }],
      }),
    })
    expect(output.questions).toEqual([
      'What was the revenue of your company in the last fiscal year?',
      'Can we go through the questions in the form that you did not answer yet?',
      'When could a sale be a realistic option for you?',
      'What kind of buyer would suit your company best?',
      'What are your goals for the company in the next few years?',
    ])
  })

  it('writes a summary from the data with the stop slide from the input', () => {
    const output = fallbackBriefText({ lang: 'en', brief: brief() })
    expect(output.summary).toBe(
      'Matti Virtanen of Nordic Steel Oy booked a meeting. The interest level is medium. The owner stopped the video at slide 6. The owner sent the form. Positive signals: Came back, Tapped a buyer link.',
    )
    expect(output.questions).toHaveLength(3)
  })
})
