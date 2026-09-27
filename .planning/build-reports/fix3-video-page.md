Both video-page findings are fixed. The video tests pass (web `test/video` 165/165, shared and server 677/677), the web, server and shared typechecks are clean, and eslint is clean on all changed files.

**1. exact-amount-decimal-misparse**
- **Change:** in `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/src/video/valuation.ts`, `parseAmount` now matches `/^(\d[\d.,]*?)[.,](\d{1,2})$/u`. On a match, it removes the separators from the integer part and keeps the last 1 or 2 digits as decimals. Otherwise it removes every separator, as before, so a final 3-digit group is still thousands.
- **Tests:** `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/test/video/valuation.test.ts` has these new cases:
  - '1.450.000,00' gives 1450000.
  - '1,450,000.00' gives 1450000.
  - '1.450.000,5' gives 1450000.5.
  - '1 450 000,00' and '1450000,00' give 1450000.
  - '1.450' gives 1450, and '1.450.000' gives 1450000.
  - '0,00' is still rejected.

**2. form-accepted-twice**
- **Server:** `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/src/video/form.ts` returns `DomainError(409, 'The form was already sent')` when `deal.formSentAt !== null`. It checks before the MGX call and again inside the store transaction, after reading the deal again. In the parallel case it also writes a `log.warn` with the extra MGX `receiptId`.
- **Server tests** in `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/server/test/video/form.test.ts`:
  - **Second POST:** it gets 409 with the error body. `mgx.submitForm` has 1 call, `deals.form`, `formSentAt` and `mgxReceiptId` keep the first values, and there is 1 `form_sent` event and 1 Pipedrive fields job.
  - **Two parallel POSTs:** a gate makes both requests reach MGX before either stores. The statuses are [200, 409], and there is 1 `form_sent` event and 1 fields job. The warn log shows that the check inside the transaction ran.
- **Page:** in `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/src/video/company-form.tsx`, the form has a new status `alreadySent`. A 409 sets it; any other failure still gives `error`.
  - The status locks the form: the fieldset and the Send button are disabled, and the submit guard stops a new send.
  - The status line shows `page.alreadySent` with an alert icon, never `page.sent`. It is in the `aria-live` region and gets focus.
  - I moved the status line into an exported `FormStatus` component so a test can render it, and replaced the nested ternary with a lookup.
- **Two changes outside the form:** a new `isConflict(error)` in `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/src/video/api.ts`, and `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/src/video/calendar.tsx` now uses it for its own 409 check. I did this because eslint's react-refresh rule warned about a helper function exported from the `.tsx` file.
- **Strings:** `page.alreadySent` is added to `/Users/veikka/prompt-marketing-hackathon-monorepo/packages/shared/src/i18n/base.ts` and to all six locales (en, de, da, sv, nb, fi). Each is one line after `submitError`, added with exact single-match edits.
- **Web tests:**
  - `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/test/video/api.test.ts` checks that `isConflict` is true for 409 and false for 502 and for a network error.
  - `/Users/veikka/prompt-marketing-hackathon-monorepo/apps/web/test/video/a11y.test.ts` renders `FormStatus` in all six languages. It checks for `aria-live="polite"`, the `alreadySent` text, and that the text is different from `sent`.
  - The existing shared i18n tests check that each language has the same keys and has no dashes.
- **Docs:**
  - In `/Users/veikka/prompt-marketing-hackathon-monorepo/.planning/api.md`, the `POST /v/:code/form` row now lists "409 when the form was already sent".
  - In `/Users/veikka/prompt-marketing-hackathon-monorepo/.planning/architecture.md`, item 9 of the form flow now states the one-form rule and the two checks.

**Contract changes:** one additive field, `alreadySent: string`, in `PageStrings`. There are no changes to `types.ts` or `api-types.ts`.

**Not fixed, or open:**
- **Parallel sends still reach MGX twice.** When two requests are in flight together, both still call MGX `submit_form`, because the MGX call is async and happens outside the transaction. Only one form is stored; the other gets 409 and its MGX receipt is logged with a warning. A lock while a request is in flight would stop the second MGX call. But if the first call then failed, the second person would have been told the form was already sent when nothing was stored, so I did not add one.
- **Pages loaded after the first send** still show `page.sent` from the bootstrap `formSent` value. This is unchanged behavior and outside these findings.
- **Two failing web tests are not in my files:** `test/admin/api.test.ts` and `test/admin/review.test.ts` fail with "awaitingPublication is not a function". This looks like another agent's admin work that is still in progress.
- **Vale:** the Vale MCP tools are not available in this session, so I could not check the doc prose with Vale.
