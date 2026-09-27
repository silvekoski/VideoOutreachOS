The API entry point, the HTML rendering, the video page routes and the mock Asiakastieto route are done. In my files, typecheck and eslint are clean. My 58 tests pass, and the full server project passes (35 files, 279 tests). The server typecheck has one error, in another agent's file that is still in progress. I made no edits to the contract files.

## Files
All paths are under `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/`.
- **Entry:** `src/api.ts`
- **HTML:** `src/html/escape.ts`, `vite.ts`, `pages.ts`, `send-file.ts`, `errors.ts`, `routes.ts`
- **Routes:** `src/routes/video/index.ts`, `src/routes/mock/index.ts`
- **Video page logic:** `src/video/access.ts`, `page-data.ts`, `valuation.ts`, `ingest.ts`, `form.ts`, `booking.ts`, `zoned-time.ts`
- **Tests:** `test/video/harness.ts` (helper), plus `page`, `media`, `events`, `form`, `booking`, `mock`, `html` (each `.test.ts`)

## Public exports
- **`api.ts`:** no exports, only the entry.
  - It does these steps in order:
    1. In production, it checks the Vite manifest and exits with code 1 if it is missing.
    2. It opens the database with `getDb()` and makes one provider set with `createProviders()`.
    3. It passes both to the admin routes with `configureAdmin({ db, providers })`, so there is only one provider set.
    4. It writes one JSON request log line per request.
    5. It mounts the routes in this order: `adminRoutes`, video, mock, HTML.
    6. It sets `notFound`, `onError` and `serve`.
    7. It syncs the analysts. An error is logged and the API keeps running.
  - On SIGTERM or SIGINT it closes the server, the MGX client and the database. After 5 s it force-closes the open connections. A second signal exits at once.
- **`html/vite.ts`:**
  - `viteAssets({ production, devUrl, distDir }): AssetTags`, where `AssetTags = (entry: 'admin' | 'video') => string`.
  - Development: the React preamble, then `@vite/client`, then the entry.
  - Production: reads the manifest once and emits the entry script, the CSS of the entry and its imports, and `modulepreload` links.
- **`html/pages.ts`:**
  - `adminDocument(assets)`
  - `videoDocument({ data, pageUrl, imageUrl, assets })`
  - `messagePage({ lang, title, text, contact? })`
  - `preferredLanguage(acceptLanguage): Lang`
- **`html/send-file.ts`:** `sendFile(c, file, { contentType, cacheControl }): Promise<Response | null>` and `parseRange(header, size)`. It supports range requests (206 and 416), HEAD without opening a stream, and `nosniff`.
- **`html/errors.ts`:** `handleError` and `handleNotFound`.
  - They return ApiError JSON for `/api/*`, for requests that are not GET or HEAD, and for `Accept: application/json`.
  - Other requests get a plain English HTML page.
  - A 500 does not show the error text.
- **`html/routes.ts`:** `createHtmlRoutes({ assets, distDir })`.
  - Admin HTML for `/`, `/deals`, `/deals/:id` (digits only), `/deals/:id/review` and `/metrics`.
  - `/assets/:file` with `public, max-age=31536000, immutable`.
- **`routes/video/index.ts`:** `createVideoRoutes({ db, mgx: Pick<MgxClient,'submitForm'>, storageDir, publicBaseUrl, assets, now? }): Hono`
- **`routes/mock/index.ts`:** `createMockRoutes(seedFile): Hono`. It reads the seed once, validates it with zod, and reads it again after a failure.
- **`video/access.ts`:** `findLink`, `pageVersion(db, deal, preview)`, `requireLiveLink`, `requirePublishedLink`
- **`video/page-data.ts`:** `buildPageData(db, deal, row, { preview, now }): VideoPageData`, `mediaUrls`, `introTranscript(analyst, lang)`
- **`video/valuation.ts`:**
  - `calculatorEnabled(deal)`
  - `dealValuation(deal, profit)`: the multiples come from `mgx.sectorDeals` plus `mgx.recentDeals`, unique by ID, through `multiplesFor`.
  - `calculatorFor(deal)`
- **`video/ingest.ts`:** `ingestBatch(db, dealId, batch, now?): { stored, firstOpen }`, in one transaction.
- **`video/form.ts`:** `submitForm(db, mgx, dealId, body, now?): Promise<FormSubmitResult>` and `class MgxSubmitError` (the route maps it to 502).
- **`video/booking.ts`:** `slotGrid(tz, now)`, `freeSlots(db, analyst, now)`, `dealSlots(db, dealId, now?)`, `bookMeeting(db, dealId, body, now?): string`. The booking re-checks the slot inside a BEGIN IMMEDIATE transaction.
- **`video/zoned-time.ts`:** `localDate`, `localDay`, `shiftDays`, `weekday`, `zonedTime`. They use Intl, because Node 26 has no Temporal.

