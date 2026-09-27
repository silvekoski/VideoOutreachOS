FIRECRAWL v2 SCRAPE API: SPIKE REPORT (2026-09-26)

Spike folder: /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/firecrawl/

Key fact: we had no API key, but Firecrawl Cloud has a documented keyless free tier for /scrape. To use it, send no Authorization header. I sent about 30 real requests this way, so most claims below are VERIFIED by a run. Keyless use is capped per IP per day (by request count and by credits); the numbers are not published. I got no 429.

1. ENDPOINT, AUTH, VERSIONS
* POST https://api.firecrawl.dev/v2/scrape. OpenAPI info.version is "v2" and servers is https://api.firecrawl.dev/v2. VERIFIED (ran it, and read docs.firecrawl.dev/api-reference/v2-openapi.json).
* Auth header: `Authorization: Bearer fc-...` (securitySchemes bearerAuth). Keyless: leave the header out completely. VERIFIED.
* Rate limits per plan (/scrape requests per minute / concurrent browsers): Free 10/2, Hobby 100/5, Standard 500/25, Growth 5000/50. The free plan has 1,000 credits per month. Jobs wait in a queue for a free browser, and the queue time counts against `timeout`. VERIFIED (docs).
* Node SDK: npm `firecrawl@4.41.0`. It is identical to `@mendable/firecrawl-js@4.41.0` (published 2026-09-20). It needs node >= 22 and depends on axios 1.18.0 and zod ^3.23.8. VERIFIED (npm view, installed and ran).

2. REQUEST BODY (from the OpenAPI JSON, VERIFIED)
* url (required).
* formats: default ["markdown"]. Each item is a string or an object.
  * String formats: markdown, summary, html, rawHtml, rawBase64, links, images, branding, product, menu, audio, video.
  * Object formats: {type:"json", schema?, prompt?, checkPromptInjection?}, {type:"changeTracking", modes, schema?, prompt?, tag?}, {type:"question", question}, {type:"highlights", query}, {type:"attributes", selectors:[{selector, attribute}]}.
  * Screenshot: {type:"screenshot", fullPage?: boolean (default false), quality?: integer 1..100, viewport?: {width, height} (both required)}. Docs: max one screenshot format per request, max viewport 7680x4320.
* onlyMainContent: boolean, default true. It is a deterministic HTML filter, not an LLM.
* onlyCleanContent: boolean, default false, beta. An LLM pass that removes cookie banners and similar from the markdown. Not tested, and the billing table gives no cost for it (UNVERIFIED).
* includeTags / excludeTags: arrays of CSS selectors, applied to the original DOM.
* waitFor: integer ms, default 0, added on top of the smart wait.
* timeout: integer ms, default 60000, min 1000, max 300000.
* maxAge: ms, default 172800000 (2 days). Set 0 for a fresh fetch. A cached result still costs 1 credit.
* minAge: cache only. A miss gives 404 SCRAPE_NO_CACHED_DATA.
* storeInCache: default true. Actions or headers force it to false.
* headers, mobile (default false), skipTlsVerification (default true), removeBase64Images (default true), parsers (default ["pdf"]).
* blockAds: default true. Official description: "Enables ad-blocking and cookie popup blocking."
* proxy: "basic" | "enhanced" | "auto" (default "auto"). Docs say the parameter is deprecated. Enhanced costs +0 credits.
* location: {country: ISO 3166-1 alpha-2, default "US"; languages: string[], e.g. ["fi-FI"]}.
  * Proxy countries include AT, CH, DE, DK, SE, NL, GB, FR, PL and others. FI and NO are NOT on the list: Firecrawl uses the closest EU or US region and sets the browser locale to the requested country. VERIFIED (docs).
  * Observed data.metadata.timezone: FI gave Europe/Helsinki, AT gave Europe/Vienna, DE/DK/SE/NO gave Europe/Berlin, and the default gave America/New_York. proxyUsed was "basic" every time. VERIFIED (ran).
