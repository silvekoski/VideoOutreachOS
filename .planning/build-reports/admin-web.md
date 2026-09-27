# Admin panel front end: report

The admin panel is built and checked. Typecheck passes, eslint on my folders shows 0 errors and 0 warnings, 69 of 69 admin tests pass, and `pnpm --filter @mergero/web build` passes, including the video entry. A smoke run against a mock API shows all pages work in Chrome, with no console errors.

## Files
All paths are under `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/`.

- **Entry:** `index.html` is the dev fallback. It loads `/src/admin/main.tsx`, has `<!DOCTYPE html>`, a robots noindex meta and a pre-paint theme script (default dark). `src/admin/main.tsx` imports `../index.css` and `./print.css`. Also `src/admin/app.tsx` (providers and router) and `src/admin/print.css`.
- **Client and state:**
  - `src/admin/api.ts`, `src/admin/analyst-context.ts`, `src/admin/analyst-provider.tsx`.
  - Pure helpers in `src/admin/lib/`: `status.ts`, `format.ts`, `events.ts`, `replay.ts`, `pipeline.ts`, `alerts.ts`, `brief.ts`, `watch.ts`, `review.ts`.
- **Shared admin components** (`src/admin/components/`): `shape-icon`, `state-badge`, `interest-badge`, `page-header`, `query-state`, `pipeline-progress`, `slide-watch-chart`, `brief-view`, `replay-timeline`. The Lottie JSON is `src/admin/assets/pipeline-animation.json`.
- **Shell** (`src/admin/shell/`): `app-shell`, `top-bar`, `analyst-select`, `provider-badge`, `theme-menu`, `themes.ts`, `alerts-menu`, `command-palette`.
- **Pages** (`src/admin/pages/`): `inbox-page`, `deals-page`, `deal-page`, `review-page`, `metrics-page`, `not-found-page`, `route-error`.
- **Deal page** (`src/admin/deal/`): `deal-header`, `copy-link-menu`, `copy-channel-link.ts`, `expiry-dialog`, `deal-card`, `brief-card`, `open-task-card`, `events-card`, `watch-time-card`, `sessions-card`, `form-answers-card`, `failed-jobs-card`.
- **Review page** (`src/admin/review/`): `video-panel`, `slide-row`, `script-field`, `lines-field`, `buyers-field`, `more-section`, `save-status`.
- **Profile menu** (`src/admin/profile/`): `profile-sheet`, `intro-section`, `voice-section`, `settings-section`, `templates-section`, `media-upload-dialog`, `recorder-panel`.
- **Generic code:**
  - `src/components/lottie-player.tsx` uses `lottie_light` and shows a static frame under reduced motion.
  - `src/components/channel-icon.tsx` uses simple-icons for WhatsApp and lucide for the other channels.
  - `src/hooks/use-prefers-reduced-motion.ts`, `use-autosave.ts`, `use-media-recorder.ts`.
  - `src/lib/storage.ts`, `clipboard.ts` (it falls back to `execCommand` on a plain http private address), `theme.ts`.
- **Tests** (`test/admin/`): status, format, replay, pipeline, alerts, brief, events, review, api, recorder.
- I changed no generated file in `src/components/ui`.

## Public exports
- **`api.ts`:**
  - `class ApiRequestError extends Error { status: number; detail: unknown }`
  - `request<T>(method, path, { query?, json?, form?, signal? }): Promise<T>`
  - `apiUrl`, `errorMessage`, `isReviewReasonList`, `reviewNeedsPolling`, `queryKeys`
  - One hook per resource: `useProviderStatus`, `useAnalysts`, `useUpdateAnalyst`, `useUploadIntro`, `useUploadVoice`, `useUploadConsent`, `useInbox`, `useDeals`, `useEnsureDeal`, `useDeal`, `useReview`, `usePatchReview(id, { silent })`, `useApprove`, `useSetExpiry`, `useMarkBriefRead`, `useSessionEvents`, `useTaskDone`, `useRetryJob`, `useAlerts` (30 s poll), `useMarkAlertsSeen`, `useMetrics`, `useTemplates`.
