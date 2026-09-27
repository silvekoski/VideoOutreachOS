PIPEDRIVE REST API (API TOKEN) RESEARCH REPORT, 2026-09-26

Tags: VERIFIED-doc = I read it in the official docs, the OpenAPI spec or the changelog. VERIFIED-run = I ran it. UNVERIFIED = not confirmed.
Limit: I had no real Pipedrive token, and I did not use the user's connected Pipedrive account. So nothing here was tested against the live API with a valid token (UNVERIFIED). I checked request shapes against a local mock server and the official SDK.

Sources (all fetched 2026-09-26):
- v1 OpenAPI: https://developers.pipedrive.com/docs/api/v1/openapi.yaml (servers: https://api.pipedrive.com/v1)
- v2 OpenAPI: https://developers.pipedrive.com/docs/api/v1/openapi-v2.yaml (servers: https://api.pipedrive.com/api/v2)
- Docs as markdown: https://pipedrive.readme.io/docs/<slug>.md (index: https://pipedrive.readme.io/llms.txt)
- Migration guide: https://pipedrive.readme.io/docs/pipedrive-api-v2-migration-guide (updatedAt 2026-04-30)
- Changelog: https://developers.pipedrive.com/changelog
- Official SDK: npm "pipedrive" 33.7.0 (published 2026-09-08)

======================================================================
0. RECOMMENDATION PER CALL (2026)
======================================================================
Rule: use v2 wherever a v2 endpoint exists. Use v1 only where no v2 endpoint exists.

Call                          | Use | Endpoint                                   | Token cost
get deal                      | v2  | GET  /api/v2/deals/{id}                    | 1
list deals (cursor)           | v2  | GET  /api/v2/deals                         | 10
update deal                   | v2  | PATCH /api/v2/deals/{id}                   | 5
create deal                   | v2  | POST /api/v2/deals                         | 5
get person                    | v2  | GET  /api/v2/persons/{id}                  | 1
create person                 | v2  | POST /api/v2/persons                       | 5
get organization              | v2  | GET  /api/v2/organizations/{id}            | 1
create organization           | v2  | POST /api/v2/organizations                 | 5
list pipelines                | v2  | GET  /api/v2/pipelines                     | 5
create pipeline               | v2  | POST /api/v2/pipelines                     | 5
list stages                   | v2  | GET  /api/v2/stages?pipeline_id=           | 5
create stage                  | v2  | POST /api/v2/stages                        | 5
create activity               | v2  | POST /api/v2/activities                    | 5
mark activity done            | v2  | PATCH /api/v2/activities/{id}              | 5
create deal custom field      | v2  | POST /api/v2/dealFields                    | 5
create org custom field       | v2  | POST /api/v2/organizationFields            | 5
list deal fields              | v2  | GET  /api/v2/dealFields                    | 10
list users                    | v1  | GET  /api/v1/users   (no v2 exists)        | 20
current user / company_domain | v1  | GET  /api/v1/users/me (no v2 exists)       | 2
list activity types           | v1  | GET  /api/v1/activityTypes (no v2 exists)  | 20
create note                   | v1  | POST /api/v1/notes   (no v2 exists)        | 10
update note                   | v1  | PUT  /api/v1/notes/{id} (no v2 exists)     | 10
Costs: VERIFIED-doc (x-token-cost in the OpenAPI specs).

v1 deprecation status: VERIFIED-doc.
- 2025-04-14: changelog "Deprecation of selected API v1 endpoints", effective 2026-01-01. Quote: "Deprecated endpoints will remain accessible until December 31, 2025."
- 2026-07-29: changelog "Reminder: Deprecated API v1 endpoints are now out of support", effective 2026-08-01. The endpoints "may remain functional", but Pipedrive gives no support, no fixes and no SLA for them. They "may be changed or removed without further notice".
- The deprecated list (v1 to v2):
  - Deals: GET/POST/PUT/DELETE on /v1/deals and /v1/deals/{id}, plus /v1/deals/collection, /v1/deals/search, /v1/deals/{id}/activities, /v1/deals/{id}/persons, /v1/deals/{id}/products.
  - The same set for /v1/persons, /v1/organizations, /v1/activities and /v1/products.
  - /v1/pipelines and /v1/stages (all CRUD).
  - /v1/persons/{id}/deals and /v1/organizations/{id}/deals|persons|activities.
  - /v1/itemSearch and /v1/itemSearch/field.
- The current v1 OpenAPI file no longer contains these v1 paths. It still has /notes, /users, /activityTypes, /dealFields and /organizationFields, which are not deprecated. VERIFIED-doc.
- The v1 field endpoints (POST /v1/dealFields etc.) are not on the deprecation list. But the v2 Fields API exists since 2025-12-10 and costs half as much. VERIFIED-doc.

