import type { ProviderStatus } from '@mergero/shared'
import { env } from '../env.ts'
import { log } from '../log.ts'
import { paths } from '../paths.ts'
import { AsiakastietoClient } from './asiakastieto.ts'
import { ElevenLabsClient } from './elevenlabs.ts'
import { FeatherlessClient } from './featherless.ts'
import { FirecrawlScraper } from './firecrawl.ts'
import { SeedLinkedInSource } from './linkedin.ts'
import { McpMgxClient } from './mgx.ts'
import { FakeModel } from './model-fake.ts'
import { loadPipedriveConfig } from './pipedrive-config.ts'
import { FakePipedriveClient } from './pipedrive-fake.ts'
import { RealPipedriveClient } from './pipedrive-real.ts'
import { LocalScraper } from './scraper-local.ts'
import { FakeSpeech } from './speech-fake.ts'
import type { PipedriveClient, Providers } from './types.ts'

function fake<T>(provider: string, missing: string, fallback: string, client: T): T {
  log.warn('fake provider in use', { provider, reason: `${missing} is not set`, fake: fallback })
  return client
}

function realPipedrive(token: string): PipedriveClient {
  if (!env.pipedriveDomain) throw new Error('PIPEDRIVE_COMPANY_DOMAIN must be set when PIPEDRIVE_API_TOKEN is set')
  return new RealPipedriveClient({ token, domain: env.pipedriveDomain, config: loadPipedriveConfig() })
}

export function createProviders(): Providers {
  return {
    pipedrive: env.pipedriveToken
      ? realPipedrive(env.pipedriveToken)
      : fake('pipedrive', 'PIPEDRIVE_API_TOKEN', `JSON store at ${paths.fakePipedrive}`, new FakePipedriveClient()),
    scraper: env.firecrawlKey
      ? new FirecrawlScraper(env.firecrawlKey)
      : fake('firecrawl', 'FIRECRAWL_API_KEY', `local Chrome at ${env.chromePath}`, new LocalScraper(env.chromePath)),
    model: env.featherlessKey
      ? new FeatherlessClient(env.featherlessKey)
      : fake('featherless', 'FEATHERLESS_API_KEY', 'template writer from @mergero/shared', new FakeModel()),
    speech: env.elevenlabsKey
      ? new ElevenLabsClient(env.elevenlabsKey, env.elevenlabsModel)
      : fake('elevenlabs', 'ELEVENLABS_API_KEY', 'macOS say or silence', new FakeSpeech()),
    mgx: new McpMgxClient(env.mgxUrl),
    financials: new AsiakastietoClient(env.asiakastietoUrl),
    linkedin: new SeedLinkedInSource(),
  }
}

export function providerStatus(): ProviderStatus {
  return {
    pipedrive: env.pipedriveToken ? 'real' : 'fake',
    firecrawl: env.firecrawlKey ? 'real' : 'fake',
    featherless: env.featherlessKey ? 'real' : 'fake',
    elevenlabs: env.elevenlabsKey ? 'real' : 'fake',
    mgxUrl: env.mgxUrl,
  }
}
