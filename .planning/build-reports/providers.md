# Report: server provider clients and ffmpeg helpers

All provider clients and the ffmpeg helpers are written. Typecheck, lint and all 77 of my tests pass, and fake mode works end to end with the real seed files.

## Files
All paths are under `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/`.
- `src/providers/`: `errors.ts` (new, shared error types), `index.ts`, `pipedrive-config.ts`, `pipedrive-real.ts`, `pipedrive-fake.ts`, `consent-script.ts`, `firecrawl.ts`, `scraper-local.ts`, `featherless.ts`, `model-fake.ts`, `elevenlabs.ts`, `speech-fake.ts`, `mgx.ts`, `asiakastieto.ts`, `linkedin.ts`
- `src/media/ffmpeg.ts`
- `test/providers/`: `pipedrive-real`, `pipedrive-fake`, `featherless`, `elevenlabs`, `firecrawl`, `mgx`, `scraper-local`, `speech-fake`, `model-fake`, `linkedin` (each `.test.ts`)
- `test/media/ffmpeg.test.ts`

## Public exports
- **`index.ts`:**
  - `createProviders(): Providers` logs one `warn` line per fake provider.
  - `providerStatus(): ProviderStatus`.
  - Real Pipedrive throws at startup if `PIPEDRIVE_COMPANY_DOMAIN` or `config/pipedrive.json` is missing.
- **`errors.ts`:**
  - `class ProviderError extends Error { provider; retryable: boolean; status: number|null; code: string|null }`
  - `class ScrapeError extends ProviderError { reason: ScrapeFailure }`
  - `fetchFailure(error)`, `isRetryableStatus(status)`
- **`featherless.ts`:**
  - `class ModelError extends ProviderError`
  - `class FeatherlessClient(apiKey)`
  - `firstJsonValue(content): unknown`, `stripReasoning(content): string`
- **Other providers:**
  - `loadPipedriveConfig(file?): PipedriveConfig` (sync, zod-validated)
  - `class RealPipedriveClient({ token, domain, config })`
  - `class FakePipedriveClient({ file?, seedFile? })`
  - `class FirecrawlScraper(apiKey)`
  - `class LocalScraper(chromePath)`
  - `class FakeModel`
  - `class ElevenLabsClient(apiKey, model)`
  - `class FakeSpeech`
  - `class McpMgxClient(url)`
  - `class AsiakastietoClient(baseUrl)`
  - `class SeedLinkedInSource(file?)`
- **`consent-script.ts`:**
  - `consentScript(phase: 'accept'|'cleanup'): string`
  - `CMP_CONTAINERS`, `CONSENT_HINT_PATTERN`, `CONSENT_SETTLE_MS`, `CONSENT_AFTER_CLICK_MS`
  - `scrapeLocale(country)`
- **`media/ffmpeg.ts`:**
  - `probeDurationS`, `loudnormToMp3`, `transcodeIntro`, `transcodeVoiceSample`, `faststart`, `make720`, `posterFrame`, `ogImage`, `integratedLoudness` (returns `number|null`), `silenceMp3`
  - `class FfmpegError { stderrTail }`
  - Each function that writes a file writes to a temp file, then renames it, and creates the output folder when needed.

## Contract edit
One additive change to `providers/types.ts`: `scrapeHome(url, country?)` and `scrapeMarkdown(url, country?)`.

## Behavior other agents need to handle
- **Job runner:**
  - Map `err instanceof ProviderError && !err.retryable` to `NonRetryableError`.
  - `ModelError` code `no_json` or `truncated` has `retryable: false`. Callers should count it as one failed model attempt (ask again once), not as a failed job.
- **Scrape job:** map `ScrapeError.reason` to `ScrapeResult.reason`. Firecrawl returns the target page status as `statusCode`, so the job decides whether a 404 page is a failure.
- **MGX client:** it does not filter out buyers with `namePublic: false`. The consumer must do that.
- **Fake Pipedrive:**
  - `dealUrl` returns `https://fake-pipedrive.invalid/deal/{id}`. The `.invalid` domain is reserved and never resolves, so the link cannot mislead.
  - `stageId` is the stage index plus 1 (1 to 4).
  - The store adds fields beyond the seed: deal `lostReason` and `fields`, activity `done`, `addTime`, `doneTime`, and note times.
- **Other providers:**
  - Real Pipedrive reads the country code from the organization address. Old region codes are canonicalized, so "DD" becomes "DE".
  - ElevenLabs leaves out `language_code` for `eleven_multilingual_v2`.
  - Fake speech prefers these `say` voices: Satu, Alva, Nora, Sara, Anna, Samantha.

## Conflicts and deviations
- **LinkedIn key:** `.planning/architecture.md` "Decisions" item 1 says `linkedin.json` is keyed on the Pipedrive person ID. "Seed files" and the task say lower-case email. I used email, which matches the seed that exists. There is no conflict with PRD.md.
- **Fake voice ID:** the architecture says the fake clone returns `fake-{analyst}`. I followed the task: `fake-` plus the first 10 hex characters of the SHA-256 of the name.

## What I verified
- **Type checks:**
  - `pnpm --filter @mergero/server typecheck` gives 0 errors, with the real shared index in place.
  - Before the shared index existed, I checked against a scratch stub of the listed shared exports.
- **Tests:** `pnpm vitest run --project server test/providers test/media` gives 11 files and 77 tests passed.
  - Loudness from the helpers measured -16.3 LUFS (MP3) and -16.2 LUFS (intro).
  - The local scraper test runs in real Chrome. It checks that the consent click happened, the Markdown extraction, and a 1440 x 900 PNG.
  - The Pipedrive 429 test waits 1 s for Retry-After.
- **Lint:** `pnpm exec eslint` on my four folders is clean. A scan found no em dash, no en dash, no CRLF and no BOM.
- **Node native type stripping:** every module loads. The `toString()` source of the consent script parses as JavaScript.
- **Fake mode end to end:** `createProviders()` with the real `seed/pipedrive.json` and `seed/linkedin.json`, and a temp `STORAGE_DIR`, worked.
- **MGX:** my client against the real `apps/mgx-mock` on port 3197 returned buyers, closed deals and a receipt. I stopped the server afterwards.

## Open issues
- **Fake Pipedrive with two processes:** writes are serialized only inside one process. If the API and the worker write in the same moment, the last write wins. This is acceptable for the demo.
- **Not tested with real keys:** there were no real Pipedrive, Firecrawl, Featherless or ElevenLabs keys. Request shapes follow the research files and are tested only against mocks.
- **Firecrawl cache:** it sends `maxAge: 0`, so each scrape is a fresh fetch (the cost is the same, 1 credit).
- **Seed script and lost reason:** real Pipedrive truncates the lost reason to 255 characters. Whether Pipedrive has a limit is not verified.