======================================================================
1. AUTH AND BASE URL
======================================================================
- Header: x-api-token: <token>. The auth doc (updatedAt 2026-01-05) says: "The API token must be provided in the `x-api-token` header for all requests". VERIFIED-doc.
- Both OpenAPI specs define only one API-key scheme: {type: apiKey, name: x-api-token, in: header}. There is no query scheme. VERIFIED-doc.
- The official SDK 33.7.0 sends the token in the x-api-token header (setApiKeyToObject(headers, "x-api-token", ...)). VERIFIED-run (the mock server saw the header).
- Query param ?api_token=...: this is the old v1 method, and the official docs no longer document it. Whether v1 or v2 still accept it in 2026 is UNVERIFIED: an invalid token gets the same gateway 401 either way. A third-party guide says v2 does not accept it (UNVERIFIED). Recommendation: use the header only. It also keeps the token out of URLs and logs.
- Base URL: https://{companydomain}.pipedrive.com/api/v2/... and https://{companydomain}.pipedrive.com/api/v1/... The docs say: "We advise everyone to use {COMPANYDOMAIN}.pipedrive.com for faster requests as it helps us to better determine which data center your request should go to." VERIFIED-doc.
- https://api.pipedrive.com/api/v2 and https://api.pipedrive.com/v1 are the spec and SDK defaults. VERIFIED-doc. VERIFIED-run: the SDK default basePath printed "https://api.pipedrive.com/api/v2" and "https://api.pipedrive.com/v1".
- v2 accepts only the /api/v2/ prefix. For v1, the docs say "Previously both /api/v1/... and /v1/... could be used". VERIFIED-doc.
- To find company_domain, call GET /api/v1/users/me and read data.company_domain (example "pipedrive-12g53f"). VERIFIED-doc.
- Token scope:
  - There is one token per user per company, and only one token is active at a time. If the token changes, every integration that uses the old one stops working.
  - Admins can turn API access off per permission set ("use API").
  VERIFIED-doc.
- v2 accepts JSON bodies only. v1 POST also accepts form-encoded bodies. Send Content-Type: application/json. VERIFIED-doc.
- 401 response from the live API with an invalid token (2026-09-26): VERIFIED-run
  HTTP/2 401, header x-401-by-gw: true, x-correlation-id: <uuid>
  {"success":false,"error":"unauthorized access","errorCode":401,"error_info":"Please check developers.pipedrive.com"}
  The result is the same on api.pipedrive.com and on a random {x}.pipedrive.com host.

Response envelope (VERIFIED-doc):
  {"success": true, "data": <object|array|null>, "additional_data": {...}}
  Error: {"success": false, "error": "...", "error_info": "...", "data": null, "additional_data": null}
  A 403 caused by an account limit also has a "code", for example "feature_capping_deals_limit".
Status codes (VERIFIED-doc): 400, 401 invalid token, 402 account not open, 403 forbidden or entity limit, 404, 405, 410, 415 feature not enabled, 422, 429 rate limit, 500, 501, 503.
Since 2026-05-21 (changelog), custom field validation errors on v2 deal, person and org create/update include the field_code. VERIFIED-doc. The exact error JSON is UNVERIFIED.

v2 general rules (VERIFIED-doc, migration guide):
- Timestamps are RFC 3339 ("2024-01-01T00:00:00Z"). v1 used "YYYY-MM-DD HH:MM:SS" in UTC.
- Booleans are strictly true/false (no 1/0). Numeric fields do not convert strings, so send numbers.
- Related objects are removed. person_id, org_id and owner_id are plain integers.
- Field selectors (/deals:(id,title)) are removed in v2.
- PUT became PATCH. PATCH cannot delete; use DELETE.
- Sorting uses sort_by + sort_direction (asc|desc), with one field only.
- visible_to is an integer (1, 3, 5, 7). label is replaced by label_ids: number[].
- is_deleted replaces active_flag and deleted. Soft-deleted items are purged after 30 days.

======================================================================
2. CUSTOM FIELDS: v2 custom_fields OBJECT vs v1 TOP-LEVEL HASH KEYS
======================================================================
VERIFIED-doc (migration guide + v2 spec). Keys are 40-character hashes, and each account has different keys.

v1 (flat, with subfields as suffixed keys):
  "d4de...90a6": 2300,
  "d4de...90a6_currency": "EUR"
v2 (nested under custom_fields, with subfields inside an object):
  "custom_fields": {"d4de...90a6": {"value": 2300, "currency": "EUR"}}

v2 value shape per type (the same for read and write):
- varchar / varchar_auto / text: "my text value"
- double: 500
- monetary: {"value": 500, "currency": "USD"}
- enum: 123 (option id as a number; v1 was "123")
- set: [123, 456] (v1 was "123,456"). To clear it, send null. Sending [] is a validation error.
- user / org / people: 1234
- date: "2024-01-01"
- daterange: {"value": "2024-01-01", "until": "2024-02-01"}
- time: {"value": "09:00:00", "timezone_name": "Europe/London"} (timezone_id is also accepted, but support may be removed later)
- timerange: {"value": "09:00:00", "until": "11:00:00", "timezone_name": "Europe/London"}
- address: {"value": "530 Fifth Avenue, New York, NY, USA", "route": ..., "street_number": ..., "subpremise": ..., "locality": ..., "sublocality": ..., "admin_area_level_1": ..., "admin_area_level_2": ..., "country": ..., "postal_code": ..., "formatted_address": ...}. Only value is required on write. Subfields you leave out become null on POST and PATCH.
- To clear any field, set it to null.

Read options on GET /api/v2/{deals|persons|organizations}[/{id}] (VERIFIED-doc):
- custom_fields=key1,key2: return only these custom fields. Maximum 15 keys.
- include_option_labels=true: enum and set values come back as {id, label} instead of an id (added 2026-05-21).
- include_labels=true: adds labels [{id, label}] next to label_ids (added 2026-05-21).
- include_fields=...: optional fields, for example notes_count, activities_count, next_activity_id, last_activity_id, smart_bcc_email.
Whether custom fields with null values appear in custom_fields is UNVERIFIED. The spec example shows "custom_fields": {}.

Doc inconsistency: the readme "Custom fields" page has a PHP example that sends a hash key at the top level to /api/v2/deals. The migration guide and the v2 OpenAPI body both use the custom_fields object, so follow the spec. What v2 does with a top-level hash key (ignore it or reject it) is UNVERIFIED.