* actions: max 50 per request, run in order. Docs say waitFor plus all wait actions must total 60 s or less.
  * {type:"wait", milliseconds} or {type:"wait", selector} (give only one).
  * {type:"click", selector, all?: boolean (default false)}.
  * {type:"write", text} (a click must focus the field first).
  * {type:"press", key}.
  * {type:"scroll", direction?: "up"|"down", selector?}.
  * {type:"screenshot", fullPage?, quality?, viewport?}.
  * {type:"scrape"}.
  * {type:"executeJavascript", script}.
  * {type:"pdf", format?, landscape?, scale?}.
  * Actions do not work on PDFs.
* Other fields: profile {name, saveChanges}, zeroDataRetention (+1 credit; you cannot use it with a screenshot), lockdown, redactPII, threatProtection.

3. ACTION BEHAVIOR (all VERIFIED by keyless runs on example.com)
* Click with a selector that is not found: the WHOLE scrape fails with HTTP 500 after about 10.8 s. There is no "ignore" flag.
  `{"success":false,"code":"SCRAPE_ACTION_ERROR","error":"Action(s) failed to complete. Error code: Failed to scrape the content, err: ActionError: Error in action 0: Element not found"}`
* Click with `all:true` and a missing selector: no error, and the scrape continues. It still waits about 10 s. Note that the SDK 4.41.0 ClickAction type has no `all` field, so you must cast.
* Wait with a selector that never appears: no error. HTTP 200 after about 10.8 s. The docs say 30 s.
* executeJavascript:
  * The script is evaluated as an EXPRESSION (a CDP Runtime.evaluate; the error text contains CDP exceptionDetails).
  * `return document.title` at top level fails the whole scrape: 500 SCRAPE_ACTION_ERROR "SyntaxError: Illegal return statement".
  * Any uncaught throw also fails the whole scrape (500 SCRAPE_ACTION_ERROR "Error: boom").
  * A returned Promise is awaited: `(async()=>{...;return 42})()` gives 42.
  * Return values arrive in data.actions.javascriptReturns in action order, as {type:"object",value:{...}}, {type:"string",value}, {type:"number",value}, and undefined as {type:"unknown",value:{type:"undefined"}}.
* DOM changes made by actions show up in the final data.markdown (an injected marker appeared). The screenshot FORMAT is taken AFTER all actions: a red full-screen overlay injected by JS filled the format screenshot, but not the earlier action screenshot.
* Without a viewport, an action screenshot is 1920x1080. The format screenshot uses its viewport (1280x720, 1280x800 and 800x600 all tested).
* When a response uses actions, data.warning recommends the /interact endpoint. When only wait actions run, data.actions is absent.
* A total wait over 60 s (waitFor 50000 + wait 20000) was NOT rejected: HTTP 200 in 51 s. Do not trust the documented limit either way.
* Actions add no credits: creditsUsed was 1 with a screenshot plus 6 actions.

4. RESPONSE SHAPE
```
{ success: true, data: {
  markdown, html?, rawHtml?, links?: string[] (absolute URLs, fragments included),
  screenshot?: string,
  actions?: { screenshots: string[], scrapes: [{url, html}], javascriptReturns: [{type, value}], pdfs: string[] },
  metadata: {...}, warning? } }
```
* metadata fields observed: title, description, language (from html lang, e.g. "fi-FI", "de", "nb"), keywords, robots, ogTitle, ogDescription, ogUrl, ogImage, ogSiteName, ogLocaleAlternate, plus the raw keys "og:title", "og:image", "twitter:*" and similar. Also favicon, scrapeId, sourceURL (the requested URL), url (the final URL), statusCode (the TARGET page status), contentType, timezone, proxyUsed, creditsUsed, concurrencyLimited, cacheState ("hit"|"miss"), error. VERIFIED.
* GOTCHA: metadata values can be a string OR a string[]. On spiegel.de, "og:title", robots and viewport were arrays, while the camelCase ogTitle was a string. VERIFIED.
* The API returns 200 with success:true even when the target page gives 404 or 403. Check data.metadata.statusCode (2xx or 304 means a clean load). You pay 1 credit for such pages. VERIFIED (docs).
* data.screenshot is a URL, not base64:
  `https://storage.googleapis.com/firecrawl-scrape-media/screenshot-<uuid>.png?GoogleAccessId=...&Expires=<unix>&Signature=...`
  The content-type is image/png, even with quality set. With quality 60 and fullPage, the file was a palette PNG of 1280x2957. VERIFIED.
