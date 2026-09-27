# Architecture

This file is the contract for all parts of the tool. PRD.md is the source of the requirements. This file adds the decisions that PRD.md does not make. Each part of the code must agree with this file. If code and this file disagree, fix the code or update this file in the same change.

## Repository layout

```
package.json               workspace root, scripts: dev, build, lint, typecheck, test, e2e
pnpm-workspace.yaml        apps/*, packages/*
tsconfig.base.json
eslint.config.js
vitest.config.ts           Vitest projects: packages/shared, apps/server, apps/web
playwright.config.ts       e2e, projects mobile-chrome and mobile-safari
.env.example
config/
  pipedrive.json           stage IDs and custom field keys (setup script writes it)
  mergero.json             Mergero facts, contact details, privacy notice text, brand
seed/
  pipedrive.json           fake Pipedrive data: users, organizations, persons, deals
  mgx.json                 buyers and closed deals for the mock MGX server
  asiakastieto.json        Finnish financials keyed on business ID (empty: the demo companies are real)
  linkedin.json            owner languages and staff count keyed on the lower-case email of the person
  text-sequence.json       first 100 deals of the text sequence, for the Metrics chart
apps/
  server/                  Hono API process and worker process (two entry points, one package)
  web/                     Vite app: admin panel (index.html) and video page (video.html)
  mgx-mock/                mock MGX MCP server (Streamable HTTP) and the buyer logos
packages/
  shared/                  types, zod schemas, pure logic, i18n
  scene/                   Revideo project (scene file) and the render function
scripts/
  pipedrive-setup.ts       creates fields and stages, writes config/pipedrive.json, writes the Video field
  pipedrive-seed.ts        copies seed/pipedrive.json into a real Pipedrive account
e2e/                       Playwright tests for the player and the form
storage/                   STORAGE_DIR, not in git
  deals/{deal}/ analysts/{analyst}/ data/ templates/ cache/logos/
```

Package names: `@mergero/shared`, `@mergero/scene`, `@mergero/server`, `@mergero/web`, `@mergero/mgx-mock`.

## Processes and ports

| Process | Command | Port | Job |
|---|---|---|---|
| API | `apps/server/src/api.ts` | `PORT`, default 3000 | Hono: `/api/*`, `/v/*`, `/mock/asiakastieto/*`, admin panel HTML and assets |
| Worker | `apps/server/src/worker.ts` | none | claims jobs from the jobs table, one at a time |
| Mock MGX | `apps/mgx-mock/src/main.ts` | 3100 | MCP at `/mcp`, logos at `/logos/*` |
| Vite (dev only) | `apps/web` | 5173 | serves modules to the Hono HTML (Vite backend integration) |

The API is the only entry point for a browser. In development, Hono writes HTML that loads `/@vite/client` and the entry module from the Vite dev server (Vite "Backend Integration" guide). In production, Hono reads `apps/web/dist/.vite/manifest.json` and serves `apps/web/dist/assets/*`. The admin panel HTML and each `/v/*` response have the headers `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`, so no other site can show them in a frame.

## Environment variables

| Name | Default | Use |
|---|---|---|
| `PORT` | 3000 | API port |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | base of the video links and the Open Graph URLs |
| `ADMIN_BASE_URL` | `PUBLIC_BASE_URL` | base of the Pipedrive "Video" field URL |
| `STORAGE_DIR` | `./storage` (repository root) | media files and SQLite |
| `PIPEDRIVE_API_TOKEN` | none | real Pipedrive when set, else the fake Pipedrive |
| `PIPEDRIVE_COMPANY_DOMAIN` | none | `https://{domain}.pipedrive.com` |
| `FIRECRAWL_API_KEY` | none | real Firecrawl when set, else the local scraper |
| `FEATHERLESS_API_KEY` | none | real Kimi-K3 when set, else the template writer |
| `ELEVENLABS_API_KEY` | none | real ElevenLabs when set, else the local voice |
| `MGX_MCP_URL` | `http://localhost:3100/mcp` | MGX MCP server address |
| `MGX_PORT` | 3100 | port of the mock MGX server |
| `MGX_PUBLIC_URL` | from the Host header | base URL of the mock MGX logo links |
| `ASIAKASTIETO_URL` | `{PUBLIC_BASE_URL}/mock/asiakastieto` | Asiakastieto base URL |
| `VITE_DEV_URL` | `http://localhost:5173` | dev only |
| `DISABLE_TELEMETRY` | `true` in the worker | Revideo telemetry off |

A provider without a key uses its fake. The API and the worker log each fake provider at start with level `warn`. `GET /api/status` returns the provider modes, and the account menu in the admin top bar lists the "Demo providers" when a fake is in use. An amber dot on the avatar shows this state.

## Fake providers (demo without keys)

| Provider | Fake |
|---|---|
| Pipedrive | `storage/data/fake-pipedrive.json`, first copied from `seed/pipedrive.json`. Same interface as the real client. Writes change the JSON file. |
| Firecrawl | local headless Chrome through puppeteer. Same outputs: Markdown, links, screenshot PNG. Runs the same cookie banner script. |
| Featherless | deterministic template writer in `@mergero/shared` (`fallback-writer.ts`). Output passes the same checks. |
| ElevenLabs | macOS `say` with a voice per language when it exists, else silence with the length of the text at 2.6 words per second. Output is MP3. Clone returns `fake-{analyst}` at once. |

The mock MGX server and the mock Asiakastieto route are the PRD mocks. They run in each mode.

## SQLite

