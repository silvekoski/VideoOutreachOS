import { describe, expect, it } from 'vitest'
import {
  COUNTRY_LANGUAGES,
  DACH,
  LANGUAGE_NAMES,
  countryLanguages,
  countryTimeZone,
  detectLanguage,
  isLang,
  normalizeLang,
  resolveLanguage,
} from '../src/languages.ts'

describe('country data', () => {
  it('maps countries to languages and time zones', () => {
    expect(countryLanguages('FI')).toEqual(['fi', 'sv'])
    expect(countryLanguages('ch')).toEqual(['de'])
    expect(countryLanguages('NL')).toEqual(['en'])
    expect(countryTimeZone('AT')).toBe('Europe/Vienna')
    expect(countryTimeZone('IS')).toBe('Atlantic/Reykjavik')
    expect(countryTimeZone('US')).toBe('Europe/Helsinki')
    expect(DACH).toEqual(['DE', 'AT', 'CH'])
    expect(LANGUAGE_NAMES.nb).toBe('Norwegian')
  })

  it('returns a copy of the country languages', () => {
    countryLanguages('FI').push('en')
    expect(COUNTRY_LANGUAGES.FI).toEqual(['fi', 'sv'])
  })
})

describe('isLang and normalizeLang', () => {
  it('accepts only supported codes', () => {
    expect(isLang('fi')).toBe(true)
    expect(isLang('no')).toBe(false)
    expect(isLang(3)).toBe(false)
  })

  it.each([
    ['fi-FI', 'fi'],
    ['de-CH', 'de'],
    ['sv_FI', 'sv'],
    ['EN', 'en'],
    [' da ', 'da'],
    ['no', 'nb'],
    ['nn', 'nb'],
    ['nb-NO', 'nb'],
    ['fr', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%s gives %s', (value, expected) => {
    expect(normalizeLang(value)).toBe(expected)
  })
})

describe('resolveLanguage', () => {
  it('uses the website language when it is a country language and LinkedIn agrees or is empty', () => {
    expect(resolveLanguage({ country: 'FI', siteLanguage: 'sv', linkedinLanguages: [] })).toBe('sv')
    expect(resolveLanguage({ country: 'FI', siteLanguage: 'sv', linkedinLanguages: ['sv', 'en'] })).toBe('sv')
  })

  it('skips the website language when LinkedIn lists other languages without it', () => {
    expect(resolveLanguage({ country: 'FI', siteLanguage: 'sv', linkedinLanguages: ['fi', 'en'] })).toBe('fi')
  })

  it('skips a website language that is not a country language', () => {
    expect(resolveLanguage({ country: 'DE', siteLanguage: 'en', linkedinLanguages: [] })).toBe('de')
  })

  it('uses the first country language that LinkedIn lists', () => {
    expect(resolveLanguage({ country: 'FI', siteLanguage: null, linkedinLanguages: ['en', 'sv'] })).toBe('sv')
  })

  it('falls back to the first country language and then to English', () => {
    expect(resolveLanguage({ country: 'FI', siteLanguage: null, linkedinLanguages: ['en'] })).toBe('fi')
    expect(resolveLanguage({ country: 'NO', siteLanguage: 'en', linkedinLanguages: ['en'] })).toBe('nb')
    expect(resolveLanguage({ country: 'NL', siteLanguage: null, linkedinLanguages: ['de'] })).toBe('en')
  })
})

describe('detectLanguage', () => {
  it.each([
    ['fi', 'Mergero auttaa vakiintuneiden yritysten omistajia löytämään oikean ostajan yritykselleen.'],
    ['sv', 'Mergero hjälper ägare till etablerade företag att hitta rätt köpare för sitt företag.'],
    ['nb', 'Mergero hjelper eiere av etablerte selskaper med å finne riktig kjøper til selskapet sitt.'],
    ['da', 'Mergero hjælper ejere af etablerede virksomheder med at finde den rette køber til virksomheden.'],
    ['de', 'Mergero hilft Inhabern etablierter Unternehmen, den passenden Käufer für ihr Unternehmen zu finden.'],
    ['en', 'Mergero helps owners of established companies find the right buyer for their company.'],
  ])('detects %s', (lang, text) => {
    expect(detectLanguage(text)).toBe(lang)
  })

  it('returns null for fewer than 8 words or for text without letters', () => {
    expect(detectLanguage('Nordic Steel Oy valmistaa teräsrakenteita Kokkolassa.')).toBeNull()
    expect(detectLanguage('1 2 3 4 5 6 7 8 9 10')).toBeNull()
    expect(detectLanguage('')).toBeNull()
  })
})