* How long the screenshot URL stays valid:
  * The docs and the OpenAPI say screenshots expire after 24 hours. VERIFIED (docs).
  * The signed URL's Expires parameter was the issue time + 604800 s (7 days). VERIFIED (observed).
  * Treat 24 h as the real limit: download the file at once and store it yourself.
  * The audio and video format URLs expire after 1 h.

5. CREDITS (billing docs VERIFIED; the 1-credit base VERIFIED by creditsUsed)
* Base price is 1 credit per page. markdown, links, html, screenshot and actions cost no extra.
* Extras:
  * json: +4
  * question / highlights: +4 each
  * redactPII: +4
  * ZDR: +1
  * PDF: +1 per page
  * audio / video: +4
  * lockdown cache hit: 5 in total (a miss costs 1)
  * checkPromptInjection: +4
  * enhanced proxy: +0
* A failed scrape that returns no document costs 0. My SCRAPE_ACTION_ERROR runs gave no document.
* Interact: 2 credits per browser minute for code, 7 for a prompt, with a 1-minute minimum.

6. ERRORS
The body shape is {success:false, code?, error, details?}.
* VERIFIED by a run:
  * 400 BAD_REQUEST. details is an array of zod issues, e.g. an unknown format, timeout below 1000, or "The rawBase64 format cannot be combined with other formats".
  * 408 SCRAPE_TIMEOUT.
  * 500 SCRAPE_ACTION_ERROR.
* From the docs:
  * 401 "Unauthorized: Invalid token"
  * 402 insufficient credits
  * 403 Forbidden, or SCRAPE_PROMPT_INJECTION_DETECTED, or THIRD_PARTY_DATA_TERMS_REQUIRED
  * 404 SCRAPE_NO_CACHED_DATA, or SCRAPE_LOCKDOWN_CACHE_MISS
  * 409 duplicate_request, or request_in_flight
  * 413, 422
  * 429 for the rate limit or the concurrency limit, with a Retry-After header
  * 500 UNKNOWN_ERROR, 502, 503, 504
  * You can retry 408, 429, 500, 502, 503 and 504 with backoff.

7. NODE SDK (VERIFIED by reading dist/index.d.ts and dist/index.js, and by runs)
* `import Firecrawl, { SdkError } from 'firecrawl'` (Firecrawl and FirecrawlClient are also named exports).
* `new Firecrawl(opts?: string | { apiKey?, apiUrl?, timeoutMs?, maxRetries?, backoffFactor? })`. apiKey falls back to FIRECRAWL_API_KEY. With no key, the SDK sends no Authorization header (keyless).
* `scrape(url: string, options?: ScrapeOptions & { autoResume?: boolean }): Promise<Document>` returns `data` directly.
* Errors: it throws SdkError {message, status, code, details}. For a missing click selector: status 500, code "SCRAPE_ACTION_ERROR".
* The SDK retries ONLY on HTTP 502 (maxRetries 3, backoff 0.5 s * 2^n). You must write your own retry for 429 and 5xx.
* The default HTTP timeout is 300000 ms. The SDK adds `origin:"js-sdk@4.41.0"` to the body.
* Interact methods: `interact(jobId, {code?|prompt?, language?:"node"|"python"|"bash", timeout?})` and `stopInteraction(jobId)`.
* Doc bug: advanced-scraping-guide.md says `import { Firecrawl } from 'firecrawl-js'`. That package does not exist (npm 404).

