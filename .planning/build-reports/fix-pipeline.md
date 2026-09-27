All seven findings are fixed and pass verification. Typecheck is clean for shared, server, scene and web, and ESLint is clean on every file I changed. Vitest passes in full: shared + server 627/627, scene 8/8, web 226/226. `pipeline-e2e` and the admin `deals.test` pass too (another agent had already changed its `step` to `'write-script'`).

**1. stale-script-after-buyer-or-lines-edit**
- `domain/pipeline.ts`: when the slide 3 lines or the slide 5 buyer list change:
  - **Script not written by the analyst:** the script and `scriptSource` are cleared, the audio status goes to `missing`, and a write-script job for that slide is queued at once. The key is `write-script:{deal}:{version}:{slides}:edit-{n}`, where n counts the write-script jobs of that version. The counter keeps the key unique when the same version is edited twice.
  - **Script written by the analyst:** the slide gets `scriptCheck: true`, which gives the blocking reason `script_check` with the slide number. The next save of that slide's script clears it, also when the text is the same.
- Order inside one patch: lines and buyer edits apply first, then script saves.
- `pipelineState` hides `script_missing` for slides that a queued or running write-script job covers, so the analyst does not see a false reason while the rewrite runs.
- `jobs/write-script.ts`: a written script is kept only if the slide variables did not change while the model wrote it.
- `types.ts`: added `'script_check'` to `ReviewReasonCode` and `scriptCheck?: boolean` to `SlideSegment`. `apps/web/src/admin/lib/status.ts`: one line, `script_check: 'Check the script'`.
- Tests: `pipeline.test.ts` (2 updated, 2 new), `write-script.test.ts` (rewrite after a buyer removal, and the changed-variables guard).

**2. mgx-texts-not-in-video-language, buyer-focus-not-localized, fix-list item 4**
- New checked model task `translate-texts`, one request in write-script after `selectContent`. It is skipped when the language is `en`. It covers the slide 5 buyer focus lines and the slide 2 and 6 deal texts. Each text's `max` is its slot limit; a deal on both slides gets the smaller one.
- New `checkTranslations` in `checks.ts` checks:
  - the same ids in the same order;
  - each text within its `max`;
  - numbers of each text against its own source text;
  - the language of the texts the model changed. Unchanged texts pass, so the fake model's originals pass with no warnings.
- On failure the original texts stay, with a warning log and no review reason.
- Provider errors (network, HTTP) still throw, so the job retries, as for the scripts.
- `translationsOutputSchema` and `translationsOutputJsonSchema` are in `schemas.ts`, `translateTextsPrompt` is in `prompts.ts`, and `model-fake.ts` returns the original texts.
- `VideoPageData.buyers` already read the published timeline, so the page and the video now show the same translated text.
- Docs: the row is added to "Language model requests" in `architecture.md`, and `shared-exports.md` is updated.
- Tests: `checks.test.ts`, `model-fake.test.ts`, `write-script.test.ts` (translation applied, and failure keeps the originals).

**3. calculator-promise-without-range**
- Slide 4 now sets `calculator: calculatorFor(deal) !== null`, the same rule the page uses; `scriptContext` falls back to the same rule.
- Tests: DACH with 3 sector deals keeps the calculator text; with 2 it uses the form text.

**4. Intro transcript findings (not-versioned, stale-after-rerecord, captions-missing)**
- The facecam variables now carry `transcript: string | null`. `buildTimeline` and `withCurrentIntro` fill it. `withCurrentIntro` is now exported from `pipeline.ts`, and the duplicate copy in `render.ts` is removed.
- `page-data.ts`: `introTranscript(timeline)` replaces `introTranscript(analyst, lang)`. The page transcript and the captions route in `routes/video/index.ts` both read it from the version they serve.
- `routes/admin/analysts.ts`: an intro upload with no transcript, or a blank one, gives 400.
- Admin form: `intro-section.tsx` makes the transcript required, with a hint, and `media-upload-dialog.tsx` gets a `canSubmit` prop.
- Fixtures: the facecam segment in `apps/server/test/domain/fixtures.ts` now has transcript `'Hei, olen Aino Mergerosta.'`, and `packages/shared/test/fixtures.ts` has `null`.
- Tests: `page.test.ts` (a new recording does not change the page or the captions), `analysts.test.ts` (400), `render.test.ts`.

**5. slide3-claims-website-review and fallback-lines-first-person**
- `ScriptContext` gets `hasWebsite` (scrape ok and a screenshot) and `linesSource`.
- Slide 3 fallback variants are now `{ site, noSite }` in all 6 languages; the `noSite` variants do not mention the website.
- `slideScriptPrompt(slide, context)` mentions the screenshot only when it exists, and says when the analyst wrote the lines.
- Website sentences in the first person are dropped. This uses a word list per language, plus the Finnish `-mme` ending.
- The fallback script quotes a company line only when it is in the third person.
- Tests: all languages pass the checks for the no-website contexts, plus new first-person tests.

**6. media-written-after-purge-never-deleted**
- The audio and render jobs end at once for an expired deal and write no files.
- `routes/admin/inbox.ts`: a retry gives 409 "The link has expired" for a scrape, write-script, audio or render job of an expired deal. I limited it to these job types so a Pipedrive write can still be retried after expiry.
- `domain/retention.ts`: each sweep deletes a `deals/{id}` folder again if it exists after `expired_at` is set.
- Tests: `audio.test.ts`, `render.test.ts`, `inbox.test.ts`, `retention.test.ts`.

**7. fix-list item 9**
- The scene exports `RenderInputError`. It is thrown for a missing file, a path outside storage, a bad fps or size, or a slide with no valid duration.
- `jobs/render.ts` maps it to `NonRetryableError`, so the render fails on the first attempt.
- Tests: `packages/scene/test/render.test.ts` and `render.test.ts` (fails on attempt 1).

**Contract changes**
- `ScriptContext` has 2 new required fields.
- `introTranscript` in `page-data.ts` takes the timeline only.
- `slideScriptPrompt(slide, context)` has a new signature.
- The intro upload requires a transcript.
- The retry endpoint can give 409 for an expired deal.
- The write-script key has an `:edit-{n}` suffix after a lines or buyer edit.
- `architecture.md` is updated to match: retention, the write-script step, blocking reasons, versions and edits, keys, captions, render, model checks.

**Files of other owners I touched**
- `routes/admin/inbox.ts` (2 small edits), `domain/retention.ts`.
- `apps/web/src/admin/lib/status.ts` (1 line), `apps/web/src/admin/profile/intro-section.tsx`, `apps/web/src/admin/profile/media-upload-dialog.tsx`.
- Both test fixture files, `inbox.test.ts`, `analysts.test.ts`, `page.test.ts`, `.planning/shared-exports.md`.

**Open items**
- Another agent's `routes/admin/captions.ts` has its own `introTranscript`, which falls back to the analyst's current transcript. It could use `introTranscript(timeline)` from `page-data.ts` now that every version stores the transcript. It keeps working as it is.
- CLAUDE.md asks for a Vale check of the prose, but no Vale MCP tools are available here, so the doc edits have no Vale check.
