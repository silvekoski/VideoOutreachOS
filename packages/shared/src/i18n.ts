import type { Strings } from './i18n/base.ts'
import { strings as da } from './i18n/da.ts'
import { strings as de } from './i18n/de.ts'
import { strings as en } from './i18n/en.ts'
import { strings as fi } from './i18n/fi.ts'
import { strings as nb } from './i18n/nb.ts'
import { strings as sv } from './i18n/sv.ts'
import type { Lang, TemplateName } from './types.ts'

export * from './i18n/base.ts'

export const STRINGS: Record<Lang, Strings> = { fi, sv, nb, da, de, en }

export function t(lang: Lang): Strings {
  return STRINGS[lang] ?? STRINGS.en
}

export function slideLabels(lang: Lang, template: TemplateName): Record<string, string> {
  return { ...t(lang).slides[template] }
}