One file: `storage/data/app.sqlite`. better-sqlite3. At open: `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`, `synchronous = NORMAL`. The API opens the schema file and runs it with `CREATE TABLE IF NOT EXISTS`. Times are RFC 3339 strings in UTC (`2026-09-26T12:00:00.000Z`). JSON columns are TEXT.

```sql
CREATE TABLE IF NOT EXISTS analysts (
  id INTEGER PRIMARY KEY,                 -- Pipedrive user ID
  name TEXT NOT NULL,
  email TEXT,
  time_zone TEXT NOT NULL DEFAULT 'Europe/Helsinki',
  intros TEXT NOT NULL DEFAULT '{}',      -- {"fi": {"file": "intro-fi.mp4", "durationS": 31.2, "recordedAt": "...", "transcript": "...", "status": "ready|processing|failed", "pending": {"recordedAt": "...", "transcript": "...", "status": "processing|failed"}}}
  voice_sample_file TEXT,
  voice_id TEXT,
  clone_status TEXT NOT NULL DEFAULT 'none' CHECK (clone_status IN ('none','pending','ready','failed')),
  consent_date TEXT,                      -- YYYY-MM-DD
  consent_file TEXT,
  default_expiry_days INTEGER NOT NULL DEFAULT 30,
  default_second_channel TEXT NOT NULL DEFAULT 'linkedin',
  brief_language TEXT NOT NULL DEFAULT 'en',
  alerts_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY,                 -- Pipedrive deal ID
  analyst_id INTEGER NOT NULL REFERENCES analysts(id),
  status TEXT NOT NULL CHECK (status IN ('draft','review','failed','link_sent','opened','form_sent','meeting_booked','lost')),
  review_reasons TEXT NOT NULL DEFAULT '[]', -- ReviewReason[]
  link_code TEXT NOT NULL UNIQUE,         -- 128-bit random, base64url, 22 characters
  language TEXT NOT NULL,                 -- video language (scripts, audio, slide text)
  page_language TEXT NOT NULL,            -- video page language, Review page "More"
  country TEXT NOT NULL,                  -- ISO 3166-1 alpha-2
  snapshot TEXT NOT NULL,                 -- DealSnapshot: data read from Pipedrive and LinkedIn
  scrape TEXT,                            -- ScrapeResult
  financials TEXT,                        -- Financials
  mgx TEXT,                               -- MgxData: buyers and closed deals
  custom_questions TEXT NOT NULL DEFAULT '[]', -- CustomQuestion[]
  removed_buyers TEXT NOT NULL DEFAULT '[]',
  form TEXT,                              -- FormAnswers
  form_sent_at TEXT,
  mgx_receipt_id TEXT,
  valuation TEXT,                         -- ValuationResult from the last form
  expiry_days INTEGER NOT NULL,
  published_at TEXT,
  published_version INTEGER,
  expires_at TEXT,
  expired_at TEXT,
  first_open_at TEXT,
  meeting_at TEXT,
  meeting_email TEXT,
  booked_at TEXT,
  lost_at TEXT,
  lost_reason TEXT,
  analytics TEXT,                         -- DealAnalytics, kept after expiry for Metrics
  pipedrive_note_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  json TEXT NOT NULL,                     -- Timeline
  render_status TEXT NOT NULL DEFAULT 'pending' CHECK (render_status IN ('pending','rendering','rendered','failed')),
  approved_at TEXT,
  rendered_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (deal_id, version)
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,                 -- no AUTOINCREMENT: a skipped duplicate insert uses no ID
  type TEXT NOT NULL CHECK (type IN ('scrape','write-script','write-brief','audio','render','pipedrive-write','sweep','backup')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  run_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  deal_id INTEGER,
  analyst_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (status, run_at, id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                    -- UUID from the page
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,               -- published video version that the page showed
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  local_day TEXT NOT NULL,                -- YYYY-MM-DD in the time zone of the deal country
  channel TEXT NOT NULL,                  -- email | linkedin | sms | whatsapp | direct
  device TEXT NOT NULL,                   -- mobile | tablet | desktop
  browser TEXT NOT NULL,
  os TEXT NOT NULL,
  screen TEXT NOT NULL,                   -- "390x844"
  analytics TEXT                          -- SessionAnalytics
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, -- NULL for a deal event
  seq INTEGER,                            -- NULL for a deal event
  type TEXT NOT NULL,
  slide INTEGER,
  video_time REAL,
  channel TEXT,
  client_at TEXT,
  at TEXT NOT NULL,                       -- server receive time
  data TEXT NOT NULL DEFAULT '{}',
  UNIQUE (session_id, seq)
);
CREATE INDEX IF NOT EXISTS events_deal ON events (deal_id, id);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call','second_channel')),
  channel TEXT,                           -- second channel: email | linkedin | sms | whatsapp
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  pipedrive_activity_id INTEGER,
  created_at TEXT NOT NULL,
  done_at TEXT,
  UNIQUE (deal_id, type)
);

CREATE TABLE IF NOT EXISTS briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  last_event_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  json TEXT NOT NULL,                     -- MeetingBrief
  created_at TEXT NOT NULL,
  UNIQUE (deal_id, version)
);
```

Retention: the hourly sweep deletes the media files and the screen recordings (`deals/{id}/recordings/`), the `sessions`, `events` and `briefs` rows, `form`, `meeting_email`, `scrape.markdown` of each deal with `expires_at` before now, and sets `expired_at`. It keeps `deals.analytics`, the flags and the dates, so Metrics stays correct. Before it deletes the events, it writes the interest level to `deals.analytics.interest`. `dealInterest` returns this frozen value for an expired deal. Each sweep also deletes the folder `deals/{id}` of a deal with `expired_at` when the folder exists again. The `audio` and `render` jobs of an expired deal end at once and write no file, and `POST /api/jobs/:id/retry` gives 409 for a `scrape`, `write-script`, `audio` or `render` job of an expired deal.

