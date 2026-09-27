import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROFIT_RANGES, REVENUE_RANGES, STRINGS, fill, slideLabels, t } from '../src/i18n.ts'
import { LANGUAGE_LOCALES } from '../src/languages.ts'
import { LANGUAGES } from '../src/types.ts'

const DASHES = /[\u2013\u2014]/u

function leaves(value: unknown, prefix = ''): [string, string][] {
  if (typeof value === 'string') return [[prefix, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key))
  }
  return []
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/gu)].map((m) => m[1]).sort()

describe('STRINGS', () => {
  it('has no em dash or en dash in any string', () => {
    for (const lang of LANGUAGES) {
      for (const [key, text] of leaves(STRINGS[lang])) expect(text, `${lang} ${key}`).not.toMatch(DASHES)
    }
  })

  it('has the same keys and placeholders in each language as in English', () => {
    const english = new Map(leaves(STRINGS.en))
    for (const lang of LANGUAGES) {
      const strings = leaves(STRINGS[lang])
      expect(strings.map(([key]) => key).sort(), lang).toEqual([...english.keys()].sort())
      for (const [key, text] of strings) {
        expect(text.trim(), `${lang} ${key}`).not.toBe('')
        expect(placeholders(text), `${lang} ${key}`).toEqual(placeholders(english.get(key) ?? ''))
      }
    }
  })

  it('uses the locales of LANGUAGE_LOCALES', () => {
    for (const lang of LANGUAGES) expect(STRINGS[lang].locale).toBe(LANGUAGE_LOCALES[lang])
  })

  it('labels each revenue and profit range option', () => {
    for (const lang of LANGUAGES) {
      expect(Object.keys(STRINGS[lang].page.revenueRanges).sort()).toEqual(REVENUE_RANGES.map((r) => r.value).sort())
      expect(Object.keys(STRINGS[lang].page.profitRanges).sort()).toEqual(PROFIT_RANGES.map((r) => r.value).sort())
    }
  })

  it('orders range options with consistent bounds', () => {
    for (const ranges of [REVENUE_RANGES, PROFIT_RANGES]) {
      for (let i = 1; i < ranges.length; i += 1) expect(ranges[i]?.min).toBe(ranges[i - 1]?.max)
    }
  })
})

describe('source files', () => {
  it('have no em dash or en dash', () => {
    const root = path.resolve(import.meta.dirname, '..')
    for (const dir of ['src', 'test']) {
      for (const entry of readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue
        const file = path.join(entry.parentPath, entry.name)
        expect(readFileSync(file, 'utf8'), path.relative(root, file)).not.toMatch(DASHES)
      }
    }
  })
})

describe('language modules', () => {
  it('each hold the strings of one language', async () => {
    for (const lang of LANGUAGES) {
      const module = (await import(`../src/i18n/${lang}.ts`)) as { strings: unknown }
      expect(module.strings, lang).toBe(STRINGS[lang])
    }
  })

  it('have the same exports in the i18n entry as in the base module', async () => {
    const base = await import('../src/i18n/base.ts')
    const entry = await import('../src/i18n.ts')
    for (const name of Object.keys(base)) expect(entry, name).toHaveProperty(name)
  })
})

describe('t, slideLabels and fill', () => {
  it('returns the strings of a language and falls back to English', () => {
    expect(t('de').page.play).toBe('Video abspielen')
    expect(t('xx' as never)).toBe(STRINGS.en)
  })

  it('returns a copy of the labels of a template', () => {
    const labels = slideLabels('fi', 'privacy')
    labels.headline = 'changed'
    expect(STRINGS.fi.slides.privacy.headline).not.toBe('changed')
    expect(slideLabels('en', 'facecam')).toEqual({})
  })

  it('fills known placeholders and keeps unknown ones', () => {
    expect(fill('{analyst} made a video for {company}', { analyst: 'Johanna', company: 'A$&B Oy' })).toBe(
      'Johanna made a video for A$&B Oy',
    )
    expect(fill('Slide {n}: {name}', { n: 3 })).toBe('Slide 3: {name}')
  })
})
