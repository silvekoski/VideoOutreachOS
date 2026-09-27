All the checks pass from the root: typecheck, lint, 927 unit tests, the web build and 12 Playwright e2e tests. I ran the e2e suite twice in a row with no failures, and each run took 3.8 min.

**1. Dev data reset.** I deleted `/Users/veikka/prompt-marketing-hackathon-monorepo/storage`.

**2. Playwright e2e.** The suite covers every item you listed, on both projects:
- **Player:** poster and play button, tap to play, the 720p source on a phone, the slide 5 mark with the buyer links, the captions toggle, and a session that the admin API shows.
- **Recorder:** the typed revenue, message and booking email are never in the events, neither in the requests nor in the stored events.
- **Form:** a revenue range, a profit range and then an exact profit, with the calculator range each time. An invalid value shows the error. After sending, the admin API shows the answers and the fake Pipedrive store shows the four fields and the `form_sent` stage.
- **Booking:** the page shows "Zeitzone: Europe/Berlin", and the confirmation shows the time with "(Europe/Berlin)" and no abbreviation. The deal goes to `meeting_booked`.
- **Preview:** Send and Book are disabled with the preview note, the server gives 403 for both, nothing is stored and no events are sent.
- **Expired link:** the page, the media and the events all give 410.

How the setup works: the global setup builds the web app. It starts the API (`NODE_ENV=production`), the worker and the mock MGX on free ports, with the fake providers and a temporary storage folder. It uploads a 3 s generated intro, a voice sample and a consent PDF through the admin API with the required header, then publishes the deals. The teardown stops the processes and deletes the folder (`MERGERO_E2E_KEEP=1` keeps it).

Three things differ from your brief:
- **Three deals, not two.** A link accepts one form and one meeting, and expiry is final, so the two projects cannot share one DACH deal. Chrome uses 4007 and Safari uses 4009 (CH, which also has a calculator range) for the form, booking and expiry, which run in order in one spec file. The player, recorder and preview specs use the FI deal 4001 in both projects. The extra render costs about 1 min of setup.
- **Expiry needs a direct database edit.** The admin API accepts 1 to 365 days, so a link cannot expire during the run. The test sets 1 day through the admin API and checks the result, then moves `expires_at` into the past in SQLite.
- **4001 is published too.** The admin API gives no link code for an unpublished deal, so the preview test uses the published link with `?preview=1`.

**3. Fixes to existing code.** The first full `pnpm test` run had one failure: a 5 s timeout in `apps/server/test/jobs/audio.test.ts` (it runs many ffmpeg jobs and was slow under load). I gave its two describe blocks a 30 s timeout.

I also changed these repo files:
- `package.json`: `typecheck` now also runs `tsc -p e2e`.
- `eslint.config.js`: allows the empty `({}, use)` fixture pattern in `e2e/**`.
- `README.md`: e2e run notes.
- `.planning/architecture.md`: a new "End-to-end tests (Playwright)" section.

The search for U+2014 and U+2013 found nothing.

**4. Final results**

| Check | Result |
|---|---|
| `pnpm typecheck` | 5 packages plus `e2e`, 0 errors |
| `pnpm lint` | 0 problems |
| `pnpm test` | 82 files, 927 tests passed |
| `pnpm --filter @mergero/web build` | passes, 2873 modules, 2.76 s; one warning: the admin chunk is 1,095.74 kB (over 500 kB) |
| `pnpm e2e` | 12 passed (6 tests × 2 projects), 3.8 min total: about 200 s of setup and about 30 s of tests on 3 workers |

The first e2e attempt took 6.8 min because the machine was under heavy load (load average 108, about 112 MB free memory). That is why I set `workers: 3`.

**Open items (not fixed)**
- **Meeting expiry can be undone.** Setting the expiry after a booking moves `expires_at` to now + N days, even when the meeting is later. This undoes the "meeting end + 24 h" rule; the video-page agent already reported it.
- **Brief analytics.** `brief-data.ts` still uses the slide times of the published version for every session, per the video-page report.
- **No Vale check.** The Vale tools are not available here, so the README and architecture text has no Vale check.

Files are in /Users/veikka/prompt-marketing-hackathon-monorepo:
- playwright.config.ts
- e2e/global-setup.ts
- e2e/stack.ts
- e2e/fixtures.ts
- e2e/player.spec.ts
- e2e/recorder.spec.ts
- e2e/preview.spec.ts
- e2e/form-booking-expiry.spec.ts
- e2e/tsconfig.json
