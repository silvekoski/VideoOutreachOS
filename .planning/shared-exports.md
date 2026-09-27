# Exports of @mergero/shared

`packages/shared/src/index.ts` exports all modules below. The package has no build step: `exports` in its package.json points to the TypeScript source. The code uses only erasable TypeScript syntax (no enum, no namespace, no parameter properties) and `.ts` extensions in relative imports.

Subpath exports: `@mergero/shared` (all), `@mergero/shared/i18n` (the strings of all six languages, for the server and the admin panel), `@mergero/shared/i18n/base` (the string types, the range options, `fill` and `formatEur`, with no language data), `@mergero/shared/i18n/{fi,sv,nb,da,de,en}` (one language each, export `strings`), `@mergero/shared/format`, `@mergero/shared/timeline` and `@mergero/shared/valuation`. The video page imports only `i18n/base` and loads the module of the page language with a dynamic import. `apps/web/vite.config.ts` puts each language in its own chunk, and the server adds a `modulepreload` link for the chunk of the page language.

```ts
// types.ts, api-types.ts: see the files.

// languages.ts
export const COUNTRY_LANGUAGES: Record<string, Lang[]>        // FI: ['fi','sv'], SE: ['sv'], NO: ['nb'], DK: ['da'], DE/AT/CH: ['de']
export const COUNTRY_TIME_ZONES: Record<string, string>      // FI: 'Europe/Helsinki', SE: 'Europe/Stockholm', NO: 'Europe/Oslo', DK: 'Europe/Copenhagen', IS: 'Atlantic/Reykjavik', DE: 'Europe/Berlin', AT: 'Europe/Vienna', CH: 'Europe/Zurich'
export const LANGUAGE_NAMES: Record<Lang, string>            // English names: fi 'Finnish'
export const LANGUAGE_LOCALES: Record<Lang, string>          // BCP 47: fi 'fi-FI', sv 'sv-SE', nb 'nb-NO', da 'da-DK', de 'de-DE', en 'en-US'
export const DACH: readonly string[]                         // ['DE','AT','CH']
export function countryLanguages(country: string): Lang[]    // unknown country: ['en']
export function countryTimeZone(country: string): string     // unknown country: 'Europe/Helsinki'
export function isLang(value: unknown): value is Lang
export function normalizeLang(value: string | null | undefined): Lang | null  // 'fi-FI' -> 'fi', 'no'/'nn'/'nb' -> 'nb', 'de-CH' -> 'de'
export function resolveLanguage(input: { country: string; siteLanguage: Lang | null; linkedinLanguages: Lang[] }): Lang
export function detectLanguage(text: string): Lang | null    // null when the text is too short or unclear

// checks.ts
export function countWords(text: string): number
export function digitGroups(value: unknown): Set<string>     // walks strings and numbers in any JSON value; "2 412 000", "2.412.000", "2,4" give "2412000", "2412000", "24"
export function unknownNumbers(output: string, input: unknown): string[]
export interface CheckResult { ok: boolean; errors: string[] }
export function checkScript(script: string, lang: Lang, input: unknown): CheckResult   // 30 to 60 words, language, numbers
export function checkLines(lines: unknown, lang: Lang, input: unknown): CheckResult    // array of exactly 3 non-empty strings, each within SLOT_LIMITS['your-company.line'], language of the joined text, numbers
export function checkBriefText(output: { summary: string; questions: string[] }, lang: Lang, input: unknown): CheckResult // summary 1 to 60 words, 3 to 5 questions, language, numbers
export interface TranslationSource { id: string; text: string; max: number }
export function checkTranslations(texts: readonly { id: string; text: string }[], lang: Lang, sources: readonly TranslationSource[]): CheckResult // same ids in order, each within max, numbers per source text, language of the changed texts

// slots.ts
export const SLOT_LIMITS: Record<string, number>
// keys: 'who-we-are.headline', 'who-we-are.buyer-name', 'who-we-are.deal-text',
//   'your-company.company', 'your-company.line', 'your-figures.headline', 'your-figures.ask',
//   'buyers.headline', 'buyers.name', 'buyers.focus', 'buyers.empty', 'what-is-possible.headline', 'what-is-possible.deal-text', 'what-is-possible.empty',
//   'privacy.headline', 'privacy.point', 'book-meeting.headline', 'book-meeting.line', 'facecam.name'
export function checkTimelineSlots(timeline: Timeline): ReviewReason[]   // code 'text_too_long', slide, slot, detail "Slide 5, buyer focus: 96 of 80 characters"

// timeline.ts
export function frames(seconds: number, fps: number): number             // Math.ceil(seconds * fps - 1e-9)
export function plannedDurationS(segment: Segment, fps: number, pauseS: number): number | null  // facecam: frames(durationS)/fps; slide: frames(audio.durationS + pauseS)/fps; null without audio
export function slideTimes(timeline: Timeline): { slide: SlideNumber; startS: number; endS: number }[]  // actual times, throws when a segment has no startS/endS
export function withPlannedTimes(timeline: Timeline): Timeline           // fills startS/endS from planned durations (frame exact)
export function slideAtTime(slides: { slide: SlideNumber; startS: number; endS: number }[], t: number): SlideNumber | null
export function buildCaptions(timeline: Timeline, introTranscript: string | null): string  // WebVTT, balanced cues of at most 2 lines of 42 characters, no one-word cue in a longer sentence, each cue at least 1 s inside the speech time
export const SLIDE_NAMES_EN: Record<SlideNumber, string> // 1 'Face-cam intro', 2 'Who Mergero is', 3 'Your company', 4 'Your figures', 5 'Buyers from Mergero deals', 6 'What is possible', 7 'Your data stays private', 8 'Book a meeting'

// analytics.ts
export interface SlideTime { slide: SlideNumber; startS: number; endS: number }
export function computeSessionAnalytics(events: Pick<StoredEvent,'type'|'slide'|'videoTime'|'data'|'seq'>[], slides: SlideTime[]): SessionAnalytics
export function computeDealAnalytics(sessions: { localDay: string; channel: SessionChannel; events: StoredEvent[]; slides?: SlideTime[] }[], slides: SlideTime[]): DealAnalytics  // session.slides (its own video version) wins over slides; channel is the channel of the last (newest) session

// signals.ts
export interface SignalInput {
  analytics: DealAnalytics
  events: StoredEvent[]          // all events of the deal, session and deal events
  form: FormAnswers | null
  sessionDays: { sessionId: string; localDay: string; firstEventId: number | null }[]
}
export function computeSignals(input: SignalInput): Signal[]            // order of SIGNAL_KEYS, only the signals that hold
export function interestLevel(signals: Signal[]): InterestLevel

// valuation.ts
export function nace2(nace: string | null | undefined): string | null  // '25.62' -> '25', 'C25.6' -> '25', '2562' -> '25'
export function percentile(sorted: number[], p: number): number        // R-7, p in [0,1], input sorted ascending
export function multiplesFor(deals: MgxClosedDeal[], nace: string | null): number[]  // same nace2, finite positive multiples, sorted ascending
export function computeValuation(profit: Amount | null, multiples: number[], nace: string | null): ValuationResult

// format.ts
export function formatMoney(value: number, lang: Lang): string           // compact currency EUR, Intl, locale from LANGUAGE_LOCALES
export function formatAmount(amount: Amount | null, lang: Lang): string  // range: "1 M EUR to 3 M EUR" style in each language via i18n "to" word, exact: full EUR value without decimals ('€1,450,000'), not compact
export function pipedriveAmountText(amount: Amount | null): string | null // '1000000-3000000 EUR', '1500000 EUR', open range '5000000- EUR' / '-1000000 EUR'
export function pipedriveValuationText(v: ValuationResult | null): string | null
export function formatDurationS(seconds: number): string                 // '2 min 05 s', '45 s'

// i18n.ts (also at subpath @mergero/shared/i18n); re-exports i18n/base.ts (types, REVENUE_RANGES, PROFIT_RANGES, BRIEF_SECTIONS, fill, formatEur)
export interface Strings { page: {...}; slides: {...}; brief: {...}; og: {...}; signals: Record<SignalKey,string>; interest: Record<InterestLevel,string>; staff: ...; timing: ...; channels: ... }
export const STRINGS: Record<Lang, Strings>
export function t(lang: Lang): Strings
export function slideLabels(lang: Lang, template: TemplateName): Record<string, string>

// fallback-writer.ts
export interface ScriptContext { lang: Lang; company: string; ownerFirstName: string; analystName: string; buyerNames: string[]; buyerScope?: BuyerScope; buyerCount: number; figures: Financials; calculator: boolean; lines: string[]; linesSource: 'model' | 'analyst' | null; hasWebsite: boolean; dealTexts: string[]; dealScope?: DealScope; country: string }   // dealScope 'recent': the slide 6 script does not say "in your sector"; buyerScope 'featured' or no buyer name: the slide 5 script does not say "companies like yours"
export function fallbackScript(slide: ScriptSlideNumber, ctx: ScriptContext): string   // passes checkScript for each language
export function fallbackLines(markdown: string, lang: Lang, company: string): string[] // 3 lines, each within the slot limit, no first or second person, no question, no sentence without a lowercase word (a name or an address), no sentence that refers back to a sentence that is not the line before it
export function fallbackBriefText(input: { lang: Lang; brief: Omit<MeetingBrief,'questions'> }): { summary: string; questions: string[] } // passes checkBriefText

// schemas.ts (zod 4)
export const eventBatchSchema, formSubmitSchema, bookSchema, reviewPatchSchema, analystPatchSchema
export const scriptOutputJsonSchema, linesOutputJsonSchema, briefOutputJsonSchema, translationsOutputJsonSchema   // JSON Schema objects for the model
```
