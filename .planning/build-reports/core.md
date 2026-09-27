# Report: server core (SQLite, job queue, domain state machine)

The server core is done. Typecheck and lint are clean, and all tests pass: 72 in my folders, 149 in the full server project, and 251 in shared after my one contract edit.

## Files
All paths are under `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/`.
- **`src/db/`:** `schema.sql`, `index.ts`, `rows.ts`
- **`src/queue/`:** `types.ts`, `keys.ts`, `queue.ts`, `index.ts` (barrel)
- **`src/domain/`:** `errors.ts`, `config.ts`, `analysts.ts`, `deals.ts`, `ensure.ts`, `timelines.ts`, `pipeline.ts`, `stages.ts`, `events.ts`, `tasks.ts`, `brief-data.ts`, `retention.ts`
- **`test/db/`:** `temp-db.ts` (helper), `db.test.ts`
- **`test/queue/`:** `queue.test.ts`, `concurrency.test.ts`, `claimer.ts` (child-process helper)
- **`test/domain/`:** `fixtures.ts` (helper), `pipeline`, `stages`, `retention`, `brief-data`, `ensure`, `analysts` (each `.test.ts`)

## Public exports
All functions take `db: Db` first. Time is an optional `now: Date` last parameter.

**db/index.ts**
- `type Db`, `openDb(file)` (creates the folder, WAL, busy_timeout 5000, foreign_keys, synchronous NORMAL, runs the schema), `getDb()` (singleton on `paths.database`), `closeDb()`, `nowIso(date?)`.
- `sql<Row>(db, text)`: a cached prepared statement.
- `transaction(db, fn)`: BEGIN IMMEDIATE. A nested call becomes a savepoint.

**db/rows.ts**
- Row types: `DealRow` (JSON columns parsed), `DealPatch`, `AnalystRow`, `AnalystIntro`, `TimelineRow`, `RenderStatus`, `SessionRow`, `TaskRow`, `TaskType`, `BriefRow`.
- The `*Columns` raw types with `toDealRow`, `toAnalystRow`, `toTimelineRow`, `toSessionRow`, `toStoredEvent`, `toTaskRow`, `toBriefRow`, plus `DEAL_COLUMNS`, `parseJson` and `toJson`.

**queue**
- Types:
  - `JobType` and `JOB_TYPES`.
  - `JobPayloads`: the discriminated payloads as specified, with the sub-types `AudioPayload`, `RenderPayload` and `PipedriveWritePayload`.
  - `Job<T>` and `AnyJob`: switch on `job.type` to narrow the payload.
- `jobKeys.*` (all keys of the architecture table), `sweepHour`, `backupDate`, `MAX_ATTEMPTS`.
- `NonRetryableError`, `isRetryable`, `retryDelayMs`, `errorText`.
- `enqueue(db, type, key, payload, { runAt?, dealId?, analystId?, now? }): Job<T> | null`. It takes `dealId` and `analystId` from the payload when the options do not give them.
- `enqueuePeriodicJobs(db, now)`: the sweep and backup jobs for the worker loop.
- `getJob`, `jobsForDeal(db, dealId, types?)`, `claimNext`.
- `completeJob(db, id): boolean`.
- `failJob(db, id, error): FailOutcome | null`.
- `resetRunningJobs(db): { requeued, failed: AnyJob[] }`.
- `retryJob(db, id): AnyJob | null`.
- `failedJobs(db, { dealId?, analystId?, type?, includeGlobal? })`.
- `hasQueuedJob(db, type, dealId, predicate?)`.

**domain**
- **errors.ts:** `DomainError(status 400|404|409|410, message, detail?)`. Routes map it to `ApiError`. The 409 of approve has `detail: ReviewReason[]`.
- **config.ts:** `mergeroConfig()` (zod-validated, cached), `contactFor(country)`, `brand()`.
- **analysts.ts:**
  - Reads: `getAnalyst`, `requireAnalyst`, `listAnalysts`.
  - `syncAnalysts(db, pipedrive, { ensureIds?, now? })` and `updateAnalyst(db, id, AnalystPatch)`.
  - Intro: `startIntro(db, id, lang, { recordedAt, transcript })`, `completeIntro(db, id, lang, recordedAt, { file, durationS })` and `failIntro`. The last two return null when a newer recording replaced this one. `readyIntro(analyst, lang)` gives the intro only when it is ready.
  - Voice and other settings: `setVoiceSample`, `completeVoiceClone`, `failVoiceClone`, `setConsent`, `markAlertsSeen`.
  - `toAnalystDto(row, fileUrlBase = '/api/analysts')`: each URL is `{base}/{id}/files/{name}?v=…`.
