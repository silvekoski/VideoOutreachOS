I fixed four of the five findings. The fifth (booking email) needed no change in my files, because its alert text is built in a file that the admin agent owns. Typecheck (shared, server, web, scene), ESLint on each changed file, and the vitest projects shared, web, scene (533 tests) and server (355 tests) all pass. I did not run the e2e tests, because the stack is stopped.

**1. transcript-missing-screen-text (major): fixed**
- `apps/server/src/video/page-data.ts`: each transcript entry now has `screen: string[]`, the text that the slide shows. It comes from the variables and labels of the served version. Item limits and number formats are the same as in `scene.tsx`, and country names are in the video language.
  - Slide 1: the analyst name.
  - Slide 2: the headline with the buyer count, the buyer names, and the deals as "year, country: text".
  - Slide 3: the headline, the company name and the 3 lines.
  - Slide 4: the revenue and profit with their labels, the fiscal year and the source (figures mode), or the ask text.
  - Slide 5: each buyer as "name: focus".
  - Slide 6: the 2 deals as "year, country: text".
  - Slides 7 and 8: the headline and the other text on the slide.
  - An entry is now also kept when the slide has screen text but no speech.
- `apps/web/src/video/transcript.tsx`: under each slide, an "On screen" label and a list that uses it as its name (`aria-labelledby`). The spoken text and the list have `lang` set to the video language. I also added `motion-reduce:transition-none` to the chevron icon.
- `apps/web/src/video/app.tsx`: one line, passes `lang={data.videoLanguage}`.
- New page string `onScreen` in `packages/shared/src/i18n/base.ts` and in all six language files:

  | Language | Text |
  |---|---|
  | en | On screen |
  | fi | Ruudulla |
  | sv | På skärmen |
  | nb | På skjermen |
  | da | På skærmen |
  | de | Auf dem Bildschirm |

- Tests: a new server test in `apps/server/test/video/page.test.ts` publishes a German version and checks the screen text of slides 2 to 8, including the two slide 6 deal texts. I also updated the two existing transcript checks. A new render test in `apps/web/test/video/a11y.test.ts` checks the list, its label and `lang`.

**2. calculator-event-without-range: fixed**
- `apps/web/src/video/valuation.ts` has a new function `calculatorRange(data, profit)`. It returns null when the calculator is off, when `data.calculator` is null, or when there is no profit. `company-form.tsx` uses it, so with no calculator nothing is recorded. A loss or a profit of 0 still records `calculator_result` with `available: false` when the calculator exists.
- The web tests have no DOM environment and no DOM library is installed, so I could not render the form and run its effect. Instead, `apps/web/test/video/valuation.test.ts` tests that `calculatorRange` returns null for every profit choice when the calculator is null, and returns a range or `available: false` when it exists. A render test in `a11y.test.ts` checks that the fixed "no range" text still shows.

**3. caption-orphan-cues: fixed**
- `packages/shared/src/timeline.ts`: each sentence now uses the fewest cues of at most 2 lines of 42 characters. The cues of a sentence have about the same length, and so do the 2 lines of a cue. A single word can be a cue only when it is the whole sentence.
- Each cue now shows for at least 1 s. The extra time comes from the other cues of the same slide, and the last cue still ends at the end of the speech.
- Tests in `packages/shared/test/timeline.test.ts`:
  - The fallback scripts in all six languages: every cue lasts at least 1 s, has at most 2 lines of 42 characters, and no cue is one word from a longer sentence.
  - One test each for balanced cues and for the 1 s minimum.
  - The old code gave 12 one-word cues on these scripts, the same kind the audit found ("ostajan.", "finden.", "mir.").
- The admin intro captions and `/api/deals/:id/captions` also use `buildCaptions`, so they get the same change; the admin tests pass.

**4. admin-clickjacking: fixed**
- `apps/server/src/html/routes.ts` has a new `denyFraming` handler. It sets `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` on every admin page.
- `apps/server/src/routes/video/index.ts`: one line applies it to all `/v/*` responses, which includes the 404 and 410 pages. No code in the app shows these pages in an iframe.
- Tests: `html.test.ts` checks both headers on `/` and `/deals/1/review`. `page.test.ts` checks them on `/v/:code` and on its 404 page.

**5. booking-email-never-shown: no change needed in my files**
- `bookMeeting` stays as it is, and it already stores `meetingEmail`; an existing check in `booking.test.ts` confirms this.
- The alert text is built in `apps/server/src/domain/events.ts` (`alertText`), which the admin agent owns. Its query already joins `deals d`, so that agent can read `d.meeting_email` there.
- Do not put the email in the event data. The retention job clears only `deals.meeting_email`, so a copy in the event data would stay.

**Contract change**
- `packages/shared/src/types.ts`: added `screen: string[]` to each `VideoPageData['transcript']` entry. Nothing was removed or renamed.
- `packages/shared/src/i18n/base.ts`: added `PageStrings.onScreen`.

**Planning docs**
- `.planning/architecture.md`:
  - The frame headers, in the paragraph after the process table.
  - The caption cue rules, in the captions item.
  - The "On screen" part of the transcript, in decision 6.
  - When the page records `calculator_result`, in the Valuation section.
- `.planning/shared-exports.md`: the `buildCaptions` comment.
- `.planning/api.md`: `X-Frame-Options` on `GET /v/:code`.

**Not done**
- No Vale MCP tools are available in this session, so I did not run a Vale check on the doc text.