8. blockAds AND COOKIE BANNERS
* blockAds:true (the default) hid the banner in the Firecrawl "before" screenshot (taken 1.5 s after load) on all 8 sites where local Chrome showed a banner:
  * ikea.com/fi (OneTrust)
  * ica.se and telia.se (OneTrust)
  * dr.dk (Cookiebot, with DR's own UI)
  * spiegel.de and finn.no (Sourcepoint, cross-origin iframe)
  * posten.no (Cookie Information)
  * hesburger.fi (custom banner)
  VERIFIED.
* dm.de and orf.at: inconclusive, because no banner showed in local headless Chrome either.
* blockAds:false is NOT honored. The response says: "The engine used does not support the following features: disableAdblock -- your scrape may be partial." The banner stayed hidden on ikea and dr.dk. VERIFIED.
* GOTCHA: blockAds only hides the banner visually. The banner DOM stays, so its text leaks into the markdown. On hesburger.fi, "HYVÄKSY KAIKKI EVÄSTEET..." was in the markdown with onlyMainContent true AND false. VERIFIED.
  * Fix A (VERIFIED): excludeTags ["[id*=\"cookie\" i]","[class*=\"cookie\" i]","[id*=\"consent\" i]","[class*=\"consent\" i]","[aria-label*=\"cookie\" i]"] removed it. The case-insensitive `i` flag works. Risk: a wrapper element whose class contains "cookie" is also dropped.
    * REMOVED on 2026-09-27. On linjateras.fi, the WordPress Cookie Notice plugin puts the class `cookies-not-set` on `<body>`. `[class*="cookie" i]` dropped the whole body, and Firecrawl returned an empty page. A test on 6 sites showed that Firecrawl alone (blockAds and onlyMainContent) gives the same text, with at most one cookie sentence more. The company lines prompt tells the model to ignore cookie banners. The code sends no excludeTags now.
  * Fix B (VERIFIED): guarded DOM removal in executeJavascript (below). Cookie-word hits in the markdown went from 13 to 2 (the 2 left are footer links).

9. RECOMMENDED STRATEGY FOR NORDIC AND DACH SITES (code: consent.mjs, run on Firecrawl and in local Chrome)
* Tier 0: keep blockAds at its default (true). Set location per market: FI fi-FI, SE sv-SE, NO nb-NO, DK da-DK, DE de-DE, AT de-AT, CH de-CH. Set maxAge 0 when you need fresh content.
* Tier 1: never use `click` with a CMP selector, because one miss fails the whole scrape. Use only executeJavascript, in an async IIFE with try/catch. `consentActions()` gives:
  `[{type:"wait",milliseconds:1500}, {type:"executeJavascript",script:consentScript("accept")}, {type:"wait",milliseconds:2000}, {type:"executeJavascript",script:consentScript("cleanup")}]`
* The accept phase polls for up to 5 s and tries these in order:
  1. 23 known accept selectors, e.g. #onetrust-accept-btn-handler, #CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll, #didomi-notice-agree-button, .coi-banner__accept, .cmpboxbtnyes, button[data-testid="uc-accept-all-button"].
  2. Text matching over buttons, links and [role=button], including open shadow roots and same-origin iframes. It uses a strong multilingual regex (accept all, hyväksy kaikki, godkänn alla, acceptera alla, godta alle, tillad alle, alle akzeptieren, samþykkja, and more), a weak regex (hyväksy, godta, ok, ...) that only counts inside a cookie or consent container, and a negative regex (reject, only necessary, settings, hylkää, vain, avvisa, endast, nur, ablehnen, einstellungen, ...). It skips links with a real href.
  3. CMP JS APIs after 2.5 s: OneTrust.AllowAll(), Cookiebot.submitCustomConsent(true,true,true), UC_UI.acceptAllConsents(), __ucCmp.acceptAllConsents(), Didomi.setUserAgreeToAll(), CookieInformation.submitAllCategories(). Local runs used the OneTrust and Usercentrics calls; the other API names are UNVERIFIED.
  4. It detects Sourcepoint or TrustArc cross-origin iframes (which it cannot click) and stops.
  5. It stops with "none-visible" after 1.5 s if no visible banner exists. On Firecrawl this is the normal result, because blockAds already hid the banner.
  The click is scheduled with setTimeout(50), so a reload after consent cannot break the evaluate call. That risk is reasoned, not VERIFIED on Firecrawl.
* The cleanup phase:
  * clicks close buttons in visible large dialogs (close, sulje, stäng, lukk, luk, schließen, ...). It closed a Telia promo modal locally.
  * removes known CMP containers,
  * removes visible fixed elements with cookie words,
  * removes hidden consent nodes, guarded by text under 3000 chars and no main, article or h1 inside,
  * unlocks overflow on html and body,
  * returns {method, removed, what, visibleAfter}.
* Tier 2: do not pass excludeTags (see the gotcha above). The cleanup phase removes the CMP_CONTAINERS.
* GOTCHA (VERIFIED 2026-09-27): onlyMainContent also filters the `links` format. On kobenhavns-mobelsnedkeri.com, the home page gave 3 links and no menu links. `scrapeHome` also calls POST /v2/map {url, limit:500, includeSubdomains:false} in parallel and adds its URLs to the links. The map took 2 s to 14 s. If the map fails, the home page links stay.
* Tier 3 fallbacks:
  * On 500 SCRAPE_ACTION_ERROR, retry once without actions (blockAds alone).
  * If javascriptReturns[1].value.visibleAfter is not null, flag the screenshot.
  * If you need a real consent inside a cross-origin iframe, use POST /v2/scrape/{data.metadata.scrapeId}/interact with body {code, language:"node", timeout}. `page` there is a Playwright Page, so this should work: `await page.frameLocator('iframe[id^="sp_message_iframe"]').getByRole('button',{name:/accept|zustimmen|akzeptieren|godta|hyväksy/i}).click()`. Stop the session with DELETE on the same path. UNVERIFIED (docs only).
* Results:
  * Local Chrome (raw CDP evaluate with awaitPromise and returnByValue, the same path as Firecrawl), clean "after" screenshots:
    * OneTrust selector: ikea, elisa, ica, posti, alko, otto, telia.se, jysk.dk, kone.fi
    * Cookie Information selector: posten.no
    * text match: dr.dk ("tillad alle"), hesburger.fi ("hyväksy kaikki evästeet")
    * Sourcepoint container removed: spiegel.de, finn.no
  * Firecrawl: 17 runs on 10 sites, all HTTP 200, creditsUsed 1, no action errors. With the actions, a scrape took 11.4 to 20.8 s (13.3 s max with the final script). A plain scrape took about 2 s.

10. OTHER GOTCHAS
* The default location is US (America/New_York). EU consent logic can differ, so always set location.
* rawBase64 must be the only format.
* ZDR cannot be combined with a screenshot.
* A cached result still costs 1 credit.
* SDK types lag the API: ClickAction has no `all`, ScrollAction.direction is required, and FormatString has no "rawBase64".

FILES
* consent.mjs: exports CMP_CONTAINERS, consentScript(phase, overrides) and consentActions({settleMs, afterClickMs}).
* run-firecrawl.mjs: the SDK runner, keyless (`node run-firecrawl.mjs <url> <CC> <langs> <blockAds>`).
* local-cdp.mjs: the local Chrome CDP harness.
* sdk-errors.mjs: the SDK error tests.
* runs/: raw curl responses and headers.
* fc-runs/: Firecrawl JSON and before/after PNGs.
* local-runs/: local screenshots.
* docs/: the official docs and the v2 OpenAPI JSON.
