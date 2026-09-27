import { describe, expect, it } from 'vitest'
import { checkBriefText, checkLines, checkScript, checkTranslations, countWords, digitGroups, unknownNumbers } from '../src/checks.ts'

const FI_SCRIPT =
  'Asiakastiedon mukaan Nordic Steel Oy teki tilikaudella 2025 liikevaihtoa 4 200 000 euroa ja liikevoittoa 610 000 euroa. Nämä julkiset luvut ovat hyvä lähtökohta keskustelullemme. Tapaamisessa voimme katsoa yhdessä, mitä luvut tarkoittavat yrityksesi arvolle ja millaisia ostajia ne kiinnostavat.'
const FI_INPUT = { company: 'Nordic Steel Oy', figures: { revenue: 4200000, profit: 610000, fiscalYear: 2025 } }

describe('countWords', () => {
  it('counts tokens with a letter or a digit', () => {
    expect(countWords('Hello, world!')).toBe(2)
    expect(countWords('a - b')).toBe(2)
    expect(countWords('  ')).toBe(0)
    expect(countWords('')).toBe(0)
    expect(countWords('4\u00A0200\u00A0000 euroa')).toBe(4)
    expect(countWords('Hyvää päivää, Jyväskylä!')).toBe(3)
  })
})

describe('digitGroups', () => {
  it('removes group separators of all locales', () => {
    expect([...digitGroups('2 412 000')]).toEqual(['2412000'])
    expect([...digitGroups('2.412.000')]).toEqual(['2412000'])
    expect([...digitGroups('2,412,000')]).toEqual(['2412000'])
    expect([...digitGroups('2\u00A0412\u00A0000')]).toEqual(['2412000'])
    expect([...digitGroups('2\u202F412\u202F000')]).toEqual(['2412000'])
    expect([...digitGroups("2'412'000")]).toEqual(['2412000'])
    expect([...digitGroups('2,4')]).toEqual(['24'])
    expect([...digitGroups('4,2 milj. €')]).toEqual(['42'])
    expect([...digitGroups('1,000.5')]).toEqual(['10005'])
  })

  it('keeps separate numbers apart', () => {
    expect([...digitGroups('in 2025, 12 buyers')]).toEqual(['2025', '12'])
    expect([...digitGroups('2025 12')]).toEqual(['2025', '12'])
    expect([...digitGroups('slides 4 5')]).toEqual(['4', '5'])
    expect([...digitGroups('2026-09-05')]).toEqual(['2026', '9', '5'])
  })

  it('walks strings and numbers in any JSON value', () => {
    const groups = digitGroups({ a: 4_200_000, b: ['NACE 25.62', { c: -150_000 }], d: true, e: null, f: 0.5 })
    expect([...groups].sort()).toEqual(['150000', '2562', '4200000', '5'].sort())
  })

  it('ignores non-finite numbers', () => {
    expect(digitGroups([Number.NaN, Number.POSITIVE_INFINITY]).size).toBe(0)
  })
})

describe('unknownNumbers', () => {
  it('lists each digit group of the output that the input does not have', () => {
    expect(unknownNumbers('Revenue 4 200 000 and profit 700 000, 700 000 again', { revenue: 4200000 })).toEqual(['700000'])
    expect(unknownNumbers('No numbers here', {})).toEqual([])
  })
})

describe('checkScript', () => {
  it('accepts a script with 30 to 60 words in the language and known numbers', () => {
    expect(checkScript(FI_SCRIPT, 'fi', FI_INPUT)).toEqual({ ok: true, errors: [] })
  })

  it('rejects too few and too many words', () => {
    const short = FI_SCRIPT.split(' ').slice(0, 29).join(' ')
    expect(checkScript(short, 'fi', FI_INPUT).errors.join()).toContain('29 words')
    const long = `${FI_SCRIPT} ${FI_SCRIPT}`
    expect(checkScript(long, 'fi', FI_INPUT).ok).toBe(false)
  })

  it('rejects the wrong language', () => {
    const result = checkScript(FI_SCRIPT, 'sv', FI_INPUT)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('language fi, expected sv')
  })

  it('rejects a number that is not in the input', () => {
    const result = checkScript(FI_SCRIPT.replace('610 000', '710 000'), 'fi', FI_INPUT)
    expect(result.errors).toContain('numbers not in the input: 710000')
  })

  it('rejects an empty script', () => {
    expect(checkScript('  ', 'fi', {}).errors).toEqual(['script is empty'])
  })
})