======================================================================
3. GET A DEAL
======================================================================
GET https://{co}.pipedrive.com/api/v2/deals/{id}?custom_fields=<k1>,<k2>&include_fields=notes_count
Headers: x-api-token
Response 200 (spec example, VERIFIED-doc):
{"success":true,"data":{
 "id":1,"title":"Deal Title","creator_user_id":1,"owner_id":1,"value":200,
 "person_id":1,"org_id":1,"stage_id":1,"pipeline_id":1,"currency":"USD",
 "archive_time":"2021-01-01T00:00:00Z","add_time":"2021-01-01T00:00:00Z",
 "update_time":"2021-01-01T00:00:00Z","stage_change_time":"2021-01-01T00:00:00Z",
 "status":"open","is_archived":false,"is_deleted":false,"probability":90,
 "lost_reason":"Lost Reason","visible_to":7,"close_time":"...","won_time":"...","lost_time":"...",
 "local_won_date":"2021-01-01","local_lost_date":"2021-01-01","local_close_date":"2021-01-01",
 "expected_close_date":"2021-01-01","label_ids":[1,2,3],"origin":"ManuallyCreated","origin_id":null,
 "channel":52,"channel_id":"Jun23 Billboards","source_lead_id":"35b0d604-...",
 "acv":120,"arr":120,"mrr":10,"custom_fields":{}}}
Changes from v1 (VERIFIED-doc):
- user_id is renamed owner_id.
- person_name, org_name, owner_name, formatted_value, weighted_value and next_activity_* are removed.
- person_id, org_id and user_id are no longer objects.
So reading the full context of a deal takes 3 calls: deal (1) + person (1) + org (1) = 3 tokens.

======================================================================
4. GET A PERSON
======================================================================
GET /api/v2/persons/{id} (1 token). VERIFIED-doc.
- To get many at once: GET /api/v2/persons?ids=1,2,3 (up to 100 ids, 10 tokens).
- Filters: org_id, deal_id (added 2025-11-24), owner_id.
Response data (spec example, VERIFIED-doc):
{"id":1,"name":"Person Name","first_name":"Person","last_name":"Name","owner_id":1,"org_id":1,
 "add_time":"2021-01-01T00:00:00Z","update_time":"2021-01-01T00:00:00Z",
 "emails":[{"value":"email1@email.com","primary":true,"label":"work"},{"value":"email2@email.com","primary":false,"label":"home"}],
 "phones":[{"value":"12345","primary":true,"label":"work"},{"value":"54321","primary":false,"label":"home"}],
 "is_deleted":false,"visible_to":7,"label_ids":[1,2,3],"picture_id":1,"custom_fields":{},
 "notes":"...","im":[...],"birthday":"2000-12-31","job_title":"Manager","postal_address":{...}}
- In v1 the names were email and phone (arrays with the same {value, primary, label} items). VERIFIED-doc.
- notes, im, birthday, job_title and postal_address exist only if the company has Contact Sync. VERIFIED-doc.
- Doc inconsistency: the migration guide says "ims" but the v2 spec says "im". Trust the spec.
- The org link is data.org_id (an integer). Get the org with a second call.

======================================================================
5. GET AN ORGANIZATION
======================================================================
GET /api/v2/organizations/{id} (1 token). VERIFIED-doc.
Response data (spec example):
{"id":1,"name":"Organization Name","owner_id":1,"add_time":"...","update_time":"...",
 "address":{"value":"123 Main St","country":"USA","admin_area_level_1":"CA","admin_area_level_2":"Santa Clara",
            "locality":"Sunnyvale","sublocality":"Downtown","route":"Main St","street_number":"123",
            "subpremise":"123A","postal_code":"94085"},
 "is_deleted":false,"visible_to":7,"label_ids":[1,2,3],
 "website":"https://www.company.com","linkedin":"https://linkedin.com/company",
 "industry":2,"annual_revenue":0,"employee_count":10,"custom_fields":{}}
- v1 had address plus flat keys such as address_route and address_locality. v2 puts them in one object, and formatted_address is also a subfield (migration guide example). VERIFIED-doc.
- In v2, website, linkedin, industry, annual_revenue and employee_count are built-in fields, and the spec lists them as writable in POST/PATCH. The 2026-05-21 changelog says they appear "when the relevant features are enabled on the account". Whether every plan has them is UNVERIFIED. The Fields API v2 is_writable flag tells you if you can write a field.
- The spec example shows a stray "org_id":1 in the org object. Ignore it.

======================================================================
6. LIST USERS (v1 ONLY)
======================================================================
VERIFIED-doc:
- GET /api/v1/users (20 tokens). The spec has no pagination params.
- GET /api/v1/users/me (2 tokens) and GET /api/v1/users/{id} (2 tokens).
- The only users endpoint in the v2 spec is GET /api/v2/users/{id}/followers.
Response item (spec example):
{"id":1,"name":"John Doe","default_currency":"EUR","locale":"et_EE","lang":1,"email":"john@pipedrive.com",
 "phone":"0000-0001","activated":true,"last_login":"2019-11-21 08:45:56","created":"2018-11-13 09:16:26",
 "modified":"2019-11-21 08:45:56","has_created_company":true,
 "access":[{"app":"sales","admin":true,"permission_set_id":"62cc..."}],
 "active_flag":true,"timezone_name":"Europe/Berlin","timezone_offset":"+03:00","role_id":1,
 "icon_url":"https://...","is_you":true,"is_deleted":false}
/users/me also returns company_id, company_name, company_domain, company_country, company_industry and language {language_code, country_code}.

======================================================================
7. PIPELINES AND STAGES (v2)
======================================================================
GET /api/v2/pipelines?limit=500&cursor= (5 tokens). VERIFIED-doc.
 Item: {"id":1,"name":"Pipeline Name","order_nr":1,"is_deleted":false,"is_deal_probability_enabled":true,"add_time":"...","update_time":"..."}
 Changes from v1: active became is_deleted (negated), deal_probability became is_deal_probability_enabled, selected became is_selected, and url_title is removed.