- **deals.ts:**
  - Link codes: `LINK_CODE_PATTERN`, `newLinkCode()`.
  - Reads: `getDeal`, `requireDeal`, `getDealByCode`, `listDeals(db, { analystId?, country?, status? })`.
  - `updateDeal(db, id, DealPatch)` (typed, JSON columns serialized).
  - Expiry: `isExpired(deal, now)`, `setExpiry(db, id, days)`, `addDays`.
- **ensure.ts:** `ensureDeal(db, { pipedrive, linkedin }, dealId): Promise<{ deal, created }>`.
- **timelines.ts:**
  - Reads: `getTimeline(db, dealId, version?)` (undefined gives the newest, null gives none), `newestTimeline`, `listTimelines`.
  - Writes: `createVersion`, `updateVersion(db, dealId, version, fn)` (atomic read, modify and write), `markRenderStatus`, `setSlideTimes`, `setApproval`, `approveVersion`.
- **pipeline.ts:**
  - `advance(db, dealId): { action, status, reasons }`, `advanceAnalystDeals(db, analystId)`.
  - `publish`, `approveDeal`, `applyReviewPatch(db, dealId, ReviewPatch): { deal, timeline, newVersion, advance }`.
  - `recomputeReviewReasons(deal, timeline, analyst)` and `recordReviewReasons(db, dealId, reasons)` (for `model_failed`).
  - `dealPipelineState(db, dealId)`, which fills `pipeline: { running, step }` directly.
  - `companyLines`, `SCRIPT_SLIDES`, `LINES_SLOT`.
- **stages.ts:** `moveStage(db, dealId, stage, { data?, now? }): { moved, event }`, `markLost`, `closeOpenTasks`, `enqueuePipedriveAnalytics` (one queued job, 60 s delay), `stageRank`, `isPublishedStatus`.
- **events.ts:** `addDealEvent`, `listEvents(db, dealId, { afterId?, types? })`, `listSessions`, `recordBriefRead(db, dealId, briefVersion)` (once per version in 10 min), `alertsFor(db, analystId, since: Date, limit = 50)`.
- **tasks.ts:** `createTask`, `completeTask`, `getTask`, `listOpenTasks(db, { analystId?, dealId? })`, `openTaskFor`, `setTaskActivityId`, `nextSecondChannel(default, firstSessionChannel)`.
- **brief-data.ts:** `buildBriefData(db, dealId): Omit<MeetingBrief, 'questions'>`, `lastOwnerEventId`, `newestBrief`, `saveBrief(db, dealId, brief, lastEventId)`. `saveBrief` adds the brief row, the `brief_written` event and the `note` job.
- **retention.ts:** `purgeExpired(db, now, storageDir = paths.root): Promise<number[]>`.

## Contract edit
- **`packages/shared/src/types.ts`:** the buyers variables became `{ template: 'buyers'; buyers: BuyerSlideItem[]; candidates?: BuyerSlideItem[] }`. Without this field, a buyer that is removed from an unrendered version cannot be restored later, because no version keeps its logo file. The scene ignores the field. The first buyer edit fills it, and write-script can also set it.

## Deviations and decisions
There is no conflict with PRD.md.
1. **Idempotent insert:** `ON CONFLICT (key) DO NOTHING` replaces `INSERT OR IGNORE`. The result is the same for the key, but OR IGNORE also hides CHECK and NOT NULL errors.
2. **Render freeze:** `advance` sets `render_status = 'rendering'` when it adds the render job. An edit on a version that is not `pending` makes a new version. The architecture says this only for `rendered`, but each version gets one render job, because the render key is per version.
3. **Approval after an edit:** a content edit on a pending version clears `approved_at`.
4. **Failed jobs block the pipeline:**
   - The latest failed audio job of a version blocks, with `audio_failed`, so there is no retry loop. An edit on that version retries the failed job.
   - A failed write-script blocks only while its slides are still empty.
   - A failed render job gives `failed` even when the handler did not set `render_status`.
5. **Deal status:** before publication, `advance` sets `draft` (work in progress), `review` (blocked, or rendered and not approved) or `failed`. After publication, `advance` never changes the status.
6. **Review reasons:**
   - `lines_missing` means fewer than 2 non-empty lines (the PRD says "two or three lines").
   - `model_failed` is recorded and stays until it is resolved. `slot: 'your-company.line'` marks a failure of the lines.
   - A rendered, rendering or failed version has no reasons.
   - `script_missing` is resolved on approval only once per version and slide set.
7. **Scrape retry:** when the scrape succeeds on a retry and the version is not approved, `advance` adds write-script `[3]` with `lines: true`. This does not happen when the analyst wrote the lines or a lines `model_failed` exists.
8. **Publish and stage events:**
   - `link_sent` (the event and the stage job) happens only at the first publish.
   - `form_sent` and `meeting_booked` events are written on each call, also without a stage move (a second form, or a lost deal).
   - `meeting_booked` and `lost` close the open tasks.
