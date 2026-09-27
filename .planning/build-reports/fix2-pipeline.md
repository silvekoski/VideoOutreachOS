All six pipeline findings are fixed. Typecheck passes for shared, server, scene and web, and eslint is clean on every changed file. Tests pass: shared and web 546, server 365, scene 9 (real Chrome render). The key new tests fail when their fix is reverted (checked for fix 1 part 1 and for the scene empty panel).

**1. cleared-script-publishes-old-audio (all three parts)**
- **Part 1:** `advance(db, id, now, { finishedJobId })`. `pipelineState` now leaves out the calling write-script job, so its own slides still show `script_missing`. `write-script.ts` passes `job.id` on both of its `advance` calls.
- **Part 2:** in `editTimeline`, an empty saved script now gets `scriptSource: null`.
- **Part 3:** `nextStep` returns `wait` while any script is empty. It adds the audio job when any slide audio is not `ok`, and adds the render job only when all audio is `ok`.
  - It waits and does not block: with no open reasons, an empty script can only mean another write-script job is still running.
- Files: `apps/server/src/domain/pipeline.ts`, `apps/server/src/jobs/write-script.ts`.
- Tests:
  - `pipeline.test.ts`: published v1, clear slide 5, approve. It blocks on `script_missing`, there is no v2 render, and later v2 is published. A second test waits on a running job, then queues audio before the render.
  - `write-script.test.ts`: published v1, clear, approve, runJob gives a new script and only an audio job. A second test: its own job leaves slide 5 empty, so the deal blocks with no audio or render job.

**2. unfixed-long-company-name-blocks-forever**
- `ensure.ts`: for an existing deal that is not published and not lost, `ensure` reads the Pipedrive deal, person, organization and owner again (LinkedIn only when the person changed). It writes the snapshot only when it changed.
- It then calls the new `refreshNames` in `pipeline.ts`. That puts the company and analyst names into slides 1, 3 and 8 of the newest version that is not approved (a new version if that one is rendered).
  - Beyond the brief: a script that contains an old name is handled like a line edit. A model script is cleared and rewritten; an analyst script gets `script_check`.
- A failed read keeps the deal data and returns `refreshError`.
- `routes/admin/deals.ts` (small edit) now returns `EnsureDealDto`.
- Web: new `review/refresh-names-button.tsx` and `review/name-reasons.ts`. `slide-row.tsx` shows "Shorten the name in Pipedrive, then read it again" and the "Read from Pipedrive again" button next to a too-long reason for `facecam.name`, `your-company.company` or `book-meeting.name`.
- Tests: `ensure.test.ts` (3 tests) and `apps/web/test/admin/name-reasons.test.ts`.

**3. fallback-lines-dangling-pronoun**
- `fallback-writer.ts`: first-person filtering moved into `markdownSentences`. A sentence that starts with a refer-back word (list per language; German das/der/die only before a lowercase word) is kept only when the sentence directly before it in the source was kept. The slide 3 `{line}` quote uses the same rule.
- Test: `fallback-writer.test.ts` reads `seed/sites/kivirannan-konepaja/index.html`; "Se lyhentää…" is gone. There is also an English case.

**4. script-check-no-confirm-action**
- `script-field.tsx`: a "Script is correct" button shows when the slide has `script_check`. It saves the current draft, then moves focus back to the textarea.
- The reason text in `pipeline.ts` now names the button and the real cause (slide 3 "company name or lines", slide 5 "buyer list", other slides "company or analyst name").
- Test: the existing pipeline test now also confirms slide 3 with unchanged text.

**5. failed-intro-rerecording-disables-ready-intro**
- `analysts.ts`: an upload over a ready intro goes into `intros[lang].pending`. `completeIntro` swaps it in; `failIntro` marks only the pending entry. New `introUpload()` helper.
- `audio.ts` (`runIntro`) uses it.
- Small edits in other files: `db/rows.ts`, `views/inbox.ts`, `routes/admin/inbox.ts` (`reopen`), `web/admin/api.ts` (polling).
- `intro-section.tsx` shows a processing or failed note for the pending recording.
- Tests: `analysts.test.ts`, `audio.test.ts` (a failed re-recording keeps the ready intro and gives no `no_intro`), and the `inbox.test.ts` expectation.

**6. empty-slide-without-mgx-data**
- **Slide 6:** falls back to recent deals of all sectors, first those not on slide 2, with `scope: 'recent'`, the `headline-recent` label, a `recent` fallback script in 6 languages, and a scope-aware model prompt (`prompts.ts`).
- **Slide 5:** no buyers now gives the blocking reason `slide_empty`. It asks the analyst to restore a buyer when they removed all, and says MGX has no public buyers otherwise.
- **Scene:** an empty buyer or deal list now renders a panel with the `empty` label. The panel code is shared with the slide 4 "ask" panel.
- I did not block slide 6 when it is still empty after the fallback; the scene panel covers that case.
- Tests: `write-script.test.ts`, `pipeline.test.ts`, `fallback-writer.test.ts`, and `packages/scene/test/layout.test.ts` (render of empty slides 5 and 6).

**Contract changes (all additive)**
- `types.ts`: reason code `'slide_empty'`, `DealScope`, optional `scope` on the what-is-possible variables.
- `api-types.ts`: `IntroUpload`, optional `IntroInfo.pending`, `EnsureDealDto`.
- `ScriptContext.dealScope?` in `fallback-writer.ts`.
- i18n `base.ts` plus all six languages: `buyers.empty`, `'what-is-possible'.headline-recent` and `.empty`.
- `slots.ts`: `buyers.empty` and `what-is-possible.empty` (120 characters each).

**Other small edits outside my files**
- `web/admin/lib/status.ts`: title for `slide_empty`.
- Expectations only, for the new ensure response and pending intro: `apps/server/test/admin/{deals,request-guard,inbox}.test.ts`.
- Docs: `.planning/architecture.md`, `.planning/api.md`, `.planning/shared-exports.md`.

**Not done or open**
- A deal whose slide 5 is empty because MGX has no public buyers stays in Review. The reason says so, but the tool has no action to read MGX again.
- Vale was not run: no Vale tool is available in this session.
- For the video-page agent: slide 6 may now have `scope: 'recent'` or an empty deal list with `labels.empty`, which matters for the "On screen" transcript.