GET /api/v2/stages?pipeline_id=1&sort_by=order_nr&sort_direction=asc&limit=500 (5 tokens). sort_by values: id, update_time, add_time, order_nr. VERIFIED-doc.
 Item: {"id":1,"order_nr":1,"name":"Stage Name","is_deleted":false,"deal_probability":100,"pipeline_id":1,
        "is_deal_rot_enabled":true,"days_to_rotten":2,"add_time":"...","update_time":"..."}
 Changes from v1: active_flag became is_deleted, rotten_flag became is_deal_rot_enabled, rotten_days became days_to_rotten, and pipeline_name is removed.
POST /api/v2/pipelines body: {"name": string (required), "is_deal_probability_enabled": boolean (default false)}. order_nr is read-only, and a new pipeline goes to the end of the list. VERIFIED-doc.
POST /api/v2/stages body: {"name": string (required), "pipeline_id": integer (required), "deal_probability": integer, "is_deal_rot_enabled": boolean, "days_to_rotten": integer|null}. VERIFIED-doc.
 Response: {"success":true,"data":{<stage object>}}.
- Neither POST nor PATCH /stages accepts order_nr, so create stages in the order you want. That new stages go to the end is UNVERIFIED.
- Whether POST /pipelines creates default stages automatically is UNVERIFIED. List the stages after you create a pipeline.
- Managing pipelines and stages needs admin rights: the OAuth scope "admin" covers "create, read, update and delete pipelines and its stages". The exact permission an API-token user needs is UNVERIFIED.

======================================================================
8. LIST DEALS WITH CURSOR PAGINATION (v2)
======================================================================
GET /api/v2/deals?limit=500&cursor=<opaque> (10 tokens per page). VERIFIED-doc.
Query params:
- Filters: filter_id, ids (up to 100), owner_id, person_id, org_id, pipeline_id, stage_id, status (open, won, lost, deleted; comma list), updated_since / updated_until (RFC 3339). filter_id overrides the other filters.
- Sorting: sort_by (id|update_time|add_time), sort_direction.
- Extra data: include_fields, custom_fields (max 15), include_option_labels, include_labels.
- Paging: limit (default 100, max 500), cursor.
Response: {"success":true,"data":[<deal>...],"additional_data":{"next_cursor":"eyJmaWVsZCI6ImlkIi..."}}
next_cursor is null on the last page. VERIFIED-doc.
- GET /api/v2/deals returns only deals that are not archived. For archived deals use GET /api/v2/deals/archived (20 tokens). VERIFIED-doc.
- status=deleted returns deals deleted in the last 30 days. VERIFIED-doc.
- v1 used offset pagination (start, limit, additional_data.pagination.more_items_in_collection, next_start). VERIFIED-doc.
The pagination loop is VERIFIED-run against a mock (see section 15).

======================================================================
9. CREATE CUSTOM FIELDS (DEALS, ORGANIZATIONS)
======================================================================
v2 (recommended, 5 tokens): POST /api/v2/dealFields and POST /api/v2/organizationFields. /personFields and /productFields also exist. VERIFIED-doc.
Body:
{"field_name": "Video URL",            (required)
 "field_type": "varchar",              (required)
 "options": [{"label": "Sent"}],       (required for enum and set only)
 "description": "Personalized video link",   (in the dealFields body only; the organizationFields body in the spec has no description)
 "ui_visibility": {"add_visible_flag": false, "details_visible_flag": true,
                   "show_in_pipelines": {"show_in_all": true, "pipeline_ids": []}},
 "important_fields": {"enabled": false, "stage_ids": []},
 "required_fields": {"enabled": false, "stage_ids": [], "statuses": {}}}