9. **Expiry:** after publication, `setExpiry` sets `expires_at = now + days`. It gives 409 when the link has expired.
10. **ensureDeal:**
    - It gives 409 when the deal has no organization or no valid country, and 404 for a missing or deleted deal.
    - A missing person is allowed (owner name `''`).
    - A LinkedIn failure is logged and the deal gets no LinkedIn data.
    - Inactive Pipedrive users are synced only when they own the deal.
11. **Brief figures:** a form value comes before the Asiakastieto value.
12. **Tapped buyers:** the brief reads `buyer_link_tap` events with **`data.buyerId` = `MgxBuyer.id`**. The video page must send this key.
13. **Queue failure rules:**
    - `failJob` fails a `ProviderError` with `retryable: false` at once, so the runner does not need to wrap it.
    - `resetRunningJobs` fails a job that already used 3 attempts. This stops crash loops.
    - `failedJobs` hides a failed audio, render or write-brief job when a later job of the same type for that deal is done.

## Contracts for the other agents
- **Runner:**
  - At start, call `resetRunningJobs`, then run `onFinalFailure` for each job in `failed`.
  - When `failJob` returns `status: 'failed'`, run `onFinalFailure` and call `advance` for pipeline jobs.
  - `advance` ignores running jobs, so a job can call it at its own end.
- **scrape:** write `deals.scrape` before the job completes, then call `advance`.
- **write-script:**
  - Version 1 uses `createVersion` with all audio `missing`. Slide 5 must skip `deal.removedBuyers`.
  - A fill job uses `updateVersion` for `payload.slides` only. Never overwrite text with `scriptSource` or `linesSource` `'analyst'`.
  - Record model failures with `recordReviewReasons`.
- **audio:**
  - Process the slides with status `new`, `missing` and `failed`.
  - Apply each result with `updateVersion`, and only when the script is the same as the synthesized text.
  - For a clip failure, set `status: 'failed'` with the error, then throw `NonRetryableError`.
- **render:**
  - On success, call `setSlideTimes`, then `markRenderStatus('rendered')`. On the final failure, call `markRenderStatus('failed')`.
  - `advance` fills the face-cam segment from the current ready intro when it adds the render job.
- **intro and clone jobs:** call the matching analyst function (`completeIntro`, `failIntro`, `completeVoiceClone`, `failVoiceClone`), then `advanceAnalystDeals`.
- **pipedrive-write:**
  - `stage`: skip the write when `stageRank(payload.stage) < stageRank(deal.status)`, because retries can run out of order.
  - `activity_done`: the task can still have no `pipedrive_activity_id`.
- **write-brief:** call `buildBriefData`, then the model, then `saveBrief`.
- **sweep:** use `purgeExpired`, `createTask` with `nextSecondChannel`, and `lastOwnerEventId` compared with `newestBrief().lastEventId`.

## What I verified
- **Typecheck:** `pnpm --filter @mergero/server typecheck` and `pnpm --filter @mergero/shared typecheck` have 0 errors.
- **Lint:** `pnpm exec eslint` on my 6 folders is clean.
- **Tests:**
  - My folders: 9 files and 72 tests pass.
  - `pnpm vitest run --project server`: 20 files and 149 tests pass.
  - `pnpm vitest run --project shared`: 251 tests pass.
- **What the tests cover:**
  - Queue: claim order, keys, backoff (30 s, then 120 s), failure after 3 attempts, `NonRetryableError`, reset, retry.
  - Pipeline: all main `advance` paths, blocked reasons, approval with pending edits, versioning in `applyReviewPatch`, buyer restore.
  - Stages and tasks: `moveStage` forward only, lost, unique tasks, alerts.
  - Retention and briefs: `purgeExpired`, `buildBriefData` on a fixture deal.
  - Providers are mocked.
- **Concurrency:** 3 child Node processes claimed 600 jobs from the same file. They claimed a real mix (for example 79, 258 and 263 jobs), and no job was claimed twice.
- **Native Node run:** a smoke run under Node native type stripping worked (pragmas `wal`, 1, 1, 5000).
- **File scan:** 31 files have no em dash, en dash, BOM, CRLF, TODO or line comment, and each file has a final newline.

## Open issues
1. I did not write `.planning` notes, because I do not own that folder. Decisions 2 to 8 change `architecture.md`. The lead should add them there.
2. A queued job of an older version makes `advance` wait (for example, an obsolete render). This only delays the pipeline.
3. The Vale MCP tools are not available, and I wrote no prose files.
