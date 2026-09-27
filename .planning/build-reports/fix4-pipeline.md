All three findings are fixed and tested. Typecheck passes for server, web, shared, scene and mgx-mock, eslint is clean on every file I changed, and the tests pass: server 388, web 257, shared 335. The first full server run lost one test, `pipeline-e2e.test.ts`, to its 300 s timeout while other fix agents were running tests. The same test passes when I run it alone. I did not start the dev stack or regenerate the demo deals, and I did not read `.env`.

**approved-rewrite-shows-cannot-continue**
- **Change:** in `apps/server/src/domain/pipeline.ts`, `advance()` now computes the stored review reasons again after `nextStep` adds a `write-script` job. When the analyst clears a script and then approves, `script_missing` is no longer stored for that slide. The Review page then shows "waiting" and not "blocked", and the Inbox gets no stale row. No web change was necessary.
- **Tests:** in `pipeline.test.ts`, the "asks the model again for a cleared script on approval" and "asks the model for a script that the analyst cleared" tests now check that the approval gives `reasons: []` and that `deal.reviewReasons` is `[]`, for an unpublished deal and a published one. The check that the `finishedJobId` advance keeps `script_missing` still passes.

**refresh-ignores-contact-person-change**
- **Change:** `PipedriveRefresh` has a new field, `ownerFirstName: { from, to }`, which `ensure.ts` fills.
  - In `refreshed()`, the old first name is one of the replaced names. A script that contains an old name is cleared and written again, or it gets `script_check` when the analyst wrote it.
  - A new version is made only when a variable changed, a script is stale, or the owner changed.
  - **Decision for you:** the finding asked for a whole-word match. I match only at the start of a word (the character before is not a letter or digit). This also catches inflected names such as "Henriks" or "Jussin", so a Finnish script does not keep the old name in the genitive. The cost is an occasional rewrite that was not needed, for example when a longer word starts with the old name.
- **Language:** when the new contact's LinkedIn languages give a different result from `resolveLanguage`, the deal gets the blocking reason `remake_needed` (shown under "Remake video" below).
- **Other:** the `script_check` text is now more general ("the names or the data of the slide"; slide 3 says "the company name, the website or the lines"). The toast of the "Read from Pipedrive again" button is now "The deal was read from Pipedrive again. Check the review reasons."
- **Tests:** two new tests in `ensure.test.ts`. One changes the contact person: the old greetings are cleared with an edit job, the analyst's script gets a check, and the Swedish to Finnish reason appears. The other changes only the NACE code and checks that the reason is stored.

**refresh-ignores-website-nace-business-id**
- **Minimum fix:** `MgxData.nace` now stores the NACE code that loaded the MGX data (set in `loadMgx`). `valuation.ts` uses it for the page calculator and for `dealValuation`, not the current snapshot NACE. Stored data without this field falls back to the snapshot NACE, so the existing demo deals keep their calculator.
- **Blocking reason:** each version built from data now stores `Timeline.basis` (website, business ID for FI deals only, NACE code).
  - On an unpublished deal, `pipelineState` adds `remake_needed` when the snapshot differs from the basis, or when the video language would now be different.
  - The detail text names what changed and says: Click "Make the video again". The reason also shows on a rendered version, and it stops the publication of an approved render that has old data.
  - When the refresh changes the snapshot but no version, `ensure.ts` now calls `advance`, so the reason is stored.
- **Remake video (one action):**
  - `remakeDeal()` resets `deals.scrape`, clears the stored reasons and queues a scrape job with the key `scrape:{deal}:remake-{n+1}`. After the scrape, `nextStep` adds the full `write-script` job for version n+1.
  - The job reads Asiakastieto and MGX again, resolves the language, translates, fetches logos and writes new scripts. It keeps the analyst's lines and scripts, with `scriptCheck` when the slide data or the language changed.
  - During a remake, approval, edits and a second remake give 409, and the refresh does not edit the old version.
  - The web side has a new component, `apps/web/src/admin/review/remake-video-button.tsx`, and a helper `needsRemake` in `lib/review.ts`. The button shows only when the `remake_needed` reason is there.
- **Tests:**
  - `pipeline.test.ts` has a new `remakeDeal` block: the reason and its text, 409 on approval, the remake flow and its guards, the language case, an approved render that is not published, the published-deal refusal, and a DE deal whose business ID is ignored.
  - `write-script.test.ts` builds version 2 end to end with the new data and the analyst's text kept. It also checks that the calculator still shows its range after the NACE code changes.
  - `apps/web/test/admin/review.test.ts` tests `needsRemake`.

**Contract changes (all additive), in `packages/shared/src/types.ts`**
- New review reason code `'remake_needed'`.
- `MgxData.nace?: string | null`.
- `Timeline.basis?: VideoBasis`, and the new `VideoBasis { website; businessId; nace }`.
- New route `POST /api/deals/:id/remake`, which returns a `ReviewDto`.

**Edits in files other agents own**
- `apps/server/src/routes/admin/deals.ts`: an import and the new remake route (5 lines).
- `apps/web/src/admin/lib/status.ts`: one line, the title `remake_needed: 'Pipedrive data changed'`.
- `apps/web/src/admin/pages/review-page.tsx`: an import and `<RemakeVideoButton review={review} />` after the reasons alert.
- `apps/server/test/jobs/audio.test.ts`: one line, the new `ownerFirstName` field in a `refreshFromPipedrive` call.
- Updated texts in the existing tests `ensure.test.ts:154` and `pipeline.test.ts:555`.

**Docs:** `.planning/architecture.md` (ensure, write-script and remake, blocking reasons, the `advance` rule, multiples) and `.planning/api.md` (the remake route).

**Not done**
- The website change alone does not start a new scrape. It adds `remake_needed`, and the analyst starts the new scrape with "Make the video again".
- Demo timelines made before this change have no `basis`, so they get no `remake_needed` reason until they are made again.
- There is no route-level test for `/remake`, because `deals.test.ts` belongs to another agent. The domain function is fully tested.
- If the rebuild job fails, approval and edits keep the message "The tool is making the video again" until the analyst retries the failed job.
