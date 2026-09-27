# Mergero video tool

The tool makes a personal video for the owner of a company in the Mergero Pipedrive pipeline. The owner gets a link. The video page plays the video, shows a form with a valuation calculator, and lets the owner book a Teams meeting with the analyst. The tool records the engagement, moves the Pipedrive stage, makes follow-up tasks, and writes a meeting brief before each meeting.

PRD.md holds the requirements. `.planning/` holds the design notes.

## Requirements

- Node.js 24 or later (the code runs with native type stripping)
- pnpm 10
- ffmpeg and ffprobe 8
- Google Chrome or Chrome for Testing (Revideo needs H.264 in WebCodecs, so open-source Chromium does not work)

## Start the demo

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Open http://localhost:3000. The command starts four processes:

| Process | Address | Job |
|---|---|---|
| API | http://localhost:3000 | admin panel, video page, media, mock Asiakastieto |
| Worker | none | scrape, scripts, audio, render, Pipedrive writes, hourly sweep, backup |
| Mock MGX | http://localhost:3100 | MCP server, buyer logos |
| Vite | http://localhost:5173 | front end modules in development |

Without API keys, each external service uses a local fake. The avatar in the top bar then shows an amber dot, and its menu lists the "Demo providers":

| Service | Key | Fake |
|---|---|---|
| Pipedrive | `PIPEDRIVE_API_TOKEN`, `PIPEDRIVE_COMPANY_DOMAIN` | JSON store copied from `seed/pipedrive.json` |
| Firecrawl | `FIRECRAWL_API_KEY` | local Chrome scraper |
| Featherless (Kimi-K3) | `FEATHERLESS_API_KEY` | template writer |
| ElevenLabs | `ELEVENLABS_API_KEY` | macOS `say`, else silence |

The demo companies in `seed/pipedrive.json` are real companies with public websites, so both scrapers can read them. The seed has no figures for them. Slide 4 asks the owner to enter the figures. The contact emails use the reserved domain `example.com`, so that no message goes to a real person.

For local tests without a face-cam intro or a voice clone, set `DEV_BYPASS=1`. Then an analyst without an intro gets a 3 s placeholder clip, and an analyst without a voice clone gets the macOS `say` voice. The worker makes the clip at start and moves the blocked deals forward. The bypass has no effect when `NODE_ENV` is `production`.

## Make a first video

1. Select the analyst in the top bar.
2. Open the profile menu. Record the face-cam intro in each language that you use, with its transcript. Upload the voice sample and the signed consent.
3. Open a deal: http://localhost:3000/deals/4001 (the "Video" field in Pipedrive opens the same address).
4. Wait until the deal is in Review. Check the scripts and the slides on the Review page, then select "Approve and publish".
5. Copy the link for a channel from the deal page.

The demo deals are 4001 to 4010 (Finland, Sweden, Norway, Denmark, Germany, Austria, Switzerland, Iceland). Deal 4010 (Iceland) makes an English video.

## Connect a real Pipedrive account

```sh
pnpm setup:pipedrive   # creates the custom fields and stages, writes config/pipedrive.json, fills the Video field
pnpm seed:pipedrive    # optional: copies the demo companies, persons and deals into the account
```

The API reads the Pipedrive changes every 10 s while an admin panel is open, and every 60 s when no panel is open. When less than 20 % of the daily token budget remains, it reads every 120 s. A lost, won or deleted deal in Pipedrive closes the deal in the tool. "Edit contact" on the deal page saves the company and contact data in Pipedrive.

## Production

```sh
pnpm build
pnpm start
```

Run the tool on a private address only. The admin panel has no sign-in.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e       # Playwright, mobile Chrome and mobile Safari (WebKit)
```

Before the first e2e run, install WebKit with `pnpm exec playwright install webkit`. The mobile Chrome project uses the installed Google Chrome.

The e2e run builds the web app. Then it starts its own API, worker and mock MGX on free ports, with the fake providers and a temporary storage folder. It uploads an intro, a voice sample and a consent, and it renders and publishes three demo deals (4001, 4007 and 4009) before the tests start. This setup takes some minutes. To keep the temporary folder and its logs after the run, set `MERGERO_E2E_KEEP=1`.

## Data

All state is in `storage/` (SQLite in WAL mode and the media files). The hourly sweep deletes the media, the sessions, the events and the meeting briefs of each expired link. A daily job writes a backup to `storage/data/backups/` and keeps 14 backups.
