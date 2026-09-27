## Report: video page front end (`apps/web/src/video`, `apps/web/test/video`)

The video page is complete and checked in a real browser. Typecheck, eslint and my 123 tests pass. `pnpm --filter @mergero/web build` fails only because the admin entry `src/admin/main.tsx` does not exist yet (the other agent owns it). A build of only the video entry with the real `vite.config.ts` passes. I made no contract edits.

### Files
- **Source** in `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/src/video/`: `main.tsx`, `video.css`, `app.tsx`, `player.tsx`, `progress-bar.tsx`, `company-form.tsx`, `calendar.tsx`, `buyer-links.tsx`, `forward-button.tsx`, `transcript.tsx`, `page-footer.tsx`, `recorder.ts`, `recorder-context.ts`, `page-tracking.ts`, `device.ts`, `timeline.ts`, `valuation.ts`, `slots.ts`, `urls.ts`, `api.ts`.
- **Tests** in `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/test/video/`: `timeline`, `device`, `recorder`, `valuation`, `slots`, `urls`, `brand-tokens` (all `*.test.ts`).

### Public exports
- **`timeline.ts`:** `type SlideTime`, `slideAt(slides, t): SlideNumber | null`, `formatClock(s): string`.
- **`device.ts`:**
  - `WIDE_QUERY = '(min-width: 1024px)'` and `interface Platform { device, browser, os, iPhone, iOS }`.
  - `detectPlatform(userAgent, maxTouchPoints): Platform`.
  - `channelFromSearch(search): SessionChannel`.
  - `sessionInfo({ search, platform, screenWidth, screenHeight }): SessionInfo`.
  - `pickVideoSource(media, matchMedia): string`.
- **`recorder.ts`:**
  - `createRecorder({ session, transport, store, newId, now?, intervalMs? }): Recorder`, where `Recorder = { record(type, { slide?, vt?, data? }), tick(), hide(), setPlayhead(fn | null), start(): stop }`.
  - `noopRecorder`, `roundTime`, `randomId(crypto)`.
  - `sessionStore(() => Storage, key)` and `httpTransport(url, sendBeacon)`.
  - Constants: `BATCH_INTERVAL_MS`, `SESSION_IDLE_MS`, `MAX_BATCH_EVENTS = 500`, `MAX_BEACON_BYTES = 60000`.
  - Types: `Transport { post(body): Promise<'ok'|'retry'|'drop'|'gone'>; beacon(body): boolean }`.
- **`recorder-context.ts`:** `RecorderContext`, `useRecorder()`.
- **`page-tracking.ts`:** `trackPage(recorder, window): () => void`. It handles scroll, tap, field_focus, field_value, and `visibilitychange` to `recorder.hide()`.
- **`valuation.ts`:** `calculatorRange(profit: Amount, { p25, p75 })`, `parseAmount(text)`, `toAmount(draft, options)`, `formatMoney(value, locale)`, `rangeText(range, templates, locale)`.
- **`slots.ts`:** `groupSlotsByDay(slots, locale, timeZone?): SlotDay[]`, `formatMeeting(iso, locale, tz?)`, `timeZoneLabel(locale, at, tz?)`.
- **`urls.ts`:** `shareUrl`, `safeHttpUrl`, `displayUrl`, `telHref`.
- **`api.ts`:** `HttpError`, `pageUrl(code, path)`, `requestJson<T>(url, { method?, body?, signal? })`.
- **Components:** `App`, `Player`, `ProgressBar`, `CompanyForm`, `Calendar`, `BuyerLinks`, `ForwardButton`, `Transcript`, `PageFooter`.

### Decisions and deviations
1. **Runtime imports come only from `@mergero/shared/i18n`.** I measured the cost of importing the index: 688 KB, because it pulls in tinyld and zod. So I re-implemented four small helpers:
   - `slideAt` (same as `slideAtTime`)
   - `calculatorRange` (same as `computeValuation`, from `p25` and `p75`)
   - `formatMoney`
   - the channel list

   The tests check each one against the shared function, over a fine time grid and over all profit ranges and six locales.
2. **Recorder:**
   - One queue with events tagged by session ID, and one batch per session ID.
   - Each batch holds at most 500 events, the limit of `eventBatchSchema`.
   - While a request is in flight, a tick does not start a second one. A failed batch goes back to the front of the queue.
   - The beacon sends the in-flight events plus the queue, in chunks of at most 60 KB. An in-flight request that fails after a beacon does not queue those events again.
   - HTTP status handling: 404 and 410 stop the recorder. Other 4xx statuses drop the batch. 408, 429, 5xx and network errors retry.
   - **Addition:** after 30 minutes with no event, a new session ID starts. Without this, a tab that stays open would never give the "came back" signal.
   - The sessionStorage key is `mergero.session.{code}`. When `randomUUID` is missing (plain http on a LAN), a UUID v4 fallback is made from random bytes.
