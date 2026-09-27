import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '@mergero/shared'
import { STRINGS } from '@mergero/shared/i18n'
import { loadStrings } from '../../src/video/strings.ts'

describe('loadStrings', () => {
  it('loads the strings of each page language', async () => {
    for (const lang of LANGUAGES) expect(await loadStrings(lang), lang).toBe(STRINGS[lang])
  })

  it('falls back to English for an unknown language', async () => {
    expect(await loadStrings('xx' as never)).toBe(STRINGS.en)
  })
})