## Deviations and decisions
There is no conflict between PRD.md and the architecture in this scope.
- **Theme script:** the default theme is `"dark"`, not `"system"` as in `research/ui.md`. This matches `apps/web/src/lib/theme.ts` (`DEFAULT_THEME = 'dark'`) and `apps/web/index.html`, so the first paint does not change theme.
- **`twitter:card`:** it is `summary_large_image` only when `og-image.jpg` exists. Otherwise it is `summary`. There is also `og:locale` and `og:image:type`.
- **Preview:** the media, captions and og-image routes select the version with the same rule as the page. The media URLs in the bootstrap end with `?preview=1` in preview mode.
- **Slots for unpublished deals:** `/slots` also works for an unpublished deal, so the calendar works in a preview. It is read-only. Form and booking need a published link, else 404.
- **Extra headers:** every `/v/*` response also gets `Referrer-Policy: no-referrer`. Without it, a tap on a buyer website link sends the link code in the Referer header. All server HTML has `<link rel="icon" href="data:,">`, so there are no favicon 404 errors in the console.
- **404 page:**
  - Its language comes from Accept-Language.
  - It shows the contact details of the default office and the privacy notice.
- **Form:**
  - An empty form gives 400, with no call to MGX.
  - Empty custom answers and custom answers with an unknown question ID are dropped.
  - `notInterestedReason` is kept only when the timing is `not_interested`.
  - MGX gets `{ ...FormAnswers, valuation }`.
  - The fields job key is `pipedrive-write:{deal}:fields:{receiptId}`.
  - If the owner gives no lost reason, the reason is "Not interested in a sale".
- **Deal events:** `moveStage` already writes the `form_sent` and `meeting_booked` events, so I do not write them again.
- **Booking:**
  - It gives 409 for any time that is not a free slot now: a taken slot, an old slot, or a time that is not on the grid.
  - A meeting that is not on the 30 minute grid blocks both slots that it overlaps.
  - The booking also calls `closeOpenTasks` itself, so tasks close on a lost deal too.
- **Events:**
  - An empty batch creates no session.
  - A session ID that belongs to another deal gives 400.
  - A body above 256 KB on `/v/:code/*` gives 413.
  - Batches for preview or expired links get 204 and are not stored, as the task says.

## Verification
- **Typecheck:** `pnpm --filter @mergero/server typecheck` has no errors in my files. The only error is in `test/jobs/audio.test.ts`: it imports `SpeechRequest` from `@mergero/shared`. That file belongs to another agent.
- **Lint:** `pnpm exec eslint` on my folders is clean.
- **Tests:** `test/video` has 7 files and 58 tests, all passing. `pnpm vitest run --project server` gives 35 files and 279 tests, all passing.
- **File scan:** my 24 files have no em dash, no en dash, no BOM, no CRLF and no line comments, and each file has a final newline.
- **API process runs:** I ran `node src/api.ts` with fake providers and a temporary STORAGE_DIR, once in development mode and once in production mode.
  - The admin HTML had the manifest tags, and an asset was served with the immutable cache header.
  - The analyst sync worked.
  - `/api/*` returned JSON 404 (from the admin catch-all route), and other unknown paths returned HTML 404.
  - The mock route worked.
  - SIGTERM and SIGINT both stopped the process cleanly.
- **Headless Chrome test:** I used system Chrome with a phone viewport and the real bundle in `apps/web/dist`.
  - The Finnish page mounted from the bootstrap data.
  - The poster returned 200, and the video returned 206 range responses.
  - When the page was hidden, sendBeacon sent the events. The server stored the session (channel whatsapp, local day), 7 events and the analytics. The status moved to opened, and the stage and analytics jobs were added.
  - I looked at a screenshot of the 410 page by eye.

## Open issues
1. **Preview can take real actions (web):** the video app does not disable the form or the booking when `data.preview` is true. In a preview of a published deal, the analyst can send the real form to MGX, book a meeting and move the stage. The server cannot see that the request comes from a preview. The web should disable both, or send `?preview=1` so that the server can refuse.
2. **Duplicate file helper:** the admin agent wrote `src/routes/admin/send-file.ts`, which is almost the same as my `src/html/send-file.ts`. Merge them into one.
3. **Expired links keep getting batches:** the web recorder stops only on 404 or 410. Because expired links return 204, the recorder keeps sending a batch every 10 s. If you want it to stop, return 410.
4. **Intro transcript can be out of date:** the slide 1 captions and transcript use the analyst's current intro transcript. If the analyst records a new intro after publication, the text may not match the published video.
5. **Analytics cost:** each batch reads all session events of the deal to recompute the analytics. This is fine at demo scale.
6. **Test dependency:** my tests import `test/domain/fixtures.ts` and `test/db/temp-db.ts` from the server core agent.
7. **Not written:** I wrote no `.planning` notes, because I do not own that folder. The decisions above should go in `architecture.md`. The Vale tools are not available, so this text did not get a Vale check.