field_type values for create (v2, 16 values), VERIFIED-doc:
- Text: varchar (up to 255 chars), varchar_auto (autocomplete, up to 255 chars), text (long text, up to 65k chars).
- Numbers: double, monetary.
- Options: enum (one choice), set (many choices).
- Links to records: user, org, people.
- Other: phone, date, daterange, time, timerange, address.
The v1 create list adds "visible_to", for 17 values. VERIFIED-doc.
Is there a URL type? No. Neither v1 nor v2 has a "url" or "link" field_type. VERIFIED-doc.
How the UI shows a URL in a text field: the Pipedrive Knowledge Base says "Text fields can be used for URLs, and clicking a URL in a text field will redirect you to that webpage". It lists Text as for "Notes, URLs or other text". Source: https://support.pipedrive.com/en/article/what-types-of-custom-fields-are-there. VERIFIED-doc (KB). I did not see this in a live UI. Whether a "text" (large text) field also makes links clickable is UNVERIFIED.
Gotcha: a varchar field holds at most 255 characters, and a long presigned or signed video URL can be longer. Store a short URL (for example https://<your-host>/v/<id>) in a varchar field. If the link does not need to be clickable, use "text" (65k).

Response 200 (v2 spec example):
{"success":true,"data":{"field_name":"Priority","field_code":"946947d1b02fd3ef20798d6112ec5d895a686a21",
 "description":"...","field_type":"enum","options":[{"id":1,"label":"Low","color":"green"},...],
 "subfields":null,"is_custom_field":true,"is_optional_response_field":false,
 "ui_visibility":{...},"important_fields":{...},"required_fields":{...}}}
How to get the field key after creation:
- v2: data.field_code (40-character hash). VERIFIED-doc.
- v1 POST /api/v1/dealFields: data.key (and a numeric data.id). VERIFIED-doc.
- Later: call GET /api/v2/dealFields?limit=500 (cursor paginated), match field_name with is_custom_field=true, and read field_code. VERIFIED-doc.
- In the UI: Company settings > Data fields > entity > three-dot menu > "Copy API key". VERIFIED-doc.
- Keys are different in each company account, so do not hardcode them across accounts. Make setup idempotent: list the fields, match by name, create the field if it is missing, and store the key. VERIFIED-doc (keys differ per account).
v2 Fields API renames (VERIFIED-doc):
- key became field_code, name became field_name, edit_flag became is_custom_field, and the numeric id is removed.
- The path param is field_code: GET|PATCH|DELETE /api/v2/dealFields/{field_code}.
- Options can be changed in bulk: POST|PATCH|DELETE /api/v2/dealFields/{field_code}/options.
- Subfields are in subfields[] (monetary has value and currency).
Option ids for enum and set fields come back in options[].id (an integer for custom fields). VERIFIED-doc.
Permission: OAuth apps need the deal-fields:full or contact-fields:full scope, or admin. What an API-token user needs to manage fields is UNVERIFIED.

======================================================================
10. UPDATE A DEAL
======================================================================
v2: PATCH https://{co}.pipedrive.com/api/v2/deals/{id} (5 tokens). VERIFIED-doc.
Writable keys: title, owner_id, person_id, org_id, pipeline_id, stage_id, value, currency, is_deleted, is_archived, archive_time, status, probability, lost_reason, visible_to, close_time, won_time, lost_time, expected_close_date, label_ids, custom_fields.
Move stage:          {"stage_id": 7}
Mark lost:           {"status": "lost", "lost_reason": "No budget"}
Set custom field:    {"custom_fields": {"<40-char key>": "https://example.com/v/abc"}}
Combined:            {"stage_id": 7, "custom_fields": {"<key>": "https://example.com/v/abc"}}
Clear field:         {"custom_fields": {"<key>": null}}
Response 200: {"success":true,"data":{<full v2 deal object>}}
Rules (VERIFIED-doc):
- lost_reason "Can only be set if deal status is lost".
- lost_time can be set only if the deal is lost, won_time only if it is won, and close_time only if it is won or lost.
Other notes:
- status values are open, won and lost. The v2 body types status as a plain string. The values come from the list filter and the SDK type ('open'|'won'|'lost'|'deleted'). To delete a deal, use DELETE, not PATCH.
- There is no API for the list of predefined lost reasons; I searched both specs. VERIFIED-doc. If the company allows only predefined lost reasons, what happens to a free-text lost_reason is UNVERIFIED.
- If stage_id is in another pipeline, whether you must also send pipeline_id is UNVERIFIED. The safe choice is to send both.
- That a PATCH with custom_fields leaves the other custom fields unchanged is UNVERIFIED. PATCH semantics say so, but I did not test it live.
v1 equivalent (out of support since 2026-08-01, do not use): PUT /v1/deals/{id} with top-level keys {"stage_id":7,"status":"lost","lost_reason":"No budget","<40-char key>":"https://..."}.

======================================================================
11. ACTIVITIES (v2)
======================================================================
Create: POST https://{co}.pipedrive.com/api/v2/activities (5 tokens). VERIFIED-doc.
Body keys: subject, type, owner_id, deal_id, lead_id, org_id, project_id, due_date, due_time, duration, busy, done, location{value,...}, participants[{person_id, primary}], attendees[{email,name,status,is_organizer,person_id,user_id}], public_description, priority, outcome, note.
Example (request shape VERIFIED-run against a mock):
{"subject":"Follow up call","type":"call","deal_id":123,"owner_id":456,
 "due_date":"2026-09-28","due_time":"09:30","duration":"00:15",
 "note":"<p>Video sent</p>","participants":[{"person_id":789,"primary":true}]}
For a task, use the same body with "type":"task".
Response 200 (spec example): {"success":true,"data":{"id":1,"subject":"...","type":"...","owner_id":1,"creator_user_id":1,"is_deleted":false,"add_time":"...","update_time":"...","deal_id":5,"lead_id":"abc-def","person_id":6,"org_id":7,"project_id":8,"due_date":"2021-01-01","due_time":"15:00:00","duration":"01:00:00","busy":true,"done":true,"marked_as_done_time":"2021-01-01T00:00:00Z","location":{...},"participants":[{"person_id":1,"primary":true}],"attendees":[...],"conference_meeting_client":"google_meet","conference_meeting_url":"...","conference_meeting_id":"...","public_description":"...","priority":263,"outcome":101,"note":"Note"}}
Rules:
- The assignee is owner_id. v1 user_id was renamed owner_id, and assigned_to_user_id was removed. VERIFIED-doc.
- person_id is read-only in v2. To set the person, send participants [{"person_id": X, "primary": true}]. VERIFIED-doc. Doc inconsistency: one migration guide example shows "primary_flag" in the response, but the v2 spec uses "primary".
- type must be an activity type key_string. List the types with GET /api/v1/activityTypes (v1 only). Each item has a key_string, for example "call" or "deadline". VERIFIED-doc. That "task", "meeting", "email" and "lunch" exist in every account is UNVERIFIED, because accounts can edit their types.
- due_date is "YYYY-MM-DD". For due_time, the v1 docs say "The due time of the activity in UTC. Format: HH:MM", and the general docs say to send times in UTC. VERIFIED-doc. The v2 response shows "HH:MM:SS". Whether v2 accepts "HH:MM" input is UNVERIFIED (the migration guide example uses "00:00").
- duration is "HH:MM". VERIFIED-doc (v1 docs; the v2 examples show "01:20" and "01:00:00").
- The v2 spec marks no field as required for POST /activities. The migration guide says "Only the name field is required" for activities, but activities have no name field, so that line is a copy error. What the server actually requires is UNVERIFIED.
- Whether the activity note is HTML or plain text is UNVERIFIED.
Mark done: PATCH /api/v2/activities/{id} with {"done": true} (5 tokens). VERIFIED-doc (done is a boolean in the PATCH body). That the server then sets marked_as_done_time is UNVERIFIED.
List a deal's activities: GET /api/v2/activities?deal_id=123&done=false (10 tokens). VERIFIED-doc.

======================================================================
12. NOTES (v1 ONLY, NOT DEPRECATED)
======================================================================
Neither the v2 spec nor the v2 SDK has a notes endpoint. VERIFIED-doc.
Create: POST https://{co}.pipedrive.com/api/v1/notes (10 tokens)
Body: {"content": "<p>Video: <a href=\"https://example.com/v/abc\">watch</a></p>",  (required; HTML, "Subject to sanitization on the back-end")
       "deal_id": 123,              (one of deal_id/person_id/org_id/lead_id/project_id/task_id is required)
       "pinned_to_deal_flag": 1,    (the number 0 or 1 in v1, not a boolean)
       "user_id": 456,              (the author; "Only an admin can change the author")
       "add_time": "2026-09-26 10:00:00"}  (optional; UTC, "YYYY-MM-DD HH:MM:SS")
Response 200 (spec example): {"success":true,"data":{"id":1,"active_flag":true,"add_time":"2019-12-09 13:59:21","content":"abc","deal":{"title":"Deal title"},"lead_id":"...","deal_id":1,"last_update_user_id":1,"org_id":1,"organization":{"name":"..."},"person":{"name":"..."},"person_id":1,"project_id":1,"project":{"title":"..."},"pinned_to_lead_flag":false,"pinned_to_deal_flag":true,"pinned_to_organization_flag":false,"pinned_to_person_flag":false,"pinned_to_project_flag":false,"update_time":"2019-12-09 14:26:11","user":{"email":"...","icon_url":"...","is_you":true,"name":"User Name"},"user_id":1}}
Update: PUT https://{co}.pipedrive.com/api/v1/notes/{id} (10 tokens). VERIFIED-doc.
- Body keys: content, deal_id, person_id, org_id, lead_id, project_id, user_id, add_time, pinned_to_*_flag.
- Response: the same note object.
List: GET /api/v1/notes?deal_id=123&start=0&limit=100&sort=add_time DESC (offset pagination, 20 tokens). VERIFIED-doc.
Which HTML tags survive sanitization (for example <a href>) is UNVERIFIED.

======================================================================
13. SEED SCRIPT: CREATE ORGS, PERSONS, DEALS, PIPELINES, STAGES (v2)
======================================================================
All VERIFIED-doc (v2 spec). Each create costs 5 tokens.
POST /api/v2/organizations
 {"name":"Acme Oy","owner_id":456,"visible_to":3,
  "address":{"value":"Mannerheimintie 1, Helsinki, Finland"},
  "website":"https://acme.example","custom_fields":{"<org key>":"..."}}
 Required: name. In address, only value is required.
POST /api/v2/persons
 {"name":"Jane Doe","org_id":<org id>,"owner_id":456,
  "emails":[{"value":"jane@acme.example","primary":true,"label":"work"}],
  "phones":[{"value":"+358401234567","primary":true,"label":"mobile"}]}
 - Required: name.
 - In emails and phones items only value is required. label defaults to "work". If no item is primary, the first one becomes primary.
 - Do NOT send job_title, notes, im, birthday or postal_address unless Contact Sync is on, because the request "returns 403". VERIFIED-doc.
 - Doc inconsistency: the migration guide allows first_name + last_name instead of name, but the v2 spec body has no first_name or last_name. Send name.
POST /api/v2/pipelines {"name":"Video Outreach"}
POST /api/v2/stages {"name":"Video sent","pipeline_id":<id>,"deal_probability":20}
POST /api/v2/deals
 {"title":"Acme Oy video","value":5000,"currency":"EUR","person_id":<id>,"org_id":<id>,
  "pipeline_id":<id>,"stage_id":<id>,"owner_id":456,"expected_close_date":"2026-10-31",
  "custom_fields":{"<deal key>":"https://example.com/v/abc"}}
 Required: title.
Cleanup: DELETE /api/v2/{deals|persons|organizations|stages|pipelines}/{id} (3 tokens). This is a soft delete; items are purged after 30 days. VERIFIED-doc.
Throttle the seed script. The burst limit on Lite is 20 requests per 2 s per token (VERIFIED-doc), so stay under about 8 requests per second.

======================================================================
14. RATE LIMITS (2026)
======================================================================
Daily token budget (VERIFIED-doc, rate limiting doc + changelog):
- Timeline: new signups from 2024-12-02, rollout to existing customers from 2025-03-01, rollout complete on 2025-05-31.
- Budget per company per day = 30,000 x plan multiplier x seats (+ purchased top-ups). Multipliers: Lite 1, Growth 2, Premium 5, Ultimate 7.
- The budget is shared by all users and by all API-token and OAuth traffic of the company. Actions in the UI do not count.
- The budget resets at midnight in the server time zone, which "may not be aligned" with the customer time zone.
- When the budget is used up, every request gets 429 until the reset. Admins get emails at 75 % and 100 %.
- Generic v1 costs: get single 2, list 20, update 10, delete single 6, delete list 10, search 40. v2 costs about half (see section 0).
- Usage view: Company settings > API Usage Dashboard.
Burst limits (VERIFIED-doc), per token (per user), in a rolling 2 s window:
- API token: Lite 20, Growth 40, Premium 100, Ultimate 120 requests per 2 s.
- OAuth apps: Lite 80, Growth 160, Premium 400, Ultimate 480 requests per 2 s.
- Search API: 10 requests per 2 s on all plans.
Headers (VERIFIED-doc unless marked):
- x-ratelimit-limit: the maximum requests per 2 s window for this token.
- x-ratelimit-remaining: the requests left in the window.
- x-ratelimit-reset: "The remaining window before the rate limit resets." The unit (seconds) is UNVERIFIED.
- x-daily-requests-left: the POST/PUT requests left today (UTC day). Sent for API-token requests only.
- x-daily-ratelimit-token-limit and x-daily-ratelimit-token-remaining: not in the docs. On 2026-01-12 a Pipedrive staff member in the dev community said they can be "missing for a few requests in a short period of time after a long period of inactivity". Treat them as optional. VERIFIED-doc (community, staff reply).
- Retry-After: not in any official doc I read. UNVERIFIED.
- The 429 response body shape is UNVERIFIED.
Abuse block (VERIFIED-doc): API-token integrations that keep sending after a 429 get a 403 with a Cloudflare HTML page, not JSON. Handle a 403 that is not JSON.
The SDK has no 429 retry logic: dist/versions/v2/base.js has no x-ratelimit or 429 handling. VERIFIED-run (grep).
Strategy on 429:
- Wait for Retry-After if it is present. If not, use x-ratelimit-reset. If neither is present, use exponential backoff.
- Cap the retries, because a 429 from an exhausted daily budget does not clear until midnight server time. Never retry a 429 in an endless loop.

======================================================================
15. CODE I RAN (Node v26.3.0, native TS type stripping)
======================================================================
File: /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/pipedrive-api/pd-client.ts

  export type PdConfig = { apiToken: string; companyDomain?: string; baseUrl?: string; maxRetries?: number };
  export type PdEnvelope<T> = {
    success: boolean; data: T;
    additional_data?: { next_cursor?: string | null;
      pagination?: { start: number; limit: number; more_items_in_collection: boolean; next_start?: number } } | null;
    error?: string; error_info?: string;
  };
  export class PipedriveError extends Error {
    readonly status: number; readonly body: unknown;
    constructor(status: number, body: unknown) {
      const b = body as { error?: string } | null;
      super(`Pipedrive ${status}: ${b?.error ?? "unknown error"}`);
      this.status = status; this.body = body;
    }
  }
  type Query = Record<string, string | number | boolean | undefined>;
  const root = (cfg: PdConfig) => cfg.baseUrl ?? `https://${cfg.companyDomain ?? "api"}.pipedrive.com`;
  const retryDelayMs = (res: Response, attempt: number) => {
    const retryAfter = Number(res.headers.get("retry-after"));
    if (retryAfter > 0) return retryAfter * 1000;
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (reset > 0) return reset * 1000;
    return Math.min(2000 * 2 ** attempt, 30000);
  };
  export async function pd<T>(cfg: PdConfig, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
      versionedPath: `/api/v1/${string}` | `/api/v2/${string}`,
      opts: { query?: Query; body?: unknown } = {}): Promise<PdEnvelope<T>> {
    const url = new URL(root(cfg) + versionedPath);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { method,
        headers: { "x-api-token": cfg.apiToken, accept: "application/json",
          ...(opts.body === undefined ? {} : { "content-type": "application/json" }) },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
      if (res.status === 429 && attempt < (cfg.maxRetries ?? 4)) {
        await new Promise((r) => setTimeout(r, retryDelayMs(res, attempt))); continue;
      }
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok || json?.success === false) throw new PipedriveError(res.status, json);
      return json as PdEnvelope<T>;
    }
  }
  export async function* paginateV2<T>(cfg: PdConfig, path: `/api/v2/${string}`, query: Query = {}): AsyncGenerator<T> {
    let cursor: string | undefined;
    do {
      const page = await pd<T[]>(cfg, "GET", path, { query: { ...query, limit: 500, cursor } });
      yield* page.data ?? [];
      cursor = page.additional_data?.next_cursor ?? undefined;
    } while (cursor);
  }

