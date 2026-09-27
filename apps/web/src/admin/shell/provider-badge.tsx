import type { ProviderStatus } from '@mergero/shared'
import { FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useProviderStatus } from '../api'

const PROVIDERS: { key: Exclude<keyof ProviderStatus, 'mgxUrl'>; label: string; fake: string }[] = [
  { key: 'pipedrive', label: 'Pipedrive', fake: 'local JSON file with seed data' },
  { key: 'firecrawl', label: 'Firecrawl', fake: 'local headless Chrome scraper' },
  { key: 'featherless', label: 'Featherless (Kimi-K3)', fake: 'template writer' },
  { key: 'elevenlabs', label: 'ElevenLabs', fake: 'local system voice' },
]

export function ProviderBadge() {
  const status = useProviderStatus()
  if (!status.data) return null
  const data = status.data
  const fakes = PROVIDERS.filter((provider) => data[provider.key] === 'fake')
  if (fakes.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          aria-label="Demo providers"
          className="border-amber-500/50 text-amber-700 dark:text-amber-300"
        >
          <FlaskConical aria-hidden="true" />
          <span className="hidden md:inline">Demo providers</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm">
        <p className="font-medium">These providers use a fake:</p>
        <ul className="mt-2 grid gap-1">
          {fakes.map((provider) => (
            <li key={provider.key}>
              <span className="font-medium">{provider.label}</span>
              <span className="text-muted-foreground">{`: ${provider.fake}`}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{`MGX server: ${data.mgxUrl}`}</p>
      </PopoverContent>
    </Popover>
  )
}
