## Report: MGX mock, demo seed data, demo sites, Pipedrive scripts

The mock MCP server, all seed files, the 8 demo sites, 41 logos and both Pipedrive scripts are done. Typecheck, lint and all 66 tests pass. I did not call the live Pipedrive API. I ran both scripts against a local mock of the Pipedrive API.

### Files

**Mock server** (`/Users/veikka/prompt-marketing-hackathon-monorepo/apps/mgx-mock/`)
- `package.json`: `dev` and `start` now also load `../../.env` (`--env-file-if-exists`), the same as the server package.
- `src/main.ts`: entry point. Reads `MGX_PORT` (default 3100), `MGX_PUBLIC_URL` (optional) and `STORAGE_DIR` (same default as `env.ts`). Listens on 127.0.0.1. Exits cleanly on SIGINT or SIGTERM, and closes open connections by force after 5 s.
- `src/server.ts`, `src/tools.ts`, `src/seed.ts`, `src/static-files.ts`, `src/log.ts`.
- `test/test-server.ts`, `test/mcp-tools.test.ts`, `test/static-routes.test.ts`, `test/seed.test.ts`.

**Seed data** (`/Users/veikka/prompt-marketing-hackathon-monorepo/seed/`)
- `mgx.json`: 41 buyers, 31 of them public (76 %), 6 featured. 30 closed deals.
- `logos/*.svg`: 41 monogram wordmarks, each with a `<title>`. Buyer websites use the reserved `.example` domain.
- `pipedrive.json`, `asiakastieto.json`, `linkedin.json`, `text-sequence.json` (100 rows, 45 opened, 8 meetings booked).
- `sites/{slug}/index.html` plus an about page for 8 sites. No external requests. Each has a skip link and a fixed cookie banner (`#cookie-banner`, accept button `#cookie-accept`). The consent cookie applies to that one site only.

**Scripts** (`/Users/veikka/prompt-marketing-hackathon-monorepo/scripts/`)
- `pipedrive-api.ts`: shared client, `.env` loading and the Video field writer.
- `pipedrive-setup.ts`, `pipedrive-seed.ts`.

### Demo data (Pipedrive seed IDs)

| Deal | Organization | Country | NACE | Site | Financials | Case it shows |
|---|---|---|---|---|---|---|
| 4001 | Kivirannan Konepaja Oy | FI | 25.62 | fi, `/meista/` | 7 450 000 / 980 000 | Normal case, figures on slide 4 |
| 4002 | Skärgårds Logistik Ab | FI | 49.41 | sv-FI with a Finnish section, `/om-oss/` | none | Asks for figures in the form. LinkedIn `[sv, en]`, so the language rule gives sv |
| 4003 | Lakeuden Puutuote Oy | FI | 16.23 | no website | 5 260 000 / 720 000 | Scrape fails, analyst writes the lines |
| 4004 | Wästerby Rör & Ventilation AB | SE | 43.22 | sv, `/om-oss/` | | |
| 4005 | Fjordkyst Sjømat AS | NO | 10.20 | nb, `/om-oss/` | | |
| 4006 | Hvidsten Møbelsnedkeri ApS | DK | 31.09 | da, `/om-os/`, 105 words | | Too few words |
| 4007 | Brenner Hydraulik GmbH | DE | 28.12 | de, `/ueber-uns/` | | 4 closed deals in sector, calculator shows a range |
| 4008 | Moosbrugger Backwaren GmbH | AT | 10.71 | de-AT, `/ueber-uns/` | | 2 closed deals in sector, calculator shows "range after the meeting" |
| 4009 | Aaretal Präzisionstechnik AG | CH | 25.62 | de-CH, `/ueber-uns/` | | 5 closed deals in sector, calculator shows a range |

- **Analysts:** 1001 Linnea Aaltonen (FI, SE), 1002 Jonas Weber (DACH), 1003 Sofie Lund (NO, DK). Emails are `@mergero.com`.
- **Site sizes:** the 7 normal sites have 327 to 361 words, and each home page alone has 210 to 226 words.
- **Buyers:** each demo company matches 3 or more public buyers and at least 1 closed deal in its sector.

### Public exports
- **`tools.ts`**
  - Input and output schemas (zod): `searchBuyersInput`, `searchBuyersOutput`, `listClosedDealsInput`, `listClosedDealsOutput`, `submitFormInput`, `submitFormOutput`.
  - `RECENT_DEALS_LIMIT = 10`
  - `nace2(value: string): string | null`
  - `searchBuyers(seed, { nace?, country? }, logoBaseUrl): BuyerResult[]`
  - `listClosedDeals(seed, { nace? }): ClosedDealResult[]`
  - `newReceiptId(): string`: `MGX-` plus 10 base32 characters.
  - `buildMcpServer({ seed, logoBaseUrl, submissionsFile }): McpServer`