## Deal status and pipeline

Statuses: `draft`, `review`, `failed` exist only in the tool. `link_sent`, `opened`, `form_sent`, `meeting_booked`, `lost` mirror the Pipedrive stage (lost is the Pipedrive deal status "lost").

The pipeline is a state machine. The function `advance(dealId)` in `apps/server/src/domain/pipeline.ts` looks at the newest timeline and adds the next job. Each pipeline job calls `advance` when it ends.

1. `ensure` (API, `POST /api/deals/:id/ensure`): reads the Pipedrive deal, person and organization, and the LinkedIn data. Makes the deal row (status `draft`, new link code, `expiry_days` from the analyst default) and adds a `scrape` job. A call for an existing deal returns the same row. While the deal is not published and not lost, that call also reads the Pipedrive deal, person, organization and owner again. It writes a changed snapshot and puts the new company and analyst names into the newest version that is not approved (a new version when that version is rendered). A slide script that contains an old name (company, analyst, or the first name of the contact person) changes as after a line edit. The name must start a word in the script, so an inflected name ("Jussin") also counts. When the snapshot changes and no version changes, the call runs `advance`, so the review reasons show the new data. When the Pipedrive owner of the deal changed, the call syncs the new owner (`refreshError` when that user is not a Pipedrive user) and sets `deals.analyst_id` to the new owner, so the alerts, the tasks and the review reasons `no_intro` and `no_voice` follow the new analyst. The newest version gets the new analyst name, the intro of the new analyst (empty when the intro is not ready) and `audio.status = 'new'` on each slide with a script, also when that version is approved: the change removes the approval (a new version when that version is rendered). An `audio` job that runs during the change writes no more clips in the voice of the old owner. A failed read keeps the data, and the response gives `refreshError`. One link per deal.
2. `scrape` job: Firecrawl home page (Markdown, links, full-page screenshot, cookie banner action), about page (Markdown). The local scraper scrolls the page first, so lazy images load, and captures the top 5400 px (6 viewports). Slide 3 starts to scroll the screenshot from the top when the screenshot starts to fade in (frame 14), at no more than 0.4 frame heights per second on average, and holds for the last 1 s. The about page is the same-host link with the best path word match (about, about-us, meista, yritys, yhtio, company, ueber-uns, unternehmen, om-oss, om-os, om, firma, who-we-are). Writes `screenshot.png`, `og-image.jpg`, `deals.scrape`. Fewer than 200 words is not a failure: `scrape.ok = false`, reason `too_few_words`. An HTTP or network error throws, so the queue retries. On the final failure the handler writes `scrape.ok = false` with the error and still calls `advance`, so the analyst can write the lines. The failed job stays in the Inbox with Retry. A successful retry fills the lines only when the newest timeline is not approved and its lines are empty and not written by the analyst.
3. `write-script` job: gets financials (Asiakastieto or "ask in form"), MGX buyers and closed deals, resolves the language, translates the buyer focus lines (slide 5) and the closed deal texts (slides 2 and 6) into the video language (`translate-texts`, one request, the original texts stay when the output fails the checks), then writes the three company lines (only when `scrape.ok`) and the scripts of slides 2 to 8 with Kimi-K3. Slide 6 shows up to two closed deals of the two-digit NACE code (`scope: 'sector'`). When MGX has none, slide 6 shows recent deals of all sectors, first the deals that slide 2 does not show (`scope: 'recent'`), with the label `headline-recent` and a script that does not say "in your sector". Slide 5 shows up to six public MGX buyers of the NACE code and the country (`scope: 'sector'`). When MGX has none, slide 5 shows the public featured buyers of the country, else all public featured buyers, first the buyers that slide 2 does not show (`scope: 'featured'`), with the label `headline-featured` and a script that does not say "companies like yours". When that list is also empty, slide 5 shows the `empty` panel and the script says that the meeting goes through the buyers that fit. The buyers whose name and focus fit their slots come first. A name or focus line that is still too long after the translation is cut at a word with an ellipsis, so no buyer is dropped for its length. Slide 4 uses the calculator text only when the page calculator shows a range (`calculatorFor` in `apps/server/src/video/valuation.ts`). Makes timeline version 1 (or fills the slides named in the payload). A remake (`remakeDeal`, `POST /api/deals/:id/remake`) builds version n+1 in the same way: the deal gets `scrape = null` and a scrape job with the key `scrape:{deal}:remake-{n+1}`, then `advance` adds the full `write-script` job for version n+1. The new version keeps the lines and scripts of the analyst from version n, and a kept script gets `scriptCheck` when its slide variables or the language changed. Each version built from data stores `Timeline.basis` (website, business ID for FI, NACE code of the snapshot), and `MgxData.nace` stores the NACE code that loaded MGX. A slide whose output fails twice gets an empty script and the review reason `model_failed`.
4. `audio` job: for each slide with `audio.status` `new` or `missing` and a script: ElevenLabs, 3 retries per clip, then loudnorm to -16 LUFS. A clip that still fails ends the job with a non-retryable error: the job is `failed`, the deal gets the review reason `audio_failed`, the slide keeps `audio.status = 'failed'`.
5. `render` job: checks the text slots (too long: review reason `text_too_long`, no render), renders 1080p with Revideo, makes 720p and the poster, writes actual slide times into the timeline, sets `render_status = 'rendered'`.
6. `advance` sets the status `review` when a render exists and the version is not approved, or when a review reason blocks the next step. When the version is approved and rendered, `advance` publishes.

