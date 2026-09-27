import type { Lang } from '@mergero/shared'
import type { Strings } from '@mergero/shared/i18n/base'

const LOADERS: Record<Lang, () => Promise<{ strings: Strings }>> = {
  fi: () => import('@mergero/shared/i18n/fi'),
  sv: () => import('@mergero/shared/i18n/sv'),
  nb: () => import('@mergero/shared/i18n/nb'),
  da: () => import('@mergero/shared/i18n/da'),
  de: () => import('@mergero/shared/i18n/de'),
  en: () => import('@mergero/shared/i18n/en'),
}

export async function loadStrings(lang: Lang): Promise<Strings> {
  return (await (LOADERS[lang] ?? LOADERS.en)()).strings
}
