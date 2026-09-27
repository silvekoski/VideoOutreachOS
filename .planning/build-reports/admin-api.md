I built the whole admin HTTP API. All routes in `.planning/api.md` and the task list work, and my 53 tests pass in 5 files. The full server project passes too (42 files, 308 tests).

A prior run had written almost all of it. In this run I checked every route against PRD.md, api.md and the domain code, and made four fixes (see "Changes in this run"). I made no contract edits.

## Files
Under `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/`:
- **Routes** in `src/routes/admin/`: `index.ts`, `context.ts`, `http.ts`, `send-file.ts`, `uploads.ts`, `analysts.ts`, `deals.ts`, `inbox.ts`, `reports.ts`
- **DTO builders** in `src/views/`: `dates.ts`, `urls.ts`, `jobs.ts`, `sessions.ts`, `inbox.ts`, `deal-rows.ts`, `deal-detail.ts`, `review.ts`, `metrics.ts`, `templates.ts`
- **Tests** in `test/admin/`:
  - Helpers: `temp-storage.ts`, `harness.ts`.
  - Tests: `analysts.test.ts`, `deals.test.ts`, `files.test.ts`, `inbox.test.ts`, `metrics.test.ts`.

## Public exports
- **`routes/admin/index.ts`:**
  - `export const adminRoutes = new Hono()`. All routes are under `/api`, with an `onError` that maps to `ApiError`, and a 404 `ApiError` for an unknown `/api/*` path.
  - `configureAdmin(o: { db?: Db; providers?: Pick<Providers,'pipedrive'|'linkedin'>; clock?: () => Date }): void`. `api.ts` already calls it.
- **`send-file.ts`:**
  - `sendFile(c, file, { cacheControl, downloadName? }): Promise<Response>` gives 200, 206 or 416, and handles HEAD without opening a stream.
  - `parseRange(header, size)`.
- **`http.ts`:** `parseId`, `parseInput(schema, value, what)`, `readJson(c, schema)`, `errorResponse`.
  - `DomainError` gives its own status.
  - `ProviderError` gives 502.
  - Any other error gives 500 with a generic message, and the stack goes to the log only.
- **`uploads.ts`:** `uploadLimit(kind)`, `jsonBodyLimit`, `readUpload(c, kind)` (checks the file type from its first bytes), `formText`, `saveUpload` (temp file, then rename).
- **Views:**
  - `inboxDto(db, analyst, now)`, `dealRowDtos(db, filter, now)`, `dealDetailDto(db, deal, { now, pipedriveUrl })`, `reviewDto(db, deal)`
  - `sessionEventsDto(db, id)`, `metricsDto(db, { from, to })`, `computeMetrics(input)`, `readTextSequence(file?)`, `templatePreviews()`

## Deviations and decisions
1. **`POST /api/deals/:id/brief/read`** gives 404 when the deal has no brief. api.md lists only 204.
2. **`GET /api/deals/:id/review`** gives 404 before the first timeline exists.
3. **`GET /api/metrics`:**
   - `from` and `to` are optional. The default is the last 90 days.
   - `from` after `to` gives 400.
   - The range compares the UTC date of `published_at`.
4. **Inbox:**
   - A meeting that started less than 30 minutes ago still shows in Meeting today.
   - A done deal leaves the Inbox, and its failed jobs leave too. Done means lost, expired, or a meeting more than 30 minutes ago. Failed Pipedrive writes of a done deal stay, because Pipedrive is the source of truth.
   - A deal with status `failed` gets its own row only when none of its failed jobs has a row.
5. **Retry:**
   - A failed intro goes back to `processing`, and a failed clone goes back to `pending`.
   - An unpublished pipeline job calls `advance`, so the deal goes from `failed` back to `draft`.
   - A job that is not failed gives 409.
6. **Upload limits:**

   | Upload | Limit | Accepted types |
   |---|---|---|
   | Intro | 200 MB | mp4, mov, webm |
   | Voice | 50 MB | common audio types |
   | Consent | 20 MB | PDF |
   | JSON body | 1 MB | |

   - The consent date must not be in the future in the analyst's time zone.
   - The clone job key uses the time the transcoded sample file was written.
7. **Deal page Events card:** it shows the deal events plus the session events `open`, `buyer_link_tap`, `forward` and `calculator_result`.
8. **Review buyer logos:** `logoUrl` is the MGX logo URL, not the cached file.

## Changes in this run
- **`views/inbox.ts`:** failed jobs with no deal (sweep, backup, intro, clone) now leave the Review group when they no longer need an action.
  - A sweep or backup failure goes when a later run of the same type is done.
  - An intro failure goes when a newer recording replaced it or the intro is ready.
  - A clone failure goes when the clone is ready.
  - Only the newest failure of each job shows.
  - Before, a sweep that failed once stayed in the Inbox for good.
- **`routes/admin/analysts.ts`:** the voice upload gives 400 only when ffmpeg ran and rejected the file. A timeout or a missing ffmpeg binary now gives 500. Before, a timeout gave 400.
- **Tests:**
  - `adminRoutes` in a parent Hono app with its own `onError`, on a real socket: the `ApiError` handler still applies, and range, HEAD and 404 work.
  - The new Inbox rule.
  - Missing ffmpeg gives 500 and leaves no raw upload.
  - A seed fix: the failed intro of analyst 11 now has an intro record, as in the app.

## Verification
- **Typecheck:** `pnpm --filter @mergero/server typecheck` has no errors in my files. It reports one error in `test/jobs/sweep.test.ts`, which is another agent's file.
- **Lint:** `pnpm exec eslint` on my three folders is clean.
- **Tests:** `pnpm vitest run --project server test/admin` gives 5 files and 53 tests passed. The whole server project gives 42 files and 308 tests passed.
- **What the tests cover:**
  - Every route: the happy path and the main errors.
  - The four Inbox groups, and the rows of each analyst.
  - Metrics math: the rates, the average watch time over opened deals, and the first 100 deals of the video and text sequences.
  - Range requests on files (206, 416, suffix and open ranges, multi-range, HEAD).
  - Blocked path traversal (encoded `..`, hidden temp files, other deals).
  - Upload rules, and 413 above 200 MB.
- **File scan:** no em dash, en dash, BOM, CRLF, TODO or line comment, and each file ends with a newline.

## Open issues
1. **Two range helpers:** `src/html/send-file.ts` (other agent) and `src/routes/admin/send-file.ts` (mine) do the same job. The lead should merge them into one.
2. **Uploads use memory:** `c.req.formData()` keeps the whole upload in memory, up to 200 MB for each intro. A streaming parser needs a new dependency such as busboy, and I did not add one.
3. **No sign-in:** the demo has none by design, so the admin API must stay on a private address.
4. **No Vale check:** the Vale MCP tools are not available in this session, so the error and label strings got no Vale check.