Blocking review reasons (`ReviewReason.code`): `lines_missing`, `script_missing`, `model_failed`, `text_too_long`, `audio_failed`, `no_intro`, `no_voice`, `script_check`, `slide_empty` (the analyst removed each buyer of slide 5; an empty slide 5 from MGX is not a reason), `remake_needed` (unpublished deal only: the website, the business ID of an FI deal or the NACE code of the snapshot differs from `Timeline.basis`, or the language from `resolveLanguage` with the current LinkedIn languages differs from the timeline language; the reason also blocks the publication of an approved render and shows for a rendered version). During a remake, `advance` stores no review reasons. `advance` does not add a pipeline job while a blocking reason exists and the version is not approved. `advance` adds the `audio` job only when each slide has a script, and the `render` job only when the audio of each slide is `ok`. The `advance` call at the end of a `write-script` job does not hide `script_missing` for the slides of that job. When `advance` adds a `write-script` job, it computes the stored reasons again after the job exists, so an approval that adds the job for a cleared script stores no `script_missing` for that slide.

Approval (`POST /api/deals/:id/approve`): sets `approved_at` on the newest version. Then `advance` runs: missing scripts with inputs get `write-script`, slides marked `new` get `audio`, an unrendered version gets `render`, and a rendered approved version gets published. If a blocking reason remains after approval (for example text too long), the API returns 409 with the reasons and does not approve.

Review page after approval (`approvalState` in `apps/web/src/admin/lib/review.ts`): an approved version that is not published waits for publication only when no job failed, the render did not fail, no review reason blocks it, the deal is not lost and the link has not expired (`ReviewDto.expired`). Only then does the page show the publication progress and poll. Else the page tells why the version is not published: a failed job (retry it), a review reason (an edit removes the approval, then approve again), or a lost deal or an expired link (no poll). The 409 reasons of an approval stay on the page until the review reasons change, for example after an autosave.

Publish: `published_version = version`, `published_at` (first time only), `expires_at = now + expiry_days`, status `link_sent` when the status was `draft` or `review`, deal event `link_sent`, `pipedrive-write` stage job.

Final failure of `write-script` or `render` before publication sets the status `failed`. After publication, the status does not change on a job failure. A failed job of each type shows in the Inbox Review group.

Stage order: `link_sent` < `opened` < `form_sent` < `meeting_booked`. The stage only moves forward. `lost` is terminal. Triggers: first `open` session event: `opened`. Form submit: `form_sent`. Booking: `meeting_booked`. Form "not interested": `lost` with the reason. A booking on a lost deal keeps the status `lost`, but `bookMeeting` still queues the `pipedrive-write` stage job `meeting_booked` (the job compares with `reachedStage`). The Inbox "Meeting today" group uses `!isExpired`, not `dealDone`, so a meeting on a lost deal shows there.

## Versions and edits

The newest timeline row is the working version.

- An edit on a version that is `rendered` makes a new row (version + 1) that copies the old one with the edit.
- An edit on a version that is not rendered changes that row.
- An edited script, edited lines (slide 3) or an edited buyer list (slide 5) sets `audio.status = 'new'` on that slide. The UI shows "New audio".
- Edited lines (slide 3) or an edited buyer list (slide 5) also change the script of that slide. If the model or the template writer wrote the script, the edit clears it and adds a `write-script` job for that slide at once. If the analyst wrote the script, the edit sets `scriptCheck` on the slide and adds the blocking reason `script_check`. The next save of that script by the analyst removes the flag, also when the text stays the same. The button "Script is correct" on the Review page sends that save.
- A script that the analyst clears gets `scriptSource: null`, so that the approval adds a `write-script` job for that slide.
- A `write-script` job keeps a new script only when the slide variables did not change while the model wrote it.
- Audio of a slide that did not change keeps its file of the older version (the timeline stores the file name).
- Custom questions, expiry and page language change the deal row only. No new version, no render.
- The video page uses `published_version`. It changes only on publish.
- After publication, an edit does not change the deal status. A newer version that is rendered and not approved, or that a review reason blocks, needs the analyst (`pendingVersion` in `apps/server/src/views/inbox.ts`). The Inbox shows it in the Review group, the Deals page gives the next action "Review the new version", and the deal page shows an alert (`DealDetailDto.pendingVersion`). A done deal does not count.

## Jobs

Claim (one transaction, `BEGIN IMMEDIATE`): the oldest due queued job, ordered by `run_at, id`. Set `status = 'running'`, `attempts = attempts + 1`. At worker start, each `running` job goes back to `queued` (one worker only).

Failure: a retryable error sets `status = 'queued'`, `run_at = now + 30 s * 4^(attempts - 1)` (30 s, 2 min), keeps `error`. The third failed attempt sets `failed`. `NonRetryableError` sets `failed` at once. Each handler can have `onFinalFailure(job, error)`.

Retry from the Inbox (`POST /api/jobs/:id/retry`): `status = 'queued'`, `attempts = 0`, `run_at = now`, `error = NULL`.

Render queue (`GET /api/queue`, the queue menu in the top bar): one row per deal with a `queued` or `running` job of type `scrape`, `write-script`, `audio` or `render`. The row shows the first job in the order of the worker. The state is `running`, `retrying` (a queued job with an `error`) or `queued`. The running rows come first, then the rows in `run_at, id` order. The menu polls every 3 s when the queue has rows, else every 30 s.