- **`seed.ts`:** `mgxSeedSchema`, `loadMgxSeed(file): Promise<MgxSeed>`, and the types `MgxSeed`, `SeedBuyer`, `SeedClosedDeal`.
- **`server.ts`:** `createMgxServer({ seed, seedDir, storageDir, publicUrl }): http.Server`
- **`static-files.ts`:** `serveStatic(req, res, url, mount)`, `sendText(res, status, text, headers?)`
- **`scripts/pipedrive-api.ts`:** `loadScriptEnv(): Promise<Env>`, `createPipedriveApi(token, baseUrl)`, `baseUrlFor(domain)`, `required(value, name)`, `writeVideoFields(api, config, adminBaseUrl)`

### Tool behavior
- **`search_buyers`:** with no NACE code, or a blank one, it returns the featured buyers. The country filter always applies and ignores case. A NACE code that is not blank and has no two-digit prefix returns `[]`. Results keep seed order and include buyers with `name_public: false`.
- **`list_closed_deals`:** with a NACE code, it returns all deals with the same two-digit code, newest first. Without one, it returns the newest 10 deals of all sectors.
- **`submit_form`:** appends `{receiptId, dealId, values, receivedAt}` as one line to `{STORAGE_DIR}/data/mgx-submissions.jsonl`. If the write fails, the tool returns an error (`isError`).
- **HTTP details:**
  - `/mcp` uses `enableJsonResponse: true`, so responses are plain JSON, not a stream.
  - `/mcp` returns 403 when a request has an Origin header that is not local and does not match `MGX_PUBLIC_URL`.
  - Static files get `ACAO *` and `nosniff`. A folder without a trailing slash gets a 301 redirect. Every blocked or unknown path gets a 404.

### Deviations and conflicts
1. **LinkedIn key conflict in `architecture.md`:** the repository layout and "Decisions on gaps" #1 say `linkedin.json` is keyed on the Pipedrive person ID. The "Seed files" section, the task and `LinkedInSource.get({ email })` say lower-case email. I used email. `architecture.md` needs a fix.
2. **Danish about path:** I used `/om-os/`, which is not in the PRD path word list (about, meista, yritys, ueber-uns, om-oss). The scraper must accept `om-os`.
3. **Which company has fewer than 3 deals:** the calculator shows only for DACH. So the company with fewer than 3 closed deals had to be a DACH one. I picked AT (2 deals); DE and CH have 3 or more.
4. **New environment variables:** `MGX_PORT` and `MGX_PUBLIC_URL` are not in the environment table in `architecture.md`. Also, the seed websites are hardcoded to `http://localhost:3100`, so they break if the port changes.
5. **Wire name:** the tool output uses `name_public` (as in `api.md`). The shared type `MgxBuyer` uses `namePublic`, so the server's MGX client must map it. `logoUrl` is an absolute URL.
6. **Pipedrive field types:** the text fields are `varchar` (Pipedrive's "Text" type: 255 characters, links are clickable). The number fields are `double`.
7. **Person role:** the setup uses the built-in `job_title` only when `personFields` lists it (it exists only with Contact Sync). Otherwise it creates a "Role" text field.
8. **Organization country:** the seed script writes the country as `address: { value, country }` with the English country name. If the real Pipedrive client reads the country from the address, it must map that name to an ISO code.
9. **Stage for new deals:** the seed script puts new deals in the first stage of the pipeline that is not one of the four tool stages. If no such stage exists, it stops with a clear error.
10. **Script settings:** the scripts load `.env` themselves without overwriting variables already set. They import `apps/server/src/env.ts` so that the `ADMIN_BASE_URL` default is defined in one place only. `PIPEDRIVE_COMPANY_DOMAIN` can also be a full `http(s)://` URL; I used this for the mock test.
11. **Contract edits:** none.

### Verification
- **Checks:** `pnpm --filter @mergero/mgx-mock typecheck` passes. `pnpm --filter @mergero/server typecheck` passes; its tsconfig includes `scripts/`. `pnpm exec eslint apps/mgx-mock scripts` is clean.
- **Tests:** `pnpm vitest run --project mgx-mock` gives 3 files and 66 tests, all passing:
  - the three tools over a real MCP client connection
  - static routes and 13 path traversal attempts
  - seed consistency: check digits, deal references, NACE deal counts, word counts, `<!DOCTYPE html>`, no en or em dashes
- **Headless Chrome (puppeteer-core):** all 8 sites render with zero external requests, and `#cookie-accept` removes the banner. I looked at the screenshots and the logo sheet.
- **Scripts against the local Pipedrive mock:**
  - Setup, first run: created 10 fields and 4 stages, wrote the config, set the Video field on the existing deals, and retried once after a 429.
  - Setup, second run: created nothing and changed no deals.
  - Seed before setup: stops with a clear message.
  - Seed, first run: created 9 organizations, 9 persons and 9 deals, mapped owners by email with the token user as fallback, and wrote the Video field.
  - Seed, second run: everything already exists, nothing created.
  - A bad token or a missing token makes the script exit with code 1.
- **Shutdown:** SIGINT and SIGTERM give exit code 0 in under 10 ms.

### Open issues
- Nothing is tested against a live Pipedrive account yet: the permission to create fields, the `job_title` detection, and writing `website` and `address` when an organization is created.
- The hosted Firecrawl service cannot reach the `localhost:3100` demo sites. The demo needs the local scraper or a tunnel.
- Test output includes the JSON log lines of the tool calls.