- **Replay layout:** `layoutReplay(input, { minGapPct, maxLanes }): ReplayLayout` places markers in lanes. An event with no video time uses the last known video time (and is marked "about").
- **Status map:** `STATUS_META` gives each of the 8 statuses a word and a unique shape. Also `AUDIO_META`, `INTRO_META`, `CLONE_META`.
- **Hooks:** `useAutosave(serverValue, save, { delayMs, equals })` and `useMediaRecorder(kind, maxS)`.

## Decisions and assumptions
- **Ensure:** it runs as a query with an infinite stale time, so the POST goes out once per deal per app session, and StrictMode does not send it twice. `GET /api/deals/:id` waits for it.
- **Deals filters:** the page fetches `GET /api/deals` without parameters and filters in TanStack Table. The analyst filter starts as the current analyst.
- **Review page:** it also reads `GET /api/deals/:id` for the company name.
- **Edits:** scripts, lines and custom questions save 1.5 s after typing stops, or on blur. Buyers, expiry and page language save at once. Empty custom questions are not sent.
- **Errors:** a mutation error shows a toast. Approve handles its own error, and a 409 shows the list of reasons.
- **Brief read:** `POST brief/read` is sent once per deal and brief version per page load.
- **Time zone:** times show in the browser time zone.
- **Print:** the meeting brief prints on its own. All other parts of the page are hidden in print.

## Contract edits and conflicts
I made no contract edits. I found no conflict between PRD.md and architecture.md in my scope.

## What I verified
- `pnpm --filter @mergero/web typecheck` passes.
- `pnpm exec eslint` on my folders passes. One `eslint-disable` line handles the TanStack Table "incompatible library" notice.
- `pnpm vitest run --project web test/admin` gives 69 passes.
- The build passes.
- A scan of my files found no em dash or en dash.
- **Smoke run:** a mock API and Vite with a proxy, both in the scratchpad, then Chrome through DevTools. I checked:
  - Inbox, Deals, the deal page with all cards, the replay dialog, the Review page with autosave and the 409 case, Metrics in light theme, the profile sheet and the intro dialog, and the command palette (Ctrl+K and Enter).
  - Alerts marked as seen when the menu closes.
  - The Lottie animation moves normally and stays still under simulated reduced motion.
  - A phone width of 390 px.
- **Bugs this run found and I fixed:**
  - The command palette title was in the page while the palette was closed (a CommandDialog problem).
  - The profile sheet width was too narrow.
  - The top bar overflowed on a phone.
  - A camera stream that arrived after the dialog closed stayed on.

## Open issues for you
1. **Bundle size:** the admin bundle is 1.78 MB (603 KB gzip), mostly tinyld and zod pulled in through `@mergero/shared`. Adding `"sideEffects": false` to `packages/shared/package.json` cuts it to 1.09 MB (327 KB gzip); I measured this with a scratch Rollup config. I do not own that file.
2. **Theme script in the Hono HTML:** the server's admin HTML needs the same pre-paint theme script as `index.html` (key `theme`, default `dark`), plus `lang="en"` and `<div id="root">`. `main.tsx` also sets the theme class before React renders.
3. **Server data I assumed:**
   - `pipeline.step` is a job type: `scrape`, `write-script`, `audio`, `render` or `publish`.
   - `DealDetailDto.events` holds the deal events and the `open` events.
   - Task events have `data.type` and `data.channel`.
   - A seek has `data.from` in seconds.
   - A brief form answer for `timing` or `staff` can be the enum value or text; the UI handles both.
   - `previewUrl` already includes `?preview=1`.
4. **Upload formats:** intro recordings upload as `intro-{lang}.webm` or `.mp4` (the browser picks). Voice samples upload as `.webm`, `.m4a` or `.ogg`. The server must convert them to MP4 and MP3.
5. **Not tested:** live camera recording (Chrome waited for a permission prompt I could not grant), and printing in a real print preview. The Vale check did not run, because the Vale tools are not available.
