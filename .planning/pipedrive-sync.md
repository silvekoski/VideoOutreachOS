# Pipedrive two-way sync

Status: done, 2026-09-27.

## Decisions

- The tool polls Pipedrive for inbound changes. The admin panel has no sign-in and runs on a private address, so Pipedrive cannot call a webhook.
- The poller runs in the API process, not in the worker. The worker runs one job at a time, and a render job takes about 40 s.
- The poller reads `GET /v1/recents?items=deal,person,organization`. One call returns all three entity types. The cost is 20 tokens for each call. The item data of a deal has `status`, `deleted`, `lost_reason`, `user_id`, `person_id` and `org_id`.
- The account budget is 150,000 tokens each day (header `x-daily-ratelimit-token-limit`). A 10 s interval for 24 hours costs 172,800 tokens, so the interval changes with use:
  - 10 s while one or more admin panels have the event stream open.
  - 60 s when no panel is open.
  - 120 s when less than 20 % of the daily budget remains.
- The poller keeps its cursor (`last_timestamp_on_page`) in the table `sync_state`. After a restart it continues from the cursor. Pipedrive gives changes for one month at most.
- Contact data flows both ways. An edit in the tool writes to Pipedrive first, then the tool reads the deal again. So Pipedrive stays the single store, and the last write wins.

## Inbound actions

- A changed deal, or a changed person or organization of a local deal, runs `refreshDeal`.
- `refreshDeal` updates only the snapshot for a published or closed deal. It does not change the slides of a published video.
- Pipedrive `lost` sets the local status `lost` with the Pipedrive lost reason. The tool does not write the change back.
- Pipedrive `won` sets the new local status `won`.
- A deleted deal sets the local status `lost` with the reason "Deleted in Pipedrive".
- A deal that opens again in Pipedrive gets back its stage (published) or `draft` (not published), and `advance` runs.
- A new open deal that is not in the tool sends a `pipedrive` event, so the Prospect list reads Pipedrive again.

## Live panel

- `GET /api/events` is a server-sent event stream.
- A watcher reads `PRAGMA data_version` on its own database connection each 500 ms. A change from the API or the worker sends a `db` event.
- The poller sends a `pipedrive` event after it applies changes.
- The panel invalidates its queries on each event. The `prospects` query refreshes only on `pipedrive` events, because it calls Pipedrive.
- The react-query intervals go away.

## Outbound actions

- `PATCH /api/deals/:id/contact` takes the company name, website, business ID, NACE code, contact name, role, email and phone.
- The route calls `updateOrg` and `updatePerson` on the Pipedrive client, then `refreshDeal`.
- The deal page has a contact form.

## Database

- New status `won` in the `deals.status` CHECK. The migration rebuilds the `deals` table when its SQL has no `won`.
- New table `sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)`.
