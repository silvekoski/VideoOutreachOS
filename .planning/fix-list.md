# Fix list after the first integration run (2026-09-26)

Status 2026-09-27: all 15 items are done. The fix reports are in `.planning/build-reports/fix-*.md`.

Found by the lead in the live run. The audit findings come in addition.

1. Analyst time zone: the sync sets Europe/Helsinki for every analyst. Take `timezone_name` from the Pipedrive user (real client) and `timeZone` from `seed/pipedrive.json` users (fake client). Jonas Weber (DACH) must get Europe/Berlin, and the calendar must use it.
2. Signal evidence shows "#25", an event ID. Show the event type, the time and the slide or channel in words.
3. Video page accessibility: the revenue and profit selects have the name "Spanne wählen" (the name must say revenue or profit); the progress slider has an empty `aria-valuetext`; the buyer links all have the name "Website besuchen" (add the buyer name).
4. MGX deal texts and buyer focus lines stay in English on slides 2, 5 and 6 of a Finnish or German video. Translate them with the model into the video language (one request, the number check and the slot limits apply, the original text on failure). The fake model keeps the original.
5. Two range-request helpers (`apps/server/src/html/send-file.ts` and `apps/server/src/routes/admin/send-file.ts`). Keep one.
6. Preview mode: the video page must disable the form and the booking when `data.preview` is true.
7. Events for an expired link: return 410 so the recorder stops.
8. Captions: add `videoLanguage` to `VideoPageData` and set `srclang` on the track.
9. A render with a missing media file fails 3 times. Make the missing-file error non-retryable.
10. `jobs.id` uses AUTOINCREMENT, so a skipped duplicate insert uses up an ID (confirmed). Use a plain INTEGER PRIMARY KEY for jobs.
11. The video page loads the i18n strings of all six languages (272 kB, 84 kB gzip). Load only the page language.
12. Meeting time in the brief and the Inbox has no time zone. Show the analyst time zone.
13. Playwright end-to-end tests for the player and the form on mobile Chrome and mobile Safari (WebKit) do not exist yet (PRD "Stack").
14. README with the run steps, the environment variables and the Pipedrive setup.
15. Planning docs: add the decisions from `.planning/build-reports/*.md` to `architecture.md` (LinkedIn key is the email, `MGX_PORT`, `MGX_PUBLIC_URL`, the `om-os` path word, the opens rule, queue and pipeline details).

Done during the run:
- The video page used its own copies of `computeValuation`, `slideAtTime` and `formatMoney`. It now imports `valuationRange`, `slideAtTime` and `formatEur` from shared subpath exports. `packages/shared` has `"sideEffects": false`.
- A slide mark jump landed a few milliseconds before the slide start and recorded a false replay. The jump now seeks 0.05 s past the start.
- `opens` counted sessions. It now counts page loads (open events), at least one per session.
