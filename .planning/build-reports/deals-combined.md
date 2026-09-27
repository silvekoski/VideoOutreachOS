# Deals page with the to-do list

Date: 2026-09-27

## What changed

- The Inbox page is gone. `pages/deals-page.tsx` is the start page at `/`. The route `/deals` redirects to `/`.
- The page reads `GET /api/deals` and `GET /api/inbox`. `lib/todo.ts` joins the inbox rows to the deal rows by deal ID. Each deal keeps its first inbox row in the group order review, meeting today, call, second channel.
- An inbox row without a deal (a failed intro or voice clone job) shows in an alert above the table.
- The first filter card, To do today, is the default. `lib/funnel.ts` counts the pipeline cards. A lost deal counts in each stage that it reached (`reached` in `DealRowDto`).
- The Next step column shows the reason, the context and the action button for a to-do deal. `components/todo-action.tsx` holds the reason badge and the button.

## Generate videos

- `GET /api/prospects?analyst=` lists the open Pipedrive deals of the analyst that have no local deal row, up to 50 (`domain/prospects.ts`).
- `POST /api/deals/generate` with `{ dealIds }` calls `ensureDeal` for each ID in sequence and returns one result per ID.
- `PipedriveClient.listOpenDeals` returns all open deals. The sweep filters the deals that have no Video field.
- `components/generate-videos-dialog.tsx` is the button and the dialog in the page header.
