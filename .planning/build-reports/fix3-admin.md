All four admin findings are fixed. Typecheck passes for server, web, shared and e2e. `pnpm vitest run --project server --project web` passes (68 files, 622 tests), and eslint is clean on every changed file. I could not run the Vale check: there is no Vale MCP tool or `vale` binary here.

**1. approved-blocked-review-shows-publishing**
- `apps/web/src/admin/lib/review.ts`: I replaced `awaitingPublication` with `approvalState(review)`. It returns `'published' | 'waiting' | 'blocked' | 'failed' | 'closed' | null`.
  - `'closed'`: the deal is lost or `expired` is true.
  - `'failed'`: a job failed or the render failed.
  - `'blocked'`: review reasons exist.
  - `'waiting'`: none of the above.
- `apps/web/src/admin/api.ts`: `reviewNeedsPolling` does not poll for a lost deal or an expired link. For approved versions, it polls only in the `'waiting'` state.
- `apps/web/src/admin/pages/review-page.tsx`:
  - The PipelineProgress title "Approved. The tool publishes the link…" now shows only in the `'waiting'` state.
  - New alert "Version N is approved but cannot continue". It tells the analyst to fix the reasons, and that an edit removes the approval, so they approve again.
  - New alert for a lost deal or an expired link.
  - The stalled alert shows only in the `'failed'` state. It says "Retry the failed job below." only when a failed job exists.
- `apps/server/src/views/review.ts`: `reviewDto(db, deal, now)` now sets `expired`. `apps/server/src/routes/admin/deals.ts` passes `now` at all 3 calls.
- Tests:
  - `apps/web/test/admin/review.test.ts`: approved, not published, no failed job, one reason gives `'blocked'`. Lost and expired give `'closed'`.
  - `apps/web/test/admin/api.test.ts`: no polling in the blocked, lost and expired cases.
  - `apps/server/test/admin/deals.test.ts`: `ReviewDto.expired` is false, then true after 31 days.

**2. published-deal-edit-never-in-inbox**
- `apps/server/src/views/inbox.ts`: new `pendingVersion(db, deal, now)`. It returns a version number when all of these are true:
  - the deal is published and not done;
  - the newest version is greater than `publishedVersion`;
  - the deal has review reasons, or the newest version is rendered and not approved.
- The Inbox Review group now shows such a deal. The row context is "Version N: <reason>", or "Version N is ready for review. The link still shows version M". The button is "Review video".
- `apps/server/src/views/deal-rows.ts`: the next action is "Review the new version".
- `apps/server/src/views/deal-detail.ts` sets `pendingVersion`. In `apps/web/src/admin/pages/deal-page.tsx`, the alert "Version N needs your review" says which version the video page shows until approval.
- Tests:
  - `apps/server/test/admin/inbox.test.ts`: no row for a pending v2 that has no reasons. One row with reasons. One row for a rendered, unapproved v2. No row after v2 is approved and published.
  - `apps/server/test/admin/deals.test.ts`: the next action, and `pendingVersion` on the deal page data.

**3. brief-times-other-zone-unlabeled**
- The server sets `DealDetailDto.analyst.timeZone` to the analyst's zone, or to `countryTimeZone` if there is no analyst.
- `apps/web/src/admin/lib/format.ts`: new `formatZonedDateTime` ("YYYY-MM-DD HH:mm (Zone)") and `timeZoneNote`.
- These now use the analyst's zone:
  - `deal-header.tsx` (it no longer uses `useCurrentAnalyst`) and `expiry-dialog.tsx`;
  - `brief-card.tsx` and `brief-view.tsx`: a new `timeZone` prop, used for the written time, the meeting time and the signal evidence times;
  - `events-card.tsx`, `sessions-card.tsx` (with the replay dialog title), `form-answers-card.tsx`, `open-task-card.tsx` and `failed-jobs-card.tsx`.
- Each card names the zone once in its header. The brief names it on the written line and at the meeting time, so that card shows it twice.
- The Review page's failed jobs list still uses the browser zone, because `ReviewDto` has no analyst zone.
- Tests: `apps/web/test/admin/format.test.ts` (Europe/Berlin and Europe/Helsinki), and `analyst.timeZone` in `apps/server/test/admin/deals.test.ts`.

**4. review-409-list-stays-after-fix**
- `lib/review.ts`: new `ApprovalBlock`, `reasonListKey` and `currentBlock`.
- On a 409, `review-page.tsx` saves the reasons from the response together with a snapshot of the live reasons. The destructive alert shows only while the live reasons still match that snapshot. After an autosave changes them, the live "Review reasons" alert shows instead.
- I did not use the audit's filter approach. It would hide a correct 409 reason that the stored list does not have yet, for example `no_intro`.
- Tests: `currentBlock` in `apps/web/test/admin/review.test.ts`.

**Contract changes** (additive, in `packages/shared/src/api-types.ts`): `DealDetailDto.analyst.timeZone: string`, `DealDetailDto.pendingVersion: number | null`, `ReviewDto.expired: boolean`.

**Docs:**
- `.planning/architecture.md`: the Review page after approval (under Approval), the rule for an edit of a published video (under Versions and edits), and new decision 12 on the deal page time zone.
- `.planning/api.md`: the rows for `GET /api/deals/:id` and `GET /api/deals/:id/review`.

I only edited files in my area. Nothing is left unfixed.
