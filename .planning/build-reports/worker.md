The worker and all eight job handlers are finished and tested, and the whole pipeline also works for real on two demo deals. Typecheck and lint are clean, and all 308 server tests (42 files) pass. I made no edits to the contract files.

## Files
All paths are under `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/`.
- **Worker:** `src/worker.ts`.
- **Jobs:** `src/jobs/`: `types.ts`, `runner.ts`, `storage.ts`, `ask-model.ts`, `prompts.ts`, `scrape.ts`, `write-script.ts`, `audio.ts`, `render.ts`, `write-brief.ts`, `pipedrive-write.ts`, `sweep.ts`, `backup.ts`.
- **Tests:** `test/jobs/`: the helpers `helpers.ts` and `storage-env.ts`, plus 10 test files: `scrape`, `write-script`, `audio`, `render`, `write-brief`, `pipedrive-write`, `sweep`, `backup`, `runner`, `pipeline-e2e` (each `.test.ts`), 48 tests in total.

## Public exports
- **`types.ts`:**
  - `interface JobContext { db; providers; scene: SceneRenderer; now(): Date; sleep(ms): Promise<void> }`
  - `SceneRenderer { renderTimeline; renderTemplatePreviews }`
  - `JobHandler<T> { run(job, ctx); onFinalFailure?(job, error, ctx) }`
- **`runner.ts`:**
  - `runJob(ctx, job: AnyJob): Promise<void>` logs a start line and an end line with `durationMs`, then completes or fails the job.
  - `recoverStoppedJobs(ctx)`.
  - A `DomainError` becomes a `NonRetryableError`. On a final failure, the runner calls `onFinalFailure`, then `advance` for scrape, write-script, audio slides and render deal jobs.
- **`scrape.ts`:** `scrapeHandler`, `pickAboutPage(homeUrl, links, extraHomes?): string | null`, `normalizeWebsite(website): string | null`.
- **`render.ts`:** `renderHandler`, `sceneHash(): Promise<string>`, `ensureTemplatePreviews(ctx): Promise<boolean>`.
- **`backup.ts`:** `backupHandler`, `BACKUPS_KEPT = 14`.
- **Other handlers:** `writeScriptHandler`, `audioHandler`, `writeBriefHandler`, `pipedriveWriteHandler`, `sweepHandler`.
- **`ask-model.ts`:** `askModel<T>(model, { system, input, schemaName, jsonSchema, schema, check }, fields?): Promise<{ok:true,value}|{ok:false,errors}>`. It makes two attempts, and the second system prompt names the rejection reasons. A `ModelError` with code `no_json` or `truncated` counts as one failed attempt.
- **`prompts.ts`:** `MODEL_MAX_TOKENS`, `slideScriptPrompt(slide, lang, analystName)`, `companyLinesPrompt(lang)`, `briefTextPrompt(lang)`, `rejectionNote(errors)`.
- **`storage.ts`:** `storageRelative(file)`, `storageFile(file, use)`, `writeFileAtomic(file, data)`.

## Deviations and decisions
1. **Periodic jobs:** the worker enqueues the sweep and backup jobs only when the hour key or the day key changes. It does not insert every second. The result is the same, but see open issue 1 for the reason.
2. **Scrape HTTP errors:** a target page with 429 or 5xx is retried. Any other 4xx (for example 404) fails at once, because a retry cannot fix it. `onFinalFailure` then writes `ok: false` and the pipeline continues.
3. **Too long text at render:** the render job marks the version `failed` and makes a new pending copy of it. The deal then goes to review with `text_too_long`. I did this because the render key is per version, so a render of the same version cannot be queued again after an edit.
4. **Audio:** the job also makes slides with status `failed`, as the server-core report asks.
5. **Brief `last_event_id`:** the brief stores the higher of the payload ID and the current last owner event ID. The brief data covers all events up to the time the job runs.
6. **Filled lines:** when a retried scrape fills the company lines, slide 3 also gets the screenshot if it had none.
7. **Slide 4 model input:** the input includes `revenueText` and `profitText`, so the model can say "7,5 milj. €" and still pass the number check.
8. **Telemetry:** `DISABLE_TELEMETRY` is set in the first statement of `worker.ts`. ESM imports load before it, but the parent process loads no Revideo module, and the scene child process also sets the value.

## Verification
- **Checks:** `pnpm --filter @mergero/server typecheck` and `pnpm exec eslint` on my three paths are clean. `pnpm vitest run --project server` passes all 42 files and 308 tests. My files have no em dash, en dash, TODO or CRLF.
- **End-to-end test (`pipeline-e2e.test.ts`, about 76 s):**
  - It uses a stub scraper, the fake model, the fake speech (`say`), a stub MGX with a logo server, and the real scene render.
  - The job order is scrape, write-script, audio, render. The deal ends in `review`.
  - The 1080p file is H.264 1920x1080 with AAC, the 720p file is 1280x720, and the poster exists. The end time of the last slide matches the video length.
  - After approval, the deal is `link_sent` and the fake Pipedrive stage moves.
- **Demo run** (real API, mock MGX, worker; temporary storage; real `LocalScraper` in Chrome):
  - **Scrape:** both demo sites scraped and the right about page was chosen (`/meista/` and `/ueber-uns/`).
  - **Uploads:** the intro and voice clone jobs ran from the real upload routes.
  - **Render:** deal 4001 gave a 160 s video (4798 frames) in a 42 s render at -16.2 LUFS. Deal 4007 gave a 147 s video in 44 s. The template previews took 9 s.
  - **Frames:** I checked one frame per slide by eye. Figures mode and ask mode both show correctly, logos load, and the Finnish and German labels are filled.
  - **After the render:** I approved the video, sent events, the form and a booking. The stage, fields, analytics and note reached Pipedrive, and the brief was written with a summary.
- **Shutdown:** SIGTERM while a render runs lets the render finish, then the worker exits. When idle, it exits at once.

## Open issues
1. **Job IDs used up (server core):** `enqueue` uses `ON CONFLICT DO NOTHING` with AUTOINCREMENT, so each skipped duplicate uses up a job ID and writes to the database. With the old loop, that was 2 writes per second. My change fixes the worker loop, but other duplicate enqueues still use up IDs. A fix is to check the key with a SELECT before the insert.
2. **Stage skip:** a stage write that runs after a later stage is skipped, as server core designed it. Pipedrive goes straight to the newest stage, for example from nothing to `meeting_booked`.
3. **English MGX texts:** the deal texts in `seed/mgx.json` are English, so they show in English on Finnish and German slides 2 and 6.
4. **Consent needed for the clone:** the voice clone starts only after consent is uploaded. The demo instructions need this step.
5. **Render errors are all retried:** a missing file makes the render fail 3 times over about 2.5 min before it is marked failed. The error does not tell a missing file from a Chrome crash, so I could not stop the retries early.
6. **Not tested with real keys:** Featherless and ElevenLabs were not called with real keys.
7. **No Vale check:** the Vale MCP tools are not available, so I could not check the prompt text with Vale.