describe('checkLines', () => {
  const lines = [
    'Nordic Steel valmistaa teräsrakenteita rakennusyhtiöille koko Suomessa.',
    'Yritys on toiminut Kokkolassa vuodesta 1978 ja työllistää noin 45 henkeä.',
    'Asiakkaita ovat rakennusliikkeet, teollisuus ja julkinen sektori.',
  ]
  const input = { text: 'vuodesta 1978, 45 henkeä' }

  it('accepts exactly 3 lines in the language within the slot', () => {
    expect(checkLines(lines, 'fi', input)).toEqual({ ok: true, errors: [] })
  })

  it('rejects a wrong shape', () => {
    expect(checkLines('text', 'fi', input).ok).toBe(false)
    expect(checkLines(lines.slice(0, 2), 'fi', input).ok).toBe(false)
    expect(checkLines([...lines.slice(0, 2), ''], 'fi', input).errors).toContain('line 3 is empty')
    expect(checkLines([...lines.slice(0, 2), 5], 'fi', input).errors).toContain('line 3 is empty')
  })

  it('rejects a line over the slot limit', () => {
    const result = checkLines([...lines.slice(0, 2), 'a'.repeat(91)], 'fi', input)
    expect(result.errors).toContain('line 3 has 91 of 90 characters')
  })

  it('rejects the wrong language and unknown numbers', () => {
    expect(checkLines(lines, 'de', input).ok).toBe(false)
    expect(checkLines(lines, 'fi', { text: '' }).errors).toContain('numbers not in the input: 1978, 45')
  })
})

describe('checkBriefText', () => {
  const summary =
    'Matti Virtanen varasi tapaamisen. Kiinnostus videota kohtaan on keskitasoa. Omistaja lopetti katselun dian 6 kohdalla.'
  const questions = [
    'Mikä oli yrityksesi liikevaihto viime tilikaudella?',
    'Milloin myynti voisi olla sinulle realistinen vaihtoehto?',
    'Kuka muu osallistuisi päätökseen myynnistä?',
  ]
  const input = { engagement: { stopSlide: 6 } }

  it('accepts a summary of 60 words or fewer and 3 to 5 questions', () => {
    expect(checkBriefText({ summary, questions }, 'fi', input)).toEqual({ ok: true, errors: [] })
  })

  it('rejects a long summary and a wrong number of questions', () => {
    const long = Array.from({ length: 61 }, () => 'sana').join(' ')
    expect(checkBriefText({ summary: long, questions }, 'fi', input).errors).toContain('summary has 61 words, expected 1 to 60')
    expect(checkBriefText({ summary, questions: questions.slice(0, 2) }, 'fi', input).ok).toBe(false)
    expect(checkBriefText({ summary, questions: [...questions, ...questions] }, 'fi', input).ok).toBe(false)
    expect(checkBriefText({ summary: '', questions }, 'fi', input).ok).toBe(false)
  })

  it('rejects the wrong language and unknown numbers', () => {
    expect(checkBriefText({ summary, questions }, 'en', input).ok).toBe(false)
    expect(checkBriefText({ summary, questions }, 'fi', {}).errors).toContain('numbers not in the input: 6')
  })
})

describe('checkTranslations', () => {
  const sources = [
    { id: 'buyer:b1', text: 'Family-owned group that buys machining and metal workshops to hold long term', max: 80 },
    { id: 'deal:d1', text: 'Family-owned CNC machining shop with 48 staff sold to an industrial holding', max: 90 },
  ]
  const finnish = [
    { id: 'buyer:b1', text: 'Perheyhtiö, joka ostaa koneistamoja ja metallipajoja omistaakseen ne pitkään' },
    { id: 'deal:d1', text: 'Perheomisteinen CNC-koneistamo, jossa on 48 työntekijää, myytiin teollisuusholdingille' },
  ]

  it('accepts texts in the video language with the ids of the input', () => {
    expect(checkTranslations(finnish, 'fi', sources)).toEqual({ ok: true, errors: [] })
  })

  it('accepts texts that stay as they are', () => {
    expect(checkTranslations(sources.map(({ id, text }) => ({ id, text })), 'fi', sources)).toEqual({ ok: true, errors: [] })
  })

  it('rejects missing or reordered ids, long texts, new numbers and the wrong language', () => {
    expect(checkTranslations(finnish.slice(0, 1), 'fi', sources).errors).toEqual(['expected 2 texts'])
    expect(checkTranslations([...finnish].reverse(), 'fi', sources).ok).toBe(false)
    const long = [finnish[0], { id: 'deal:d1', text: `${finnish[1]?.text} ${'lisää '.repeat(10)}` }] as typeof finnish
    expect(checkTranslations(long, 'fi', sources).errors[0]).toMatch(/^text deal:d1 has \d+ of 90 characters$/u)
    const number = [finnish[0], { id: 'deal:d1', text: finnish[1]?.text.replace('48', '49') ?? '' }] as typeof finnish
    expect(checkTranslations(number, 'fi', sources).errors).toEqual(['text deal:d1 has numbers that are not in its source: 49'])
    expect(checkTranslations(finnish, 'de', sources).errors).toEqual(['language fi, expected de'])
    expect(checkTranslations([finnish[0], { id: 'deal:d1', text: ' ' }] as typeof finnish, 'fi', sources).errors).toEqual(['text deal:d1 is empty'])
  })
})