Note: JSON.parse throws on the Cloudflare 403 HTML page. Production code must catch that case.
Gotcha found by running it: Node's strip-only TS mode rejects constructor parameter properties (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). Use plain class fields.

Spike file: .../spikes/pipedrive-api/spike.ts. It starts a local node:http mock server. The first GET /api/v2/deals returns 429 with x-ratelimit-reset: 1, and the pages are linked by next_cursor. Command: node spike.ts. Output (VERIFIED-run):
  paginateV2 ids [ 1, 2, 3 ] elapsed ms >= 1000: true list calls 3
  error 401 Pipedrive 401: unauthorized access {"success":false,"error":"unauthorized access","errorCode":401,"error_info":"Please check developers.pipedrive.com"}
  sdk getDeal returns envelope {"success":true,"data":{"id":1,"echo":null}}
  GET /api/v2/deals?status=open&limit=500 x-api-token= test-token
  GET /api/v2/deals?status=open&limit=500&cursor=c2 x-api-token= test-token
  PATCH /api/v2/deals/1 ct= application/json {"status":"lost","lost_reason":"No budget","custom_fields":{"a1b2":"https://example.com/v/abc"}}
  POST /api/v2/activities {"subject":"Follow up call","type":"call","deal_id":1,"owner_id":7,"due_date":"2026-09-28","due_time":"09:30","duration":"00:15","note":"<p>Video sent</p>","participants":[{"person_id":5,"primary":true}]}
  PATCH /api/v2/activities/10 {"done":true}
  POST /api/v1/notes {"deal_id":1,"content":"<p>Video: <a href=\"https://example.com/v/abc\">watch</a></p>","pinned_to_deal_flag":1}
  PUT /api/v1/notes/99 {"content":"<p>updated</p>"}
  (SDK) GET /api/v2/deals/42?include_fields=notes_count&custom_fields=k1%2Ck2 x-api-token= test-token
  (SDK) PATCH /api/v2/deals/42 {"stage_id":3,"custom_fields":{"k1":"https://example.com"}}
  (SDK) POST /api/v2/activities {"subject":"Call","type":"call","deal_id":42,"due_date":"2026-09-28","due_time":"09:30"}
  (SDK) POST /api/v1/notes {"content":"<p>hi</p>","deal_id":42}
  (SDK) PUT /api/v1/notes/99 {"content":"<p>edit</p>"}
  (SDK) GET /api/v1/users
  (SDK) GET /api/v2/stages?pipeline_id=1&limit=500