3. **Player events:**
   - A pointer seek records one event, on release. Keyboard seeks are grouped into one event after 600 ms without a key.
   - A slide mark jump always records `slide_end` and then `slide_start`, so a jump back to the start of a slide counts as a replay.
   - At the natural end, `pause` is skipped (`complete` closes the interval). A media error during playback records `pause`.
   - `hide()` records `page_hide` with the playhead. When the page is visible again and the video still plays, `play` is recorded to open a new interval.
4. **Behavior choices:**
   - Buyers show while the playhead is in slide 5.
   - The calendar opens at slide 8, at the end of the video, or with the "Book a meeting" button, and then stays open. The button moves focus to the calendar heading.
   - The Send button is disabled while every field is empty.
   - `calculator_result` is recorded 1.5 s after the result changes, with `data.available` only. If the profit is given but `data.calculator` is null, it records `available: false`.
5. **Tap names:** `data-track`, else `data-region`, else `page`.
6. **Field names:** `revenue-kind`, `revenue-range`, `revenue-exact` (the same three for profit), `staff`, `timing`, `not-interested-reason`, `custom-{questionId}`, `message`, `booking-email`.
7. **External links:** all use `rel="noopener noreferrer"`, so the link code cannot leak in the Referer header. Buyer websites must be http or https; a bare host name gets `https://`.
8. **Missing i18n strings:** the retry button uses `page.play`, and a failed slot load shows `page.noSlots`.
9. **Form sent at load:** `formSent` at load shows only the "sent" text, because `VideoPageData` carries no answers.
10. **Doc conflict:** `architecture.md` names a `video.html`, but the task and `vite.config.ts` use a `main.tsx` entry inside the Hono HTML. I followed the task.

### How I verified
- **Build of the video entry:** JS is 320 KB, 99.7 KB gzip. Of that, react-dom is 64.7 KB, i18n 13.3 KB and my code 14.7 KB (gzip). CSS is 25 KB, 6 KB gzip. The CSS holds no admin theme classes (`@source` covers only `src/video`). The logo SVG is inlined.
- **Browser run:** a harness served the built bundle with mock `/v/:code` routes. Every request was checked with the shared zod schemas, and every check passed. I used Playwright with system Chrome on a 1280 px desktop, an iPhone 13 emulation, preview mode, and Finnish with reduced motion. The checks covered:
  - Video: 1080p on desktop and 720p on the phone, a 16:9 box, the form on the left on desktop and below the video on the phone, and no horizontal scroll.
  - Controls: slide marks, arrow and space and k keys, captions, mute. On iOS there is no volume slider and no fullscreen button.
  - Content: buyers on slide 5, the calendar on slide 8, the replay button at the end.
  - Booking: a 409 answer, a new slot choice, then the confirmation, which gets focus.
  - Form: calculator range "€4.1M to €12.6M" for the 1 to 2 million profit range, form send, then read-only fields. Forward also works.
  - Events: one gapless sequence and one session ID, no duplicate inside a batch, and a beacon sent as text/plain. All 15 event types occurred. No typed value appeared in any event.
  - Preview mode sends nothing.
- **Bug found and fixed:** on the phone, the calendar overflowed the card, because a `<fieldset>` has a default min-content width. `min-w-0` on the fieldsets fixed it.

### Open issues
1. **Captions language:** `<track>` has no `srclang`, because `VideoPageData` has no video language, and the captions can differ from the page language. I suggest adding `videoLanguage: Lang`.
2. **Server HTML:**
   - In production it must add the entry's `css` from the manifest.
   - In development it needs the `@vitejs/plugin-react` refresh preamble, because the entry is a `.tsx` file.
   - `/events` must accept `text/plain` from `sendBeacon`.
   - The `/book` 409 answer covers both "slot taken" and "meeting exists".
3. **Preview mode:** the form and the booking still send real requests. The server may want to block them.
4. **Strings to add to shared i18n:** a retry label, a slot load error, and an "invalid exact value" message. Splitting `STRINGS` by language would save about 11 KB gzip.
5. **Not tested:** WebKit and iOS Safari (WebKit is not installed), and real fullscreen (only the button's presence was checked). Vale did not run (no MCP tools in this session).
