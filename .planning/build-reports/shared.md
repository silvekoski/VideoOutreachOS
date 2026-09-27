I implemented `@mergero/shared` completely. Typecheck and eslint pass with no errors, and all 251 tests in 11 files pass (`pnpm vitest run --project shared`). I made no edits to the contract files.

## Files
- **Source** in `/Users/veikka/prompt-marketing-hackathon-monorepo/packages/shared/src/`: `index.ts`, `languages.ts`, `words.ts`, `checks.ts`, `slots.ts`, `timeline.ts`, `analytics.ts`, `signals.ts`, `valuation.ts`, `format.ts`, `i18n.ts`, `fallback-writer.ts`, `schemas.ts`.
- **Tests** in `/Users/veikka/prompt-marketing-hackathon-monorepo/packages/shared/test/`: `fixtures.ts` (a helper, not a test file) and 11 `*.test.ts` files: analytics, signals, valuation, format, checks, slots, timeline, i18n, languages, fallback-writer, schemas.

## Exports
Every name and signature in `shared-exports.md` is implemented in the file it names. I added these exports:
- **`slots.ts`:** `labelSlot(template, key): string | null` and `textLength(text)` (counts code points after NFC normalization). I also added slot keys for every label: `who-we-are.buyers-heading`/`deals-heading`, `your-company.headline`, `your-figures.revenue`/`profit`/`value`/`fiscal-year`/`source`, and `book-meeting.name`.
- **`i18n.ts`:**
  - `fill(template, vars)`.
  - `REVENUE_RANGES` and `PROFIT_RANGES`, as `{ value, min, max }` constants.
  - Types `RevenueRange`, `ProfitRange`, `Device`, `PageStrings`, `SlideLabelStrings`, `BriefStrings`, plus `BRIEF_SECTIONS` and `BriefSection`.
  - `Strings` also has `locale` and `format: { range, under, over }`.
- **`schemas.ts`:** zod schemas `scriptOutputSchema`, `linesOutputSchema` and `briefOutputSchema`. The three JSON Schemas are generated from them with `z.toJSONSchema` (draft-7). Each request schema uses `satisfies z.ZodType<Dto>`, so tsc catches drift from the contract types.
- **`words.ts`** (internal): holds `countWords`, and `checks.ts` re-exports it. This avoids an import cycle between `languages.ts` and `checks.ts`.

## Decisions and deviations
- **Slide label keys** match the slot names. A numbered or variant key uses the slot of its prefix: `privacy.point-1` to `point-3` use `privacy.point`, and `your-figures.ask-calculator` and `ask-form` use `your-figures.ask`. `checkTimelineSlots` also measures `segment.labels`, so the server must store labels with the placeholders already filled.
- **Placeholders** the server must fill:
  - `{buyerCount}` in the who-we-are headline, and `{year}` in the fiscal-year label.
  - Page and og strings use `{company}`, `{analyst}`, `{n}`, `{name}`, `{date}`, `{low}` and `{high}`.
- **Valuation:**
  - An open upper bound gives `high: null`.
  - A missing or zero lower bound gives `low: null`, with `available: true`.
  - A profit of 0 or less, or no bounds at all, gives `available: false` but keeps p25 and p75.
  - Results are rounded to whole euros.
- **Form schema:** range bounds may be 0 or more, because the loss option is `{min: null, max: 0}` and "under 0.25 M" has `min: 0`. An exact value must be more than 0. A range needs at least one bound, and min must not be above max.
- **`formatAmount(null)`** returns the "No data" string of that language.
- **Finnish ranges:** Finnish has no word for "to" in a range. `format.range` in Finnish is "alaraja {min}, yläraja {max}", so no dash is needed.
- **Analytics:**
  - `opens` and `sessions` are both the session count, as the architecture says.
  - A session with a `complete` event has stop slide 8, even if it replays after that.
- **Signal evidence:**
  - Event signals use the first matching event ID.
  - Exact figures and custom answers use the newest `form_sent` event.
  - "Came back" uses the first event of the earliest session on the second local day.
  - A replay uses the first repeated slide 4 or 5 start.
  - "Stopped early" gives the stop slide number as text. "Short watch" gives the whole seconds, rounded down, as text.
- **Captions:** cues break at sentence ends. Each slide's cues cover only its speech time (audio length, not the 0.4 s pause), shared out by character count.
- **Fallback writer:**
  - It tries variants from richest to plainest and returns the first one that passes `checkScript`.
  - It inserts the company line or deal text only when that text is in the script language. Without this, the check passed Finnish scripts that contained an English sentence.
  - German scripts do not use the owner's first name, because first name with "Sie" is wrong. Finnish scripts do not inflect company names.
- **Brief form keys:** the fallback brief writer expects `MeetingBrief.form.answers[].key` values `timing` and `staff`. The server should use the `FormAnswers` field names as keys.

## Other checks
- A plain `node` import of `src/index.ts` works under native type stripping (74 exports).
- `i18n.ts` loads only itself. `format.ts` loads only `i18n.ts`. `timeline`, `analytics`, `signals`, `valuation` and `slots` load no tinyld and no zod.
- The tests confirm that no string in `STRINGS`, no fallback output and no file in `src/` or `test/` contains an em dash or an en dash.
- The tests confirm that all six languages have the same keys and the same placeholders as English.

## Open issues
1. **Video page bundle size:** a runtime import from `@mergero/shared` (the index) pulls in tinyld (811 KB browser build) and zod. The video page should import only `@mergero/shared/i18n` plus type-only imports. If it needs `slideAtTime`, `formatMoney` or `computeValuation`, add subpath exports such as `./timeline` and `./format`, or `"sideEffects": false`, to `packages/shared/package.json`. I do not own that file.
2. **Slot limits** (`SLOT_LIMITS`) are character estimates for a 1920x1080 slide in Geist. The scene owner should check them against the real layout.
3. **No Vale check:** the Vale MCP tools are not available in this session, so the UI strings did not get a Vale check.