This proves the request shapes and the retry and pagination logic. It does not prove that the real server accepts them.

======================================================================
16. OFFICIAL SDK (OPTIONAL): npm "pipedrive" 33.7.0
======================================================================
VERIFIED-run unless marked.
- Unpacked size 9.2 MB. Dependencies: axios ^1.16.0, qs ^6.14.2.
- CommonJS: main is dist/index.js, types are dist/index.d.ts, exports are ".", "./v1" and "./v2".
  import { v1, v2 } from "pipedrive";          // works from ESM
  import * as pv2 from "pipedrive/v2";          // works
  import * as pv1 from "pipedrive/v1";          // works
  const c2 = new v2.Configuration({ apiKey: TOKEN, basePath: `https://${co}.pipedrive.com/api/v2` });
  const c1 = new v1.Configuration({ apiKey: TOKEN, basePath: `https://${co}.pipedrive.com/api/v1` });
  await new v2.DealsApi(c2).getDeal({ id, custom_fields: "k1,k2", include_fields: "notes_count" });  // returns {success, data}
  await new v2.DealsApi(c2).getDeals({ stage_id, status: "open", limit: 500, cursor });
  await new v2.DealsApi(c2).updateDeal({ id, UpdateDealRequest: { stage_id, status: "lost", lost_reason, custom_fields: { [key]: url } } });
  await new v2.ActivitiesApi(c2).addActivity({ AddActivityRequest: {...} });
  await new v2.ActivitiesApi(c2).updateActivity({ id, AddActivityRequest: { done: true } });   // the key IS AddActivityRequest (d.ts), not UpdateActivityRequest
  await new v2.DealFieldsApi(c2).addDealField({ AddDealFieldRequest: { field_name, field_type: "varchar" } });
  await new v2.OrganizationFieldsApi(c2).addOrganizationField({ AddOrganizationFieldRequest: {...} });
  await new v2.PipelinesApi(c2).getPipelines(); await new v2.StagesApi(c2).getStages({ pipeline_id, limit: 500 });
  await new v1.NotesApi(c1).addNote({ AddNoteRequest: { content, deal_id } });
  await new v1.NotesApi(c1).updateNote({ id, NoteRequest: { content } });
  await new v1.UsersApi(c1).getUsers();