Idempotency keys (a second insert with the same key is ignored, `INSERT OR IGNORE`):

| Type | Key |
|---|---|
| scrape | `scrape:{deal}` |
| write-script | `write-script:{deal}:{version}:{slides joined with -}`, after an edit of the lines or the buyers `write-script:{deal}:{version}:{slides}:edit-{n}` where n counts the `write-script` jobs of that version |
| audio | `audio:{deal}:{version}:{n}` where n counts audio runs of that version, or `audio-intro:{analyst}:{language}:{recordedAt}`, `audio-clone:{analyst}:{sampleAt}` |
| render | `render:{deal}:{version}`, or `render-preview:{scene hash}` |
| write-brief | `brief:{deal}:{last event ID}` |
| pipedrive-write | `pipedrive-write:{deal}:{op}:{id}` |
| sweep | `sweep:{YYYY-MM-DDTHH}` (UTC hour) |
| backup | `backup:{YYYY-MM-DD}` |

The worker loop: every second, insert the sweep job of the current hour and the backup job of the current day (both with `INSERT OR IGNORE`), then claim and run one job. The worker runs one job at a time, so one render and one model request run at a time.

## Pipedrive sync

The API process polls `GET /v1/recents` for deals, persons and organizations. See `.planning/pipedrive-sync.md` for the intervals, the token budget and the status rules. A server-sent event stream at `GET /api/events` tells the panel when the database or Pipedrive changed. `PATCH /api/deals/:id/contact` writes the contact data to Pipedrive, then reads the deal again.

`pipedrive-write` ops: `stage`, `fields` (form ranges), `analytics` (total watch time, stop slide, replay count, watch time per slide, channel of the newest session from `deals.analytics.channel`; no channel leaves the Pipedrive field unchanged), `lost`, `activity` (task), `activity_done`, `note` (meeting brief), `video_field` (sweep). An `analytics` job is added only when no queued `analytics` job exists for the deal, with `run_at = now + 60 s`, and it reads the newest numbers when it runs.

## Hourly sweep

1. Call task: each deal in `link_sent` with `published_at` 48 hours or more ago and no open.
2. Second channel task: each deal in `opened` with `first_open_at` 48 hours or more ago and no booking. The channel is the analyst default second channel. If it is the channel of the first session, the next channel in the order email, linkedin, whatsapp, sms.
3. Expiry: see Retention.
4. Video field: each Pipedrive deal whose Video field is empty gets `{ADMIN_BASE_URL}/deals/{id}`.
5. Meeting brief: each deal with `meeting_at` in the next 3 hours and an owner event (session event, `form_sent` or `meeting_booked`) with an ID above the `last_event_id` of the newest brief gets a `write-brief` job.

Tasks use `INSERT OR IGNORE` on `UNIQUE (deal_id, type)`. Each new task adds a `pipedrive-write` `activity` job. Booking, "not interested" and expiry set open tasks to `done` (and add `activity_done`).

## Link and video page

