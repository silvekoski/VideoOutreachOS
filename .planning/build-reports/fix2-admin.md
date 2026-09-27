All 8 findings are fixed. Shared and server typecheck clean. The web typecheck has one error, and it is not in my code: another agent added `'slide_empty'` to `ReviewReasonCode` in `packages/shared/src/types.ts`, and `REVIEW_REASON_TITLES` in `apps/web/src/admin/lib/status.ts` has no entry for it yet. I did not add it, so that I do not collide with the agent that is making that change. Vitest: shared 289, server 355 and web 236 tests pass. ESLint is clean on all changed files.

**1. booking-email-never-shown (major)**
- Server: `DealDetailDto.meetingEmail` is filled in `apps/server/src/views/deal-detail.ts`. The Meeting today Inbox row carries `meetingEmail` (`apps/server/src/views/inbox.ts`). The `meeting_booked` alert now reads "Booked a meeting for {time}. Send the invitation to {email}" (`apps/server/src/domain/events.ts` reads `d.meeting_email`).
- Web: a new `apps/web/src/admin/components/mail-link.tsx` makes the mailto link. It shows in three places:
  - `deal/deal-header.tsx`: new "Meeting" fact in the analyst time zone, then an "Invitation email" fact with the link. With no email it says "Not given. Use the Pipedrive contact."
  - `components/brief-view.tsx`: next to the meeting time. The address goes to `BriefView` through `deal/brief-card.tsx` and `pages/deal-page.tsx`, so it never enters `MeetingBrief` or the Pipedrive note.
  - `pages/inbox-page.tsx`: in the Meeting today row.
- Test: new `apps/server/test/admin/meeting-email.test.ts`. It books two deals, one with an email and one without, and checks GET `/api/deals/:id`, the alert text and the Inbox row. It also checks that no job payload and no brief data contains the address.

**2. clone-retry-keeps-failed-status**
- `routes/admin/inbox.ts` `reopen()` now calls `markClonePending` in place of `setVoiceSample`.
- `apps/web/src/admin/api.ts` `useRetryJob` now also refreshes the analysts query, so the 5 s poll starts again.
- Test: new case in `test/admin/inbox.test.ts` fails a clone job, retries it, and expects `cloneStatus 'pending'` from GET `/api/analysts`.

**3. analytics-write-clears-link-channel-after-expiry**
- `DealAnalytics.channel` holds the channel of the newest session. `computeDealAnalytics` requires `channel` on each input session and sets it from the last session.
- `domain/analytics.ts` `storedSessions` now passes `channel`. `ingest.ts` needed no edit, because it already calls `storedSessions`.
- `jobs/pipedrive-write.ts` reads `deal.analytics.channel` and no longer reads the sessions table. With no channel it sends `undefined`, so the Pipedrive field stays as it is.
- Tests:
  - `packages/shared/test/analytics.test.ts` checks the channel of the newest session, and null with no sessions.
  - `test/jobs/pipedrive-write.test.ts`: new test writes with no session rows and gets 'LinkedIn'. A second write with channel null keeps 'LinkedIn'.
- One-line fixture edits for the new field: `brief-data.ts` `EMPTY_ANALYTICS`, `packages/shared/test/fixtures.ts`, `test/domain/retention.test.ts`, `test/admin/deals.test.ts`, `test/admin/metrics.test.ts`.

**4. brief-exact-figures-rounded**
- In `packages/shared/src/format.ts`, `formatAmount` shows an exact value in full: '€1,450,000' (en) and '1.450.000 €' (de). `formatMoney` stays compact for range bounds and slide 4.
- Tests: `format.test.ts` (the old '€1.5M' expectation is replaced) and web `brief.test.ts`.

**5. brief-read-recorded-once-per-tab**
- The module-level Set in `deal/brief-card.tsx` is gone. The card keeps the last reported key in a `useRef`, and the logic is in `reportBriefRead` in `lib/brief.ts`. The card sends one request per mount and per version, the StrictMode double effect does not send twice, and a failed request can be sent again.
- Test: web `brief.test.ts` models a first and second mount. The test environment has no DOM, so the tests exercise the helper, not a real component mount.

**6. review-says-published-after-failed-republish**
- `ReviewDto.publishedVersion` is filled in `views/review.ts`.
- `lib/review.ts` has two new helpers, `versionPublished` and `awaitingPublication`. `reviewNeedsPolling` in `api.ts` now uses the version and not the deal status.
- `pages/review-page.tsx` shows "Approved and published" only when the reviewed version is the published one. When a job of an approved version failed, it shows a destructive alert: "Version N is not published". The text says the render failed (or a job failed), says "The video page still shows version M." when an older version is live, and asks the analyst to retry the failed job below.
- Tests: web `api.test.ts` and `review.test.ts`; server `deals.test.ts` (new test: v1 published and v2 working gives `publishedVersion` 1; the existing test now expects null).

**7. metrics-range-uses-utc-day**
- `GET /api/metrics` takes `tz`, an IANA name checked with the shared `isTimeZone`. The default is UTC. `computeMetrics` filters on the local day in that time zone, and the default `to` is today in that zone. `MetricsDto.timeZone` echoes the zone.
- The Metrics page sends the browser time zone, adds it to the query key, and states it in the header text.
- Tests: `test/admin/metrics.test.ts` covers a link sent just after local midnight in Europe/Helsinki, the route with `tz`, the default `to` in that zone, and a 400 for a bad zone and for `EET`.

**8. planning-docs-stale-after-fixes**
- `.planning/architecture.md`: the `analytics` op line, a new "Deal channel" rule, decision 3 (where the invitation email shows, and that it never goes to Pipedrive) and decision 8 (the time zone of the date range).
- `.planning/api.md`: the retry row (409 cases, clone goes back to pending) and the metrics row (`tz`).
- `.planning/shared-exports.md` (small edits outside my listed docs): the `computeDealAnalytics` signature and the exact output of `formatAmount`.

**Contract changes (all additive)**
- `types.ts`: `DealAnalytics.channel: SessionChannel | null` (required).
- `api-types.ts`:
  - `DealDetailDto.meetingEmail: string | null`
  - `InboxRow.meetingEmail?: string | null`
  - `ReviewDto.publishedVersion: number | null`
  - `MetricsDto.timeZone: string`

**Not done**
- I did not run the Vale check that CLAUDE.md asks for, because no Vale MCP tool is available in this session.