- The type of custom_fields in UpdateDealRequest is { [key: string]: any | undefined } (VERIFIED-doc, d.ts).
- The default basePath is api.pipedrive.com, not the company domain, and the SDK does not handle 429.
- We need only about 15 calls, so the 60-line fetch wrapper in section 15 is enough. The SDK would also add axios.

======================================================================
17. GOTCHAS (SUMMARY)
======================================================================
1. The v1 deals, persons, orgs, activities, pipelines and stages endpoints are out of support since 2026-08-01. Do not build on them. VERIFIED-doc.
2. Notes, users and activity types have no v2, so you must mix v1 and v2. v1 responses use "YYYY-MM-DD HH:MM:SS" in UTC and 0/1 flags. VERIFIED-doc.
3. There is no URL custom field type. Use varchar: 255 characters maximum, and the KB says URLs in it are clickable. VERIFIED-doc.
4. Custom field keys are different per account. Find them by name at startup, or store them when you create the fields. VERIFIED-doc.
5. v2 writes custom fields only inside "custom_fields". The readme PHP example contradicts this. VERIFIED-doc (inconsistency).
6. An activity is linked to a person only through participants[].primary, because person_id is read-only. VERIFIED-doc.
7. Sending person job_title, notes, im, birthday or postal_address without Contact Sync returns 403. VERIFIED-doc.
8. To clear a set-type custom field, send null, not []. VERIFIED-doc.
9. Limits: the custom_fields query param takes at most 15 keys, the ids param at most 100, and limit at most 500 (default 100). VERIFIED-doc.
10. GET /api/v2/deals leaves out archived deals. VERIFIED-doc.
11. When the daily budget is used up, you get 429 until midnight server time, and retries cannot fix it. If you ignore 429, you can get a Cloudflare 403 HTML block. VERIFIED-doc.
12. v2 search endpoints allow 10 requests per 2 s and cost 20 tokens each. Keep search out of hot paths. VERIFIED-doc.
13. v2 is strict. Send ids, option ids and visible_to as numbers, and booleans as true/false. VERIFIED-doc.
14. Ignore these doc errors: "ims" (the spec says "im"), "primary_flag" (the spec says "primary"), and "Only the name field is required" for activities. VERIFIED-doc.

FILES
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/pipedrive-api/pd-client.ts (fetch wrapper, ran)
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/pipedrive-api/spike.ts (mock server + SDK checks, ran)
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/pipedrive-api/openapi-v1.yaml, openapi-v2.yaml (official specs, copy from 2026-09-26)
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/pipedrive-api/show-op.py, show-ex.py (print the params, body schema and examples of one endpoint, for example: python3 show-op.py v2 patch /deals/{id})
- /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/pipedrive-api/docs/*.md, cl/*.txt (snapshots of the docs and changelog)