- Link code: 16 random bytes from `crypto.randomBytes`, base64url without padding (22 characters). Route pattern `^[A-Za-z0-9_-]{22}$`.
- Link: `{PUBLIC_BASE_URL}/v/{code}?c={channel}`. Channels: `email`, `linkedin`, `sms`, `whatsapp`. No `c` gives `direct`.
- `GET /v/:code` returns HTML from Hono with `<!DOCTYPE html>`, the Open Graph tags (`og:title`, `og:description`, `og:image` = `/v/{code}/og-image.jpg` 1200 x 630, `og:url`, `og:type` website, `twitter:card` summary_large_image), `<meta name="robots" content="noindex, nofollow">`, the header `X-Robots-Tag: noindex, nofollow`, and a `<script type="application/json" id="bootstrap">` with `VideoPageData` (`<` escaped as `<`). The React app mounts in `#root` of the same page.
- An unknown code or an unpublished deal: 404 page. An expired link: 410 page with the Mergero contact details. Both pages have the privacy notice.
- `?preview=1` from the admin panel turns off the recorder. The page disables Send and Book and shows a preview note. The form and booking requests also carry `?preview=1`, and the server answers them with 403.
- Media: `GET /v/:code/media/:file` accepts only the files of `published_version` (`video-720.v{n}.mp4`, `video-1080.v{n}.mp4`, `poster.v{n}.jpg`). HTTP range requests (206, 416). `Cache-Control: private, max-age=86400`. Captions: `GET /v/:code/captions.v{n}.vtt`, built from the timeline scripts and the actual slide times (WCAG 2.2 A 1.2.2). Each sentence gets the smallest number of cues with at most 2 lines of 42 characters. The words of a sentence go into cues of almost the same length, and the lines of a cue also have almost the same length. Each cue shows for at least 1 s. That time comes from the longer cues of the same slide, and all cues stay inside the speech time. The intro uses the transcript in the facecam segment of that version. The pipeline copies the transcript of the analyst intro into the segment together with the video file, so a new recording does not change the captions of an older version. The intro upload requires a transcript.
- Buyer logos: `GET /v/:code/logos/:index` serves the cached logo (`cache/logos`) of buyer `index` on slide 5 of the served version. The page data gives `logoUrl` for each buyer with a `logoFile`, else `null`. The page never loads an MGX logo URL. The response has `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, because a logo can be an SVG. `denyFraming` adds `frame-ancestors 'none'` to a policy that a route sets.
- Events: `POST /v/:code/events`, body `EventBatch` as JSON text (content type `application/json` or `text/plain` from `sendBeacon`). `INSERT OR IGNORE` on `(session_id, seq)`. Returns 204. A preview batch gets 204, and the server does not store it. An expired link gets 410, and the recorder stops. `EventBatch.session.version` is the video version of the page. The server stores it in `sessions.version`. A version that the deal did not publish gets 400.
- Screen recording: after the first render, the page loads `screen-recorder.ts` (rrweb `record`, `maskAllInputs`, `blockSelector: '[data-private]'` on the company form). `recording-queue.ts` tags each rrweb event with the session ID of the event recorder. It seals the buffer into a chunk with a part number at each 10 s tick, at 512 KB, and at a session change. A sealed chunk does not change, so a retry sends the same file name and the server keeps one copy. On `visibilitychange` to hidden, the queue sends the chunks of 60 KB or less with `sendBeacon`. When the session ID changes after 30 minutes idle, the page takes a new full snapshot for the new session. The admin loads `session-player.tsx` lazily and plays the events with the rrweb `Replayer` in a sandboxed iframe without scripts.
- Form: `POST /v/:code/form`. Booking: `GET /v/:code/slots`, `POST /v/:code/book`.

## Analytics rules (pure functions in `@mergero/shared/analytics`)

Input: the slide times (`startS`, `endS` of slides 1 to 8) of the video version of the session (`sessions.version`) and the session events sorted by `seq`. After a republish, each older session keeps the slide times of its own version.

- Play intervals: `play` opens an interval at `video_time`. `pause`, `page_hide`, `complete` close it at their `video_time`. `seek` closes it at `data.from` and, when playing, opens a new one at `video_time` (the target). `slide_start` and `slide_end` update the last known time. At the end of the list, an open interval closes at the last known time.
- Watch time of a slide: the sum of the overlap of the intervals with `[startS, endS)`.
- Replay: a `slide_start` for a slide that already had a `slide_start` in the same session. The replay count of a slide is the sum over the sessions.
- Session stop slide: the slide at the end time of the last interval; slide 8 after `complete`; `null` without play.
- Deal stop slide: the highest session stop slide.
- Opens: the page loads (`open` events), at least one per session. Sessions: the number of sessions. Came back: sessions on 2 or more `local_day` values.
- Deal channel: the channel of the newest session (`DealAnalytics.channel`). The ingest stores it in `deals.analytics`, so it stays after the sweep deletes the sessions.
- Each session stores the video version that it played (`sessions.version`). The analytics of a session use the slide times of that version. The deal numbers add the sessions per slide number. The meeting brief uses the same computation (`apps/server/src/domain/analytics.ts`).

## Signals and interest level (`@mergero/shared/signals`)

The ten rules of PRD.md "Signals and interest level", computed by the server. High: 4 or more positive and no negative. Low: no positive, or 2 negative. Medium: all other cases. Each signal has the ID of the event that shows it (`evidenceEventId`) or a computed value (`evidenceText`).

## Valuation (`@mergero/shared/valuation`)

Multiples: the profit multiples of the MGX closed deals with the same two-digit NACE code as `MgxData.nace` (the NACE code that loaded the MGX data, not the current snapshot; data without it uses the snapshot NACE code) (the part before the dot, `"25.62"` gives `"25"`). With fewer than 3 multiples: no range, the calculator shows "Mergero gives a range after the meeting". Percentiles: linear interpolation between the closest ranks (the R-7 method). Range: `[profitLow * p25, profitHigh * p75]`. An exact profit uses the same value for low and high. A profit of 0 or less: no range. The calculator shows only for DE, AT and CH. The page records `calculator_result` only when the deal has multiples for a range (`VideoPageData.calculator` is not null) and the owner gives a profit. A loss or a profit of 0 gives the event with `available: false`.

## Language (`@mergero/shared/languages`)

Supported: `fi`, `sv`, `nb`, `da`, `de`, `en`. Country languages: FI `fi, sv`; SE `sv`; NO `nb`; DK `da`; DE, AT, CH `de`; other `en`. Resolve order:

1. The website language, when it is a country language and LinkedIn does not list other supported languages without it.
2. The first country language that the LinkedIn languages include.
3. The first country language.
4. `en`.

The analyst must have a ready intro in that language, else the review reason `no_intro`. A new upload waits in `intros[lang].pending` until the transcode is done. Until then, and after a failed transcode, the ready intro stays in use.

## Model output checks (`@mergero/shared/checks`)

- Word count: split on whitespace, count tokens with a letter or digit. Scripts: 30 to 60. Summary: 60 or fewer.
- Language: the detector must return the expected language.
- Numbers: each digit group in the output, with separators removed, must be in the set of digit groups of the input JSON (numbers and strings). A number that is not in the input rejects the output.
- Company lines: exactly 3, each within the slot limit.
- Translations: the same ids in the same order, each text within its `max`, the number check for each text against its source text, and the language check on the texts that the model changed.
- Questions: 3 to 5.

## Text slots (`@mergero/shared/slots`)

The scene and the check share one table of maximum character counts. The worker checks each slot before a render. A static label of each language must fit its slot (a unit test checks all languages).

## Folders

```
storage/deals/{deal}/screenshot.png, og-image.jpg, poster.v{n}.jpg,
  audio/slide-{2..8}.v{n}.mp3, video-1080.v{n}.mp4, video-720.v{n}.mp4
