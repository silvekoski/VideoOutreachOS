import { readStorage } from './storage'

export const THEME_STORAGE_KEY = 'theme'
export const DEFAULT_THEME = 'dark'

export function applyStoredTheme(): void {
  const stored = readStorage(THEME_STORAGE_KEY) ?? DEFAULT_THEME
  const dark =
    stored === 'dark' || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}
