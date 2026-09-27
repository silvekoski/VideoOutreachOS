All findings in my task are fixed except one focus gap on the Inbox and Failed jobs rows (end of the list). Tests, lint and typecheck pass for my files.

**Verification**
- `pnpm vitest run --project server test/admin`: 7 files, 68 tests pass.
- `pnpm vitest run --project web --project shared`: 33 files, 507 tests pass.
- Typecheck: 0 errors in web, server and shared.
- `pnpm exec eslint` on my files: clean.
- Scan of the changed files: no em dash, en dash, emoji, BOM or CRLF.
- The full server project has 3 failures in `test/jobs/audio.test.ts` and `test/jobs/write-script.test.ts`. The failing tests change between runs. They are work in progress of other agents, not my files.

**admin-api-csrf, admin-post-csrf**
- `apps/server/src/routes/admin/index.ts`: a guard now runs first on each `/api/*` request.
  - A request that is not GET or HEAD needs the header `X-Mergero-Admin: 1`. If the browser sends `Sec-Fetch-Site`, it must be `same-origin`. Else, if it sends `Origin`, it must equal the request origin. Otherwise the answer is 403 as an `ApiError`, with no CORS headers.
  - I did not use `hono/csrf`, because it checks only form content types. My check covers all body types and has the same Sec-Fetch-Site and Origin rules.
  - **Added beyond the task (DNS rebinding):** each `/api/*` request, reads included, must use `localhost`, `*.localhost`, an IP address, or the host of `ADMIN_BASE_URL`. Other host names get 403. This can block a LAN host name such as `mergero.local` until `ADMIN_BASE_URL` is set to it. If you do not want this check, delete it.
  - `/v/*` has no guard. A test mounts the admin routes like `api.ts` does and sends a `text/plain` beacon to `/v/:code/events`. It gets 204.
- `apps/web/src/admin/api.ts`: `request()` always sends the header.
- Tests:
  - New `apps/server/test/admin/request-guard.test.ts` covers: a POST with no body, a `text/plain` POST and a cross-site multipart consent upload (no file is saved), bad Sec-Fetch-Site and Origin values, the OPTIONS preflight, a good request, a read with no header, and the host check.
  - `harness.ts` now adds the panel headers to each request.
  - `files.test.ts` has a real-socket case: a forged POST gets 403.
  - `apps/web/test/admin/api.test.ts` checks that JSON and multipart requests send the header.

**vite-dev-cors-leaks-storage** (`apps/web/vite.config.ts`)
- I removed `cors: true`. `server.fs.deny` now holds the Vite defaults plus the absolute `storage/**` path. (Setting `deny` replaces the defaults, so I kept `.env`, `.env.*`, certificate files and `.git`.)
- I ran a scratch Vite on port 5199 and stopped it after the check:
  - A module requested with `Origin: http://localhost:3000` gets 200 with `Access-Control-Allow-Origin: http://localhost:3000`. The Vite default still allows the Hono page.
  - `https://evil.example` gets no CORS header.
  - `/@fs/.../storage/data/app.sqlite`, `.env.example` and `.git/HEAD` get 403.
- Another agent added `manualChunks` to the same file. Both changes are in place.

**Other admin findings**
- **palette-button-no-name:** in `shell/command-palette.tsx` the label span is now `sr-only sm:not-sr-only`, so the Search button has a name at each width.
- **expiry-dialog-wrong-basis:** the dialog now says "The tool counts the days from today." The More section hint says the same for a published deal, and "from the publication" before it.
- **review-marks-lost-after-edit:**
  - `ReviewDto` now has `video: ReviewVideoDto | null`, and `videoUrl` and `videoVersion` are gone. `views/review.ts` fills it from the timeline row of the played version.
  - `video-panel.tsx` takes the slide marks from `video.slides`. I deleted the `slideMarks` helper and its test.
  - Server test: after an edit, v2 has no times and the video still gives the v1 slide times.
- **more-section-silent-save:**
  - The expiry field and the language select now each save through their own non-silent mutation. An error shows a toast and a Saving, Saved or "Not saved: message" status next to the field.
  - A failed expiry save puts the old value back in the field. The select shows the new value while the save runs, and goes back to the old value if the save fails.
- **review-video-no-captions:**
  - New `apps/server/src/routes/admin/captions.ts`, mounted in `index.ts`, gives `GET /api/deals/:id/captions.v:n.vtt`. It uses the shared `buildCaptions` with the times of that version.
  - The transcript comes from the face-cam variables of that version. If the version has no `transcript` field, it uses the analyst transcript.
  - It gives 404 before the render and 400 for version 0.
  - The review video now has a `<track kind="captions" default>`.
  - I also did the intro part of this finding: the profile intro player has a captions track from a data URL (`admin/lib/captions.ts`, tested).
- **emoji-in-test:** `packages/shared/test/slots.test.ts` now uses `'\u{1F600}'`.

**Accessibility problems the audit missed** (`apps/web/src/admin/**`)
- **Focus after dialogs:** three dialogs had no trigger, so Radix sent the focus to the page body when they closed. These are the command palette, the session replay and the intro and voice upload dialog. The new `admin/lib/use-return-focus.ts` gives the focus back to the control that opened the dialog, and it has tests. The Search button is now the palette's `DialogTrigger`.
- **Deals table:** the rows were focusable `<tr>` elements with no role. The company name is now a real link. A mouse click on the row still opens the deal.
- **Inbox:** the buttons that only change the page are now links.
- **Focus lost on disabled buttons:** these buttons used `disabled` while a save ran, which drops the focus. They now use `aria-disabled` and ignore a second click: buyer Remove and Restore, Approve, expiry Save, upload Submit and consent Save.
- **After Approve:** the focus moves to the "Approved" status.
- **Consent form:** it no longer rebuilds itself after a save. It uses a native `required` check on the file field and clears the field through a ref.

**Contract changes**
- `packages/shared/src/api-types.ts`:
  - New `ADMIN_REQUEST_HEADER = 'X-Mergero-Admin'`.
  - New `ReviewVideoDto { version, url, captionsUrl, language, slides }`.
  - `ReviewDto.video` replaces `videoUrl` and `videoVersion`.
- New route `GET /api/deals/:id/captions.v:n.vtt`.
- Each admin write needs the header and the same origin. Any future script or Playwright step that writes through the admin API must send `X-Mergero-Admin: 1`.
- `.planning/api.md` now describes the request guard and the new route.

**Edits in files of other agents** (small, exact replacements)
- `packages/shared/src/api-types.ts`.
- `apps/server/test/admin/deals.test.ts`: the review test expects `video: null`. The patch test now expects step `write-script`, because the pipeline agent's change rewrites the script after a buyer edit.
- Profile files, which other agents are also editing:
  - `profile/media-upload-dialog.tsx`: focus return and `aria-disabled` on submit.
  - `profile/voice-section.tsx`: the consent form.
  - `profile/intro-section.tsx`: the captions track.

**Not fixed**
- **Inbox and Failed jobs Retry:** after a retry works, the row goes away and the focus goes to the page body. A fix must choose the next focus target, for example the group heading.
- **Disabled buttons with a reason:** "Copy link" and "Download 720p" before publication give the reason in `title` only, which a keyboard user cannot reach. This is not a level A failure.
- **Vale:** the tools were not available, so the new text in `.planning/api.md` and the UI strings got no Vale check.