storage/analysts/{analyst}/intro-{language}.mp4, voice-sample.mp3, consent.pdf
storage/data/app.sqlite, backups/app-{YYYY-MM-DD}.sqlite (14 kept)
storage/templates/slide-{1..8}.jpg (template previews)
storage/cache/logos/{sha1 of URL}.{ext}
```

## Decisions on gaps in PRD.md

1. LinkedIn: no API in the stack. `seed/linkedin.json` gives the owner languages and the staff count, keyed on the lower-case email of the person, through a `LinkedInSource` interface.
2. Alerts: in the admin panel. The events table holds the deal events. `analysts.alerts_seen_at` marks read alerts. The top bar has an alert menu, and a toast shows a new alert.
3. Calendar: the video page shows free 30 minute slots from the analyst working hours (Monday to Friday, 09:00 to 16:00 in the analyst time zone, from the next day, 14 days). Booked meetings of the analyst are not free. The analyst sends the Teams invitation. The owner can give an email address for the invitation (`deals.meeting_email`). The deal header, the meeting brief card, the `meeting_booked` alert and the Inbox "Meeting today" row show the address. The tool does not write it to Pipedrive or into the meeting brief note. When a second open page books after a meeting exists, the 409 gives `detail.meetingAt`, and the calendar shows `page.alreadyBooked` with that time in place of the slots.
4. "Language" under More on the Review page is the page language (PRD.md table: page only, no render). The video language comes from the language rule.
5. A new intro recording applies to each render after it. The tool does not render published videos again.
6. Captions on the video page, for WCAG 2.2 A 1.2.2. The video page has no transcript panel. The user removed it on 2026-09-27, so the page does not satisfy WCAG 1.2.3.
7. Text sequence data for the Metrics chart: `seed/text-sequence.json`.
8. Metrics: the tables count deals with `published_at` in the date range. The range has calendar days in one time zone: the Metrics page sends the browser time zone as `tz` (IANA name), the default is `UTC`. The default `to` is today in that time zone. Average watch time is over opened deals. The chart shows the cumulative meeting rate over the first 100 deals of each sequence and does not use the date range. Each point has a 95 % Wilson band.
   - Funnel, channel matrix, retention, page actions and interest use the deals of the date range. All parts except the funnel and the follow-up table use opened deals only.
   - Channel: `DealAnalytics.firstChannel`, the channel of the first session. `channel` stays the channel of the last session for Pipedrive.
   - Page actions: `DealAnalytics.buyerLinkTaps`, `calculatorResults` and `forwards` count the named events of all sessions. They stay after expiry.
   - Interest: `dealInterest` for each opened deal. This reads the events of each open deal, so the cost grows with the deal count. The deal list has the same cost.
   - Weekly trend: one `MetricsRow` per week from the Monday of `from` to `to`, in the time zone `tz`. A week with no links has null rates.
   - Timing: the share of the links sent in the range with `first_open_at` or `booked_at` within 0 to 168 hours after `published_at`, in steps of 6 hours.
   - Open heatmap: a 7 by 24 grid (Monday first) of `first_open_at` in `countryTimeZone(country)`.
   - Watch histogram: `analytics.totalWatchS` of opened deals in buckets with the edges 0, 15, 30, 60, 90, 120 and 180 s.
   - Signal lift and interest: `dealEngagement` gives the level and the signal keys. For an expired deal, it reads `analytics.interest` and `analytics.signals`, which the sweep writes before it deletes the events.
   - Sale timing: `form.timing`, or `analytics.saleTiming` after expiry.
   - Mock data: `GET /api/metrics?source=mock` sends 420 fixed fictional deals from `views/metrics-mock.ts` through `computeMetrics`. A seeded random generator makes the same deals each time, relative to the current day. The patterns follow the transcripts: email converts best in the Nordics, LinkedIn in the DACH region, and only DACH owners use the calculator. The text sequence stays real. The Metrics page toggle writes `?data=mock` to the page URL.
   - Follow-up: the `tasks` rows of the deal. The sweep makes a task only when the deal has no meeting, so each booked deal with a task booked after the task.
9. Form data goes to MGX with `submit_form` in the request. If MGX fails, the page shows an error and nothing is stored. A link accepts one form. The server checks `form_sent_at` before the MGX call and again in the store transaction. When it is set, the request gets 409, and the page locks the form and shows `page.alreadySent`. Pipedrive gets the ranges only. The tool keeps the answers in `deals.form` for the deal page and the meeting brief until the link expires.
10. Range text in Pipedrive fields: `1000000-3000000 EUR`, an exact value: `1500000 EUR`.
11. Meeting after the link expiry: the calendar can offer a slot after `expires_at`. The booking then moves `expires_at` to the meeting end plus 24 hours, in the same transaction. A later expiry change or a new publish never sets `expires_at` before that time (`linkExpiresAt` in `apps/server/src/domain/deals.ts`). The brief, the events and the Inbox row stay until after the meeting. `expiry_days` does not change.
12. Time zone of the deal page: each date and time on the deal page (header, expiry dialog, meeting brief, Events, Sessions and the replay, Form answers, Open task, Failed jobs) is in the time zone of the deal analyst (`DealDetailDto.analyst.timeZone`). Each card names the IANA zone once in its header. The meeting brief also names it at the meeting time.

## File references in the timeline

Each file name in a timeline (`videoFile`, `screenshotFile`, `logoFile`, `audio.file`) is a path relative to `STORAGE_DIR`, with forward slashes, for example `deals/12/audio/slide-2.v1.mp3`, `analysts/3/intro-fi.mp4`, `deals/12/screenshot.png`, `cache/logos/3f2a.png`. Brand logo paths in `config/mergero.json` are relative to the repository root. The render gets `RenderInput` (`packages/shared/src/types.ts`): the timeline with planned `startS` and `endS`, the absolute storage folder, the absolute repository root and the brand.

## Render (packages/scene)

- The scene reads one variable, `input`: base64 of the JSON `RenderInput`. Plain JSON variables are not safe (a backtick or `${` in a text breaks the render or runs as code).
- The scene builds media URLs as `new URL('/@fs' + encoded absolute path, window.location.origin)`. The render sets `viteConfig.server.fs.allow = [scene package folder, repository root, STORAGE_DIR]`.
- Each segment lasts exactly `frames(durationS, fps)` frames. The scene advances with one bare `yield` per frame.
- A buyer slide or a deal slide with an empty list shows a panel with the label `empty` in place of the list.
- The render runs in a child process with a hard timeout, because a failed media load or a Chrome crash makes `renderVideo` hang. The parent kills the process group on timeout.
- Before a render, the runner checks that each referenced file exists. A missing file or another bad input gives `RenderInputError`, and the `render` job fails at once (`NonRetryableError`).
- Chrome: `CHROME_PATH` (Google Chrome or Chrome for Testing, for H.264 in WebCodecs). ffmpeg: `FFMPEG_PATH`, `FFPROBE_PATH` (ffmpeg 8 works when the render has at least one audio asset, which is always true here).
- After the render, the worker remuxes with `+faststart`, makes 720p and the poster, and checks that the audio is not silent.

## End-to-end tests (Playwright)

`pnpm e2e` runs `playwright.config.ts`. The projects are `mobile-chrome` (Pixel 7, the installed Google Chrome, because Chromium has no H.264) and `mobile-safari` (iPhone 15, WebKit).

The global setup `e2e/global-setup.ts` does these steps:

1. It builds the web app.
2. It starts the mock MGX, the API (`NODE_ENV=production`) and the worker on free ports, with the fake providers and a temporary `STORAGE_DIR`. The fake Pipedrive store gets the seed data, with the demo site addresses on the port of the mock MGX.
3. It uploads a 3 s intro (ffmpeg `testsrc2` and a sine tone), a voice sample and a consent PDF for the analysts 1001 (`fi`) and 1002 (`de`) through the admin API, with the header `X-Mergero-Admin: 1`.
4. It ensures the deals 4007 (DE), 4009 (CH) and 4001 (FI), waits for Review, and approves them. Approval publishes each deal.
5. It writes the link codes to `e2e-state.json` in the storage folder. `MERGERO_E2E_STATE` gives the path to the tests.

The teardown stops the processes and deletes the folder (`MERGERO_E2E_KEEP=1` keeps it).

A link accepts one form and one meeting, and expiry is final. So each project has its own DACH deal for the form, the booking and the expiry (`mobile-chrome` 4007, `mobile-safari` 4009), in one serial spec file. The player, recorder and preview specs use the FI deal 4001 in both projects and change no deal state. The admin API sets the expiry to 1 day at the minimum. The expiry test sets the expiry through the admin API, then moves `expires_at` into the past in SQLite, because the test cannot move the clock of the API.

## Language model requests

`LanguageModelClient.completeJson(request)`: `request.user` is always a JSON string of one of these objects. The fake model reads the same object.

| `schemaName` | `request.user` JSON |
|---|---|
| `slide-script` | `{ "task": "slide-script", "slide": 2..8, "context": ScriptContext, "facts": object }` |
| `company-lines` | `{ "task": "company-lines", "lang": Lang, "company": string, "text": string }` |
| `brief-text` | `{ "task": "brief-text", "lang": Lang, "brief": MeetingBrief without questions and summary }` |
| `translate-texts` | `{ "task": "translate-texts", "lang": Lang, "texts": [{ "id": "buyer:{id}" or "deal:{id}", "text": string, "max": number }] }` |

The output objects: `{ "script": string }`, `{ "lines": [string, string, string] }`, `{ "summary": string, "questions": string[] }`, `{ "texts": [{ "id": string, "text": string }] }`. The fake model returns the original texts for `translate-texts`.

## Seed files

- `seed/pipedrive.json` (fake Pipedrive and the seed script): `{ "users": [{ id, name, email, active }], "organizations": [{ id, name, website, countryCode, businessId, nace }], "persons": [{ id, name, firstName, jobTitle, email, phone, orgId }], "deals": [{ id, title, ownerId, personId, orgId, stage, status, videoUrl }], "activities": [], "notes": [] }`. `stage` is `null` (a stage before the tool) or a `Stage` value.
- `seed/linkedin.json`: `{ "profiles": { "<lower-case email>": { "languages": ["fi", "en"], "staffCount": 45 } } }`.
- `seed/asiakastieto.json`: `{ "companies": { "<business ID>": { "revenue": 4200000, "profit": 610000, "fiscalYear": 2025 } } }`.
- `seed/mgx.json`: `{ "buyers": [{ id, name, logo, website, focus, nace: string[], countries: string[], name_public, featured }], "closedDeals": [{ id, year, country, nace, text, profitMultiple }] }`. `logo` is a file name under `seed/logos/`, served by the mock at `/logos/{file}`.
- `seed/text-sequence.json`: `{ "deals": [{ "n": 1, "sentAt": "2026-03-02", "opened": true, "meetingBooked": false }] }` (100 rows).
- `config/pipedrive.json`: `PipedriveConfig` in `apps/server/src/providers/types.ts`. The setup script writes it.
- `config/mergero.json`: brand, contact details and facts (the real Mergero data from mergero.com on 2026-09-26).
