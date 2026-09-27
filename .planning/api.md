# HTTP routes

All DTO types are in `packages/shared/src/api-types.ts`. The admin API takes JSON and returns JSON. An error returns `ApiError` with a 4xx or 5xx status. The demo has no sign-in. The admin panel sends the current analyst as the query parameter `analyst` where a route needs it.

## Admin API

Request guard for each `/api/*` request:
- The host name must be `localhost` (or a subdomain of it), an IP address, or the host of `ADMIN_BASE_URL`. This check stops DNS rebinding. Other host names get 403.
- A request that is not GET or HEAD must have the header `X-Mergero-Admin: 1` (`ADMIN_REQUEST_HEADER` in `api-types.ts`). When the browser sends `Sec-Fetch-Site`, its value must be `same-origin`. Else, when the browser sends `Origin`, it must be the origin of the request. Other requests get 403. The admin client sends the header on each request. The API sends no CORS headers, so no other site can send the header.
- The `/v/*` routes do not have this guard.

| Method and path | Body or query | Response |
|---|---|---|
| `GET /api/status` | | `ProviderStatus` |
| `GET /api/analysts` | | `AnalystDto[]` |
| `PATCH /api/analysts/:id` | `AnalystPatch` | `AnalystDto` |
| `POST /api/analysts/:id/intros/:lang` | multipart: `file` (video), `transcript` (text, required, for the captions) | `AnalystDto` (a first intro gets the status `processing`; over a ready intro, the upload is in `pending` until it is ready), 400 without a transcript |
| `POST /api/analysts/:id/voice` | multipart: `file` (audio) | `AnalystDto` |
| `POST /api/analysts/:id/consent` | multipart: `file` (PDF), `date` (YYYY-MM-DD) | `AnalystDto` |
| `GET /api/analysts/:id/files/:file` | | intro MP4 (range requests), voice sample, consent PDF |
| `GET /api/inbox` | `analyst` | `InboxDto` |
| `GET /api/deals` | `analyst`, `country`, `status`, `q` (all optional) | `DealRowDto[]` |
| `POST /api/deals/:id/ensure` | | `EnsureDealDto`. For an existing deal that is not published, the call reads Pipedrive again (`refreshed`), also the deal owner: a new owner becomes the analyst of the deal. A failed read, or a new owner that is not a Pipedrive user, keeps the data and gives `refreshError`. |
| `GET /api/deals/:id` | | `DealDetailDto`. `analyst.timeZone` is the IANA time zone of the deal analyst. `pendingVersion` is a newer version of a published video that waits for the analyst (rendered and not approved, or blocked by a review reason), else null. |
| `GET /api/deals/:id/review` | | `ReviewDto`. `expired` is true when the link has expired. |
| `PATCH /api/deals/:id/review` | `ReviewPatch` | `ReviewDto` |
| `POST /api/deals/:id/approve` | | `ReviewDto`, or 409 with `ApiError.detail = ReviewReason[]` |
| `POST /api/deals/:id/remake` | | `ReviewDto`. Makes the video of an unpublished deal again from the current Pipedrive data (review reason `remake_needed`): a new scrape, then a new version with Asiakastieto, MGX and new scripts. 409 when the link is published, the deal is lost or expired, no version exists, or a remake runs. During a remake, the approval and each script, lines or buyer edit give 409. |
| `POST /api/deals/:id/expiry` | `{ days: number }` (1 to 365) | `DealDetailDto` |
| `GET /api/deals/:id/files/:file` | `download=1` optional | any file of the deal folder (range requests) |
| `GET /api/deals/:id/captions.v:n.vtt` | | WebVTT of rendered version n: the scripts, the slide times of that version, and the intro transcript in the face-cam variables (the analyst transcript when the version has none). 404 before the render. |
| `POST /api/deals/:id/brief/read` | | 204, writes a `brief_read` deal event (not twice for one brief version in 10 minutes) |
| `GET /api/sessions/:id/events` | | `SessionEventsDto` |
| `POST /api/tasks/:id/done` | | 204 |
| `POST /api/jobs/:id/retry` | | 204, 409 for a job that did not fail or a pipeline job of an expired deal. A retried voice clone gets the clone status `pending` again. |
| `GET /api/alerts` | `analyst` | `AlertDto[]` (newest 50 of the last 14 days) |
| `POST /api/alerts/seen` | `{ analyst: number }` | 204 |
| `GET /api/metrics` | `from`, `to` (YYYY-MM-DD), `tz` (IANA time zone of the days, default `UTC`) | `MetricsDto` |
| `GET /api/templates` | | `TemplatePreviewDto[]` |
| `GET /api/templates/:file` | | template preview JPEG |

## Video page

| Method and path | Response |
|---|---|
| `GET /v/:code` | HTML with Open Graph tags, `noindex`, `X-Frame-Options: DENY`, bootstrap `VideoPageData`; 404 or 410 page |
| `GET /v/:code/og-image.jpg` | JPEG 1200 x 630 |
| `GET /v/:code/media/:file` | MP4 or JPEG of the published version, range requests |
| `GET /v/:code/captions.v:n.vtt` | WebVTT |
| `GET /v/:code/slots` | `SlotDto[]` |
| `POST /v/:code/book` | `BookBody` gives `BookResult`. 409 "This time is not free" when the slot is taken. 409 "A meeting is already booked" with `detail: BookConflictDetail` (`meetingAt`) when the deal has a meeting |
| `POST /v/:code/form` | `FormSubmitBody` gives `FormSubmitResult`, 409 when the form was already sent or another send of the same link is in progress (checked before the MGX call, so MGX gets one form per link), 502 when MGX fails |
| `POST /v/:code/events` | `EventBatch` gives 204 |

## Mock services

| Method and path | Response |
|---|---|
| `GET /mock/asiakastieto/:businessId` | `{ businessId, revenue, profit, fiscalYear }` or 404 |
| MCP `search_buyers` | input `{ nace?: string, country?: string }`, output `{ buyers: [{ id, name, logoUrl, website, focus, name_public }] }` |
| MCP `list_closed_deals` | input `{ nace?: string }`, output `{ deals: [{ id, year, country, nace, text, profitMultiple }] }` |
| MCP `submit_form` | input `{ dealId: number, values: object }`, output `{ receiptId: string }` |

`nace` is optional in the mock: an empty value returns the featured buyers (slide 2) or the recent deals of all sectors (slide 2). A NACE code matches on the two-digit prefix.
