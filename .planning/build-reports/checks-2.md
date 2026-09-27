All the requested checks pass. I fixed one U+2013/U+2014 hit and one gap between the pipeline and video-page fixes, and then ran every check again.

**Checks (all run from the repository root, results after my fixes)**
- `pnpm typecheck`: exit 0. It covers shared, scene, web, server, mgx-mock and `tsc -p e2e`. The `slide_empty` error that the admin agent reported is gone: `REVIEW_REASON_TITLES` now has an entry for it.
- `pnpm lint`: exit 0, no findings.
- `pnpm test`: 84 files and 987 tests pass, 0 fail. By project: shared 11 files / 309 tests, server 45 / 366, web 23 / 237, mgx-mock 3 / 66, scene 2 / 9. Before my fix it was 986 tests.
- `pnpm --filter @mergero/web build`: exit 0, built in 2.95 s. There is one Vite warning: `admin-*.js` is 1,099.95 kB (329 kB gzip), which is more than 500 kB. It is only a warning.
- `pnpm e2e`: 12 of 12 pass, on mobile-chrome and mobile-safari, 6 tests each. The stack was ready after about 200 s and the run took 3.8 min. I ran it twice, before and after my fix, and both runs passed.
- U+2014 and U+2013 search, including hidden and gitignored files except the excluded directories: there was 1 hit before the fix and there are 0 now. Escaped forms (`\u2013`, `&ndash;` and similar) show up only in tests that check that text has no dashes.
- Text file check: 488 files, all text and valid UTF-8. No file is missing its final newline, and none has a BOM or a CR.

**Fixes**
1. **Literal dashes in the audit file.** `/Users/veikka/prompt-marketing-hackathon-monorepo/.planning/audit-2.json`, line 368 (the "coverage" text), had a literal en dash and em dash in "no escaped - or , ". I replaced them with the escaped text `\\u2013` and `\\u2014`, so the meaning stays the same. The file still parses as JSON.
2. **Empty slides 5 and 6 missing from the "On screen" transcript.** The pipeline agent flagged this for the video-page agent, and it was not handled. When slide 5 has no buyers or slide 6 has no deals, the scene draws a panel with `labels.empty`, but the transcript showed only the headline.
   - `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/src/video/page-data.ts`: `screenParts` now returns `[labels.headline, labels.empty]` for `buyers` and `what-is-possible` when the list is empty.
   - The slide 6 recent-deals headline needed no change here. `write-script.ts` `possibleLabels` already copies `headline-recent` into `labels.headline`.
   - New test in `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/test/video/page.test.ts`: "lists the empty panel text of slides 5 and 6 without buyers or deals" (German version). It fails when I take the fix out and passes with it.
   - `/Users/veikka/prompt-marketing-hackathon-monorepo/.planning/architecture.md`, decision 6: added one sentence that says the list gives the `empty` label when slide 5 or 6 has no items.

**Cross-agent check:** in `apps/server/src/routes/admin/inbox.ts`, `reopen()` keeps both changes that touched it. The pipeline agent's `introUpload()` pending-intro path and the admin agent's `markClonePending` path are both there, and their tests pass.

**Contract changes:** none.

**Not done**
- Vale: no Vale MCP tool is available in this session, so I did not check the prose with it.
- The large admin bundle warning is still there. It does not make the build fail.
