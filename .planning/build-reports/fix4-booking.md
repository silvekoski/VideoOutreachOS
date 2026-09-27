Both findings are fixed. Typecheck passes for server, web and shared, and eslint on the changed files exits 0. `pnpm vitest run --project server --project shared --project web` passes: 79 files, 972 tests.

**lost-deal-booking-hidden**
- `apps/server/src/views/inbox.ts`: the Meeting today filter now uses `!isExpired(deal, now)` in place of `!dealDone(deal, now)`. An upcoming meeting in the next 24 hours now shows, also on a lost deal. The other Inbox groups still use `dealDone`.
- `apps/server/src/video/booking.ts`: when the deal is lost, `bookMeeting` also queues the `pipedrive-write` stage job `meeting_booked`, with the same key that `moveStage` uses. The job already compares with `reachedStage`, and the provider `moveStage` only patches `stage_id`. So Pipedrive keeps the deal lost and shows the Meeting booked stage. Lost stays terminal.
- I put this change in `booking.ts`, not in `stages.ts` as the audit proposed. `booking.ts` is the only caller that moves a deal to `meeting_booked`, and `stages.ts` is not in my file list.
- Tests, in `apps/server/test/video/booking.test.ts`:
  - Form with not interested, then booking: the status stays lost, and the stage job and one write-brief job exist. `inboxDto` gives the meeting_today row at 03:00 and at 06:29, and no row at 06:30, when the 30 minute grace ends.
  - Booking, then form with not interested: the row still shows.

**calendar-409-says-no-free-times**
- `apps/server/src/video/booking.ts`: the 409 "A meeting is already booked" now has `detail: { meetingAt }`. The existing `handleError` already sends `detail`.
- `apps/web/src/video/api.ts`: `HttpError` now has a `detail` field, and `requestJson` reads it from the JSON error body (a body that is not JSON gives no detail). The new `bookedMeetingAt(error)` returns `detail.meetingAt` only for a 409.
- `apps/web/src/video/calendar.tsx`: a 409 with a meeting time sets `meetingAt`, shows `page.alreadyBooked`, and moves focus to the notice (the ref `bookedHere` is now `focusNotice`). The "slot taken" message and the slot reload now happen only for the other 409 ("This time is not free").
- `packages/shared/src/i18n/{base,en,fi,sv,da,nb,de}.ts`: new page string `alreadyBooked` with `{date}` and `{analyst}`, in all six locales.
- Tests:
  - `apps/web/test/video/api.test.ts`: `requestJson` keeps the detail of a JSON 409 body (fetch is stubbed), and gives no detail for a 502 with an HTML body. It also covers each case of `bookedMeetingAt`, and checks that `alreadyBooked` in each locale has both placeholders and differs from `booked` and `noSlots`.
  - `booking.test.ts`: the existing 409 test now expects the `detail`.
  - The web tests render only to static markup and there is no DOM library, so no test clicks through the calendar's 409 path. The error decision is tested as a pure function.

**Contract change (additive only):** `packages/shared/src/api-types.ts` has the new type `export interface BookConflictDetail { meetingAt: string }`.

**Docs:**
- `.planning/api.md`: the row for `POST /v/:code/book` now gives both 409 cases and the `detail`.
- `.planning/architecture.md` line 254: a booking on a lost deal keeps it lost but still queues the stage job, and Meeting today uses `!isExpired`.
- `.planning/architecture.md` line 377: the calendar shows `alreadyBooked` on a 409 that gives a meeting time.

I did not edit files outside my list except `api-types.ts`, and I left nothing unfixed.
