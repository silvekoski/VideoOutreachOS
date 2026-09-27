import type { ProviderStatus } from '@mergero/shared'
import { useProviderStatus } from '../api'

const PROVIDERS: { key: Exclude<keyof ProviderStatus, 'mgxUrl'>; label: string; fake: string }[] = [
  { key: 'pipedrive', label: 'Pipedrive', fake: 'local JSON file with seed data' },
  { key: 'firecrawl', label: 'Firecrawl', fake: 'local headless Chrome scraper' },
  { key: 'featherless', label: 'Featherless (Kimi-K3)', fake: 'template writer' },
  { key: 'elevenlabs', label: 'ElevenLabs', fake: 'local system voice' },
]

export interface DemoProviders {
  fakes: typeof PROVIDERS
  mgxUrl: string
}

export function useDemoProviders(): DemoProviders | null {
  const data = useProviderStatus().data
  if (!data) return null
  const fakes = PROVIDERS.filter((provider) => data[provider.key] === 'fake')
  return fakes.length > 0 ? { fakes, mgxUrl: data.mgxUrl } : null
}
