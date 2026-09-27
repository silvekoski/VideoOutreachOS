All nine items are fixed and tested. The web typecheck is clean, and the shared and web test projects pass (470 tests). The server has 327 passing tests and 5 failures, all in other agents' files (listed at the end). The server and shared typechecks fail only on other agents' work in progress. Real Pipedrive mode needs `pnpm setup:pipedrive` run again, because `config/pipedrive.json` must now contain two new required field keys.

**Fixes by finding**

1. **signal-evidence-shows-raw-id** (fix-list 2):
   - Each Signal now stores `evidenceEvent` when the brief is written: the event type, the time (client time, else server time), the slide and the channel.
   - For "came back", the evidence is now the first `open` event of the second day. If that day has no open event, the evidence is the list of days as text.
   - The brief view no longer needs the deal events list. It shows the evidence in words, in the brief language and the brief time zone, for example "Complete, 2026-09-26 23:35, WhatsApp". Computed text is also in words ("Slide 4, Slide 5").
   - New helper `signalEvidence` in `apps/web/src/admin/lib/brief.ts`. The event names are a new `BriefStrings.events` block in all six language files under `packages/shared/src/i18n/`.
   - Tests: `signals.test.ts`, `brief-data.test.ts`, web `brief.test.ts`.
2. **custom-questions-missing-without-form:** `MeetingBrief.customQuestions` lists each question with its answer, or null. It is filled also when there is no form, and `form` stays null. The fallback writer now uses this list to ask about an unanswered question. I also added one sentence to the brief-text prompt in `jobs/prompts.ts` that explains the field. Tests: `brief-data.test.ts`, `fallback-writer.test.ts`.
3. **model-outage-gives-no-brief:** after the last failed attempt, the job writes a brief with the data sections, summary null and questions null, if no brief covers the events yet. The failed job stays in Review. A brief now only blocks a new run if it has a summary, so a Retry writes version 2 with the text. Test: `write-brief.test.ts` (three 503 errors, then Retry).
4. **figures-table-wrong-column-header:** the value column header now uses `f.value`. The video page agent had already added that label in all six languages, so I did not touch it.
5. **pipedrive-analytics-no-per-slide-watch-time:** two new deal fields. "Watch time per slide" holds text like `"1: 31 s, 2: 18 s, 8: 15 s"`. "Link channel" holds the channel of the newest session, for example "WhatsApp". I added the keys to the config types and schema, the setup script, the fake store and the real client. Tests: `pipedrive-write`, `pipedrive-fake` and `pipedrive-real` tests.
6. **lost-form-skips-form-sent-stage:** for a lost deal, the stage write now compares against the highest stage the deal reached (new `reachedStage` in `stages.ts`), so Pipedrive gets Form sent before Lost.
   **pipedrive-note-date-not-iso:** the note now reads, for example, "Meeting: 2026-09-27 15:00 (Europe/Helsinki)". The time helper moved to `views/dates.ts` as `localDateTime`, and the alerts use the same helper. Tests are in `pipedrive-write.test.ts`.
7. **second-open-task-hidden:** `DealDetailDto.openTasks` is now a list, and the deal page shows one card per open task. Each card has its own id (`open-task-<id>`), so the ids stay unique. Test: `deals.test.ts` with a call task and a second-channel task.
8. **voice-pending-without-consent:**
   - A voice upload no longer sets `pending`. A new `markClonePending` sets it only when a clone job is really queued, from the voice route (consent exists) or the consent route.
   - The upload toast now says the clone starts after the written consent when there is no consent yet. The consent toast says the clone starts now when one was queued.
   - Tests: `domain/analysts.test.ts` and `admin/analysts.test.ts`.
9. **Fix-list 1 and 12 (time zones):**
   - The real client reads `timezone_name` from each Pipedrive user, and the fake client reads `timeZone`. The seed now has 1001 Europe/Helsinki, 1002 Europe/Berlin and 1003 Europe/Oslo.
   - The sync ignores a value that is not a valid IANA zone. It keeps a zone that the analyst changed locally, tracked by a new `analysts.time_zone_local` column set by the settings patch. The booking calendar already uses the analyst zone.
   - The brief header stores the analyst zone and shows the meeting time with it. The Inbox Meeting today row shows the current analyst's zone.
   - Tests: a new sync test, and the `pipedrive-real` users test.

**Contract changes**
- **Shared types:**
  - New `EVIDENCE_EVENT_TYPES`, `EvidenceEventType` and `SignalEvidenceEvent`.
  - `Signal.evidenceEvent` is new.
  - `MeetingBrief.header.timeZone` and `MeetingBrief.customQuestions` are new.
  - `SignalInput.sessionDays` no longer has `firstEventId`.
  - `isTimeZone` is now exported from `schemas.ts`.
- **Not additive:** `DealDetailDto.openTask` was replaced by `openTasks`. Only the deal page used it. `.planning/api.md` still describes `openTask` and needs an update.
- **Pipedrive:** `PipedriveUser.timeZone` is new. `PipedriveConfig.dealFields` and `PipedriveDealFields` gain `watchPerSlide` and `linkChannel`.
- **Server functions:** `openTaskFor` was removed and `events.ts`'s `localTime` moved to `views/dates.ts`. `reachedStage` and `markClonePending` are new. `setVoiceSample` now changes only the file.
- **Web:** `BriefView` and `BriefCard` no longer take an `events` prop.

**Small edits in files I do not own**
- `packages/shared`: `types.ts`, `api-types.ts`, `schemas.ts`, one line in `fallback-writer.ts`, and the `events` block in `i18n/base.ts` plus the six language files.
- `apps/server/src/db/schema.sql` (one column) and `apps/server/src/jobs/prompts.ts` (one sentence).
- Web: `lib/brief.ts`, `pages/deal-page.tsx`, `pages/inbox-page.tsx`, `profile/voice-section.tsx`.
- Tests: `ensure.test.ts`, `stages.test.ts`, `deals.test.ts`, `inbox.test.ts`, `admin/analysts.test.ts`, and in shared `test/fixtures.ts` and `fallback-writer.test.ts`.

**Checks**
- `pnpm --filter @mergero/web typecheck` is clean.
- The server and shared typechecks show errors only from other agents: the ScriptContext `linesSource` and facecam `transcript` changes in test fixtures, `RenderInputError` missing in `render.ts`, and the scene previews.
- `pnpm vitest run --project server`: 327 passed and 5 failed, all in other agents' files: `pipeline.test.ts` (2), `write-script.test.ts` (2), and "applies a review patch" in `deals.test.ts`.
- ESLint is clean on all my files. The only errors are the unused `Lang` and `TemplateName` imports in `i18n/base.ts`, left by the i18n split.

**Not done:** nothing in `sweep.ts` needed a change.
