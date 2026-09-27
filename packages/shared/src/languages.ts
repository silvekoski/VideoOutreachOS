import { detect } from 'tinyld'
import { LANGUAGES } from './types.ts'
import type { Lang } from './types.ts'
import { countWords } from './words.ts'

export const COUNTRY_LANGUAGES: Record<string, Lang[]> = {
  FI: ['fi', 'sv'],
  SE: ['sv'],
  NO: ['nb'],
  DK: ['da'],
  DE: ['de'],
  AT: ['de'],
  CH: ['de'],
}

export const COUNTRY_TIME_ZONES: Record<string, string> = {
  FI: 'Europe/Helsinki',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen',
  IS: 'Atlantic/Reykjavik',
  DE: 'Europe/Berlin',
  AT: 'Europe/Vienna',
  CH: 'Europe/Zurich',
}

export const LANGUAGE_NAMES: Record<Lang, string> = {
  fi: 'Finnish',
  sv: 'Swedish',
  nb: 'Norwegian',
  da: 'Danish',
  de: 'German',
  en: 'English',
}

export const LANGUAGE_LOCALES: Record<Lang, string> = {
  fi: 'fi-FI',
  sv: 'sv-SE',
  nb: 'nb-NO',
  da: 'da-DK',
  de: 'de-DE',
  en: 'en-US',
}

export const DACH: readonly string[] = ['DE', 'AT', 'CH']

const DETECT_ONLY = ['fi', 'sv', 'no', 'da', 'de', 'en']
const MIN_DETECT_WORDS = 8
const NORWEGIAN = new Set(['no', 'nb', 'nn'])

export function countryLanguages(country: string): Lang[] {
  return [...(COUNTRY_LANGUAGES[country.trim().toUpperCase()] ?? ['en'])]
}

export function countryTimeZone(country: string): string {
  return COUNTRY_TIME_ZONES[country.trim().toUpperCase()] ?? 'Europe/Helsinki'
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

export function normalizeLang(value: string | null | undefined): Lang | null {
  const primary = value?.trim().toLowerCase().split(/[-_]/)[0]
  if (!primary) return null
  if (NORWEGIAN.has(primary)) return 'nb'
  return isLang(primary) ? primary : null
}

export function resolveLanguage(input: { country: string; siteLanguage: Lang | null; linkedinLanguages: Lang[] }): Lang {
  const options = countryLanguages(input.country)
  const site = input.siteLanguage
  const linkedin = input.linkedinLanguages
  if (site && options.includes(site) && (linkedin.length === 0 || linkedin.includes(site))) return site
  return options.find((lang) => linkedin.includes(lang)) ?? options[0] ?? 'en'
}

export function detectLanguage(text: string): Lang | null {
  if (countWords(text) < MIN_DETECT_WORDS) return null
  const code = detect(text, { only: DETECT_ONLY })
  if (code === '') return null
  return code === 'no' ? 'nb' : isLang(code) ? code : null
}
