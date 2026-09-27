Product concept brief
========================

# Product concept brief

I want to build a custom tool that streamlines Mergero’s workflow. One of their biggest challenges right now is converting prospects (on the seller side) from Pipedrive CRM into remote meetings. They have company names in their CRM, but the biggest problem is what lies between the name and the scheduled remote meeting.

Mergero obtains the names (on the seller’s side) from commercial customer databases, and this data is fed into Pipedrive. Then there’s this system that enables a Mergero analyst to join a Teams meeting with the company’s owner. The transcription from the Teams meeting is automatically sent to the MGX software, and they have that part well under control. Of course, the goal of the meeting is also to find out whether the company might be willing to sell the business.

In other words, enriching prospect data is currently a relatively big problem that takes a lot of time. I thought I could solve this by building https://mailmoo.io -style software where the system can generate a personalized video for the first point of contact. Instead of an analyst sending a cold message, the client receives a link to a custom video explaining what Mergero is, which buyers on the MGX platform are already interested in companies like theirs, and what their company’s value might be.

The video features the prospect’s website and is personalized using AI to speak directly to that specific prospect. This gives the prospect the impression that the company has gone to great lengths to create the video. At the end of the video, there is a calendar where you can book a Teams meeting with an analyst. The video is personalized with the customer's landing page and the correct numbers, so it gives the customer a warm feeling.

Engagement data can be used to determine how interested a customer is in selling their business. Conclusions can be drawn from their behavior regarding how interested a customer is in selling their business.

This would be the start of the sales funnel, where the customer receives a personalized video.

### Users

The tool is for the Mergero origination team. The team has 12 to 15 people. They spend about half of their time on outreach. The target is 20 calls per person per week. Each analyst manages the deals that they own in Pipedrive.

### Target companies

The tool sends videos to owners of traditional, profitable companies. The company has 20 or more staff and a value of 3 million euros or more. Most target companies are more than 10 years old. The sector does not matter. The first contact is the CEO or the chairman of the board. The tool covers the Nordics and DACH first.

### Data sources

Pipedrive gives the company name, the contact person, the website, the business ID, and the NACE code. Asiakastieto gives revenue and profit for Finnish companies, keyed on the business ID. In DACH, the owner gives a range in the form. MGX gives the buyer names, logos, and closed deals through the MCP connection. The company website gives the text for the "Your company" slide. LinkedIn gives the language of the owner and the staff count.

In the demo, Pipedrive holds mock data. A mock MCP server replaces MGX, and a mock route replaces Asiakastieto. See Backend.

### Steps to make one video

1. The analyst clicks the "Video" link field on the Pipedrive deal.
2. The tool reads the deal, the person, and the organization from Pipedrive.
3. The tool reads the website and writes three lines about the company.
4. The tool gets the financial data from Asiakastieto with the business ID, or marks the slide as "ask in form".
5. The tool gets matching buyers and example deals from MGX with the NACE code.
6. The tool fills the slide templates and makes the ElevenLabs voice track in the owner's language.
7. The analyst reviews the video and approves it.
8. The tool publishes the link and moves the deal to "Link sent".

### Analyst setup

The analyst speaks the language of the owner. Each analyst records one face-cam intro of about 30 seconds in each language they use for outreach. Each analyst records one voice sample for the ElevenLabs clone. The analyst gives written consent for the voice clone. The tool uses the same intro and voice for all videos of that analyst in that language. A new recording replaces the old one for new videos only.

### Follow-up sequence

The current sequence is first contact, then a follow-up, then a change of channel. The tool keeps this sequence. If the owner does not open the link in two days, the tool makes a call task. If the owner opens the link but does not book, the tool makes a task to send the link on a second channel. The analyst sees the watch time per slide before the call.

The hourly sweep job makes these tasks. A task can come up to one hour late. See Backend.

### Valuation method

The video has no valuation slide. The form has a valuation calculator for DACH prospects. The owner enters a revenue range and a profit range, or exact numbers, and the calculator shows a valuation range, not a number. The tool computes the range from the profit and a multiple. The multiple comes from closed deals in MGX with the same two-digit NACE code. The range uses the 25th and the 75th percentile multiple. If MGX has fewer than three closed deals with that code, the calculator says that Mergero gives a range after the meeting.

### Data privacy

Prospect data stays in Mergero systems. The video page shows the Mergero privacy notice and contact details. Form data goes to MGX only. The tool removes the video page when the link expires. Buyers see the company data as anonymized until the owner agrees.

### Page

The site is optimized for mobile phones. You can easily watch the video and fill out the form on your phone. The page shows the Mergero contact details and a privacy notice. German prospects expect this.

### Metrics

The tool reports these numbers per analyst and per country: links sent, open rate, average watch time, form rate, and meeting rate. Timo said that half of the owners say yes when asked directly. The target is a higher meeting rate than the current text sequence. Mergero compares the video sequence with the text sequence on the first 100 deals.

### Analytics

The system records each open, the watch time, and the form activity. It also records each session on the video page. The analyst can replay the sessions in the admin panel.It writes this data to Pipedrive and sends an alert to the analyst. The slide where the owner stops, and the watch time for each slide. The channel of the link: email, LinkedIn, SMS, or WhatsApp. In Pipedrive: the deal stage moves with each event, from opened to meeting booked. If the owner does not book within two days, the system makes a call task.

### Meeting brief

The tool writes a meeting brief for the analyst before each meeting. The meeting brief is a one-page summary of the prospect. The analyst reads it in less than two minutes.

The worker writes the first version when the owner books a meeting. The booking event gives the meeting start time. If new events arrive in the three hours before the meeting, the hourly sweep adds a write-brief job. The job key is `brief:{deal}:{last event ID}`, so the tool does not write the same version twice. Each version is one row in the briefs table.

The meeting brief uses only data that the tool already has:

- Pipedrive: the company, the owner, the role, the country, the NACE code, and the staff count.
- The scrape: the three lines about the company.
- Asiakastieto or the form: revenue, profit, and the source of each figure.
- The form: all answers, the answers to the custom questions, and the valuation range from the calculator.
- The events: opens, sessions, watch time per slide, the stop slide, the replay count, and the channel and the device of each session.
- The timeline: the buyers on slide 5.

The meeting brief has a fixed layout with eight sections. A section with no data shows "No data".

1. Header: the company, the owner, the meeting time, the language, the interest level, and a summary.
2. Company: the three lines about the company, the country, the NACE code, and the staff count.
3. Figures: revenue, profit, and the valuation range. Each figure shows its source and the type of value: range or exact.
4. Engagement: the number of opens and sessions, the total watch time, one bar per slide, the stop slide, and the replay count.
5. Signals: each positive and negative signal, with the event that shows it.
6. Form answers: all answers. Free text shows as the owner wrote it, in the language of the owner.
7. Buyers: the buyers on slide 5. A mark shows each buyer link that the owner tapped.
8. Questions for the meeting: three to five questions.

#### Signals and interest level

The server computes the signals from the events with fixed rules. The language model does not select the signals.

| Signal | Type | Rule |
|---|---|---|
| Watched to the end | Positive | A complete event exists. |
| Replayed figures or buyers | Positive | Slide 4 or slide 5 has one or more replays. |
| Tapped a buyer link | Positive | A buyer link tap event exists. |
| Used the calculator | Positive | A calculator result event exists. |
| Gave exact figures | Positive | The form has an exact revenue or profit value. |
| Forwarded the link | Positive | A forward event exists. |
| Came back | Positive | Sessions exist on two or more days. |
| Answered custom questions | Positive | The form has an answer to a custom question. |
| Stopped early | Negative | The stop slide is before slide 4. |
| Short watch | Negative | The total watch time is less than 30 seconds. |

The interest level has three values:

- High: four or more positive signals and no negative signal.
- Low: no positive signal, or two negative signals.
- Medium: all other cases.

The interest level shows engagement with the video. It does not show if the owner wants to sell. Mergero compares the interest level with the meeting results of the first 100 deals and adjusts the rules.

#### Text from the language model

Kimi-K3 writes two parts only: the summary and the questions for the meeting. The worker fills all other sections from the data. The model gets the data as JSON and returns JSON that matches a schema.

- The summary has 60 words or fewer.
- Each question comes from a gap in the data. Examples are a missing figure, an unanswered custom question, or a slide that the owner skipped.
- The model does not write figures. The worker rejects output with a number that is not in the input data.

After a rejection, the worker asks the model again once. After a second failure, the meeting brief shows the data sections only and the header shows "No summary".

The meeting brief uses the language that the analyst sets in the profile menu. The default is English.

#### Delivery and privacy

- The deal page shows the meeting brief as the first card.
- The Inbox shows the deal in the Meeting today group.
- The tool sends an alert to the deal owner with a link to the meeting brief.
- The tool adds one Pipedrive note to the deal with the meeting time, the interest level, and the link. The note has no session data.
- The tool records when the analyst opens the meeting brief. The Events card shows this.

The meeting brief stays in Mergero systems. The hourly sweep deletes it when the link expires.

### Language barrier

The software retrieves the language spoken by the company owner from LinkedIn and creates a presentation in that language. We also look at the prospect's country and the language of their website, and match this with the languages on LinkedIn. In other words, it doesn't matter if the company owner doesn't speak English, the software generates presentations natively in many languages. The analyst who owns the deal speaks the same language, so the face-cam intro and the meeting match the video.

### Form

In addition, throughout the video, there is a form on the left side of the screen where customers can, if they wish, enter their company’s financial data and other information that Mergero needs. On a phone, the form is located below the video. Business owners probably don't want to enter an exact number in a random form, so the form allows them to enter ranges only; however, if a business owner wants to enter an exact number, that's also possible.  If a customer enters information into the form, the data is sent directly to the MGX platform. The video starts with a face-cam clip of the analyst speaking, which helps build credibility. On the platform, analysts can write their own questions for specific prospects if there's a particular issue they're wondering about.

### Link

The software generates a unique code for each company. The business owner just needs to click on the link to fill out the information. When you share the link on social media or WhatsApp, the prospect's own website appears in the preview card. From the admin panel, you can set how long a link remains valid. The link is easy to use across all channels, whether it's email, LinkedIn, SMS, or WhatsApp. So even if the business owner is 60 years old, you can easily send him the link via WhatsApp. The website has a button to send a link to someone else, so if the CEO isn't the owner, you can easily forward the link from the website to someone else.

Link code: the tool makes a random 128-bit code for each deal, encoded as base64url. The code is not the deal ID. The video page sends a `noindex` header.

Preview card: messaging apps read the Open Graph tags from the server response only. The Hono server writes these tags into the HTML of each video page. The React app then mounts in the same page. The `og:image` is a 1200 × 630 crop of the screenshot.

### Slide visual look

The slides are branded with Mergero's branding (logo, colors, layout) and do not look like AI templates. Logos, screenshots, and short text, no charts. Fixed layouts in the templates. The AI fills the text and the images only. It does not change the layout. Real material only: the owner's website, buyer logos from MGX, and the analyst's face. No stock photos, no AI images. The template works in all languages and is easy to customize.

### Pipedrive integration

The tool connects to Pipedrive with an API token. See Pipedrive connection in Backend. The deal owner in Pipedrive is the analyst in the face-cam clip. The alerts go to this person. Four stages: Link sent, Opened, Form sent, Meeting booked. The tool moves the deal. A URL field "Video" on each deal opens the tool, where the analyst manages the video. The form values write to deal fields: revenue range, profit range, staff range, and valuation range from the calculator. If the owner marks "not interested" in the form, the tool sets the deal to Lost with the reason. One link per deal. If a link exists, the Video field opens it. The tool does not make a second link. Pipedrive is the source of truth for contact data. The tool reads it and does not change it.

### Website scraping

The tool reads the prospect website with Firecrawl, a hosted scraping API. It scrapes the home page with three formats: Markdown, links, and screenshot. The tool picks the about page from the links by path words, for example about, meista, yritys, ueber-uns, om-oss. It then scrapes that page for Markdown only. A scrape action closes the cookie banner before the screenshot. The language model writes three lines about the company from the text, in the language of the owner. The screenshot goes to slide 3 and the link preview card. If the text has fewer than 200 words, or the scrape fails, the analyst writes the lines in the review step.

Cookie banners and about pages are different on each site, so expect manual cases. The worker logs each scrape result and the reason for a failure. Check the failure rate after the first 50 deals.

### Slide order

1. Face-cam intro

The analyst delivers a welcome message that is prospect-agnostic. In other words, there’s no need to record a separate video for each client. After this intro, the presentation switches to a PowerPoint mode without a webcam feed. Audio for this section can be generated using Elevenlabs; the analyst’s voice is cloned once and can then be reused multiple times.  

2. Who Mergero is.

Logos of buyer clients and a few closed deals. Timo said graphs do not interest the owner. A short list of logos is enough.

3. Your company

The owner's website and two or three lines on what the company does. Timo said this shows the owner that Mergero understands the business.

4. Your figure

Revenue and profit at a high level. In Finland the tool pulls them from public data. In DACH the slide asks the owner to enter a range in the form calculator to see a valuation range. Timo agreed that the tool can fill this slide from Asiakastieto.

5. Buyers from Mergero deals

Names, logos, links, and one line per buyer on what it buys. Timo said this is the first question owners ask. Named buyers change the discussion. About 1,700 of 2,200 buyers allow Mergero to use their names.

6. What is possible
One or two deals in the owner's sector. Timo said he shows what someone else in the field has done.

7. Your data stays private

Buyers see anonymized data until the owner says yes. Timo described this process. He did not name it as a slide. It answers the credibility problem he mentioned.

8. Book a meeting

The calendar. One line on what the meeting covers.

### Video rendering

The tool renders one MP4 file per deal with Revideo. Revideo is open source under the MIT license.

#### Timeline

The video is a list of segments: the face-cam clip, then slides 2 to 8. Each slide has a template name, its variables, and one audio clip. The audio length plus a 0.4-second pause sets the slide duration. The tool stores the timeline as JSON in SQLite, one row per version.

After the render, the worker writes the start time and the end time of each slide into the timeline. The player uses these times, not the planned durations.

#### Scene

The scene is one TypeScript file with a fixed layout per slide at 1920 by 1080 pixels. The scene fills text and images from the timeline JSON and does not change the layout. The face-cam clip plays in the scene through the Revideo video component, so all segments share one clock.

German and Finnish text is often longer than English text. Each text slot has a maximum character count. Before the render, the worker checks the text of each slot. If a text is too long, the worker marks the video for review and does not render. The slide font must include å, ä, ö, æ, ø, ü, and ß.

#### Audio

The tool writes a script of 30 to 60 words per slide in the language of the owner. It sends each script to ElevenLabs with the voice clone of the analyst and gets one MP3 per slide. If a clip fails, the tool retries three times and then marks the video for review.

The worker normalizes each MP3 and the audio of the face-cam intro to -16 LUFS with the FFmpeg `loudnorm` filter. All segments then have the same loudness.

#### Render

A render job in the worker process renders the scene with the Revideo render function. The worker renders one video at a time. Revideo runs headless Chrome and FFmpeg, so measure CPU, memory, and render time for a three-minute video on the demo server before launch. Pin the Revideo version in `package.json`.

The job makes a 1080p file for desktop and a 720p file for phones, WhatsApp, and LinkedIn. Both use H.264, AAC, and yuv420p with the index at the start (`-movflags +faststart`), so they play in the native video element of every browser and phone. The job also makes a poster frame as JPEG.

#### Review

The analyst watches the MP4 in the admin panel, edits any script, and approves. After an edit, the tool makes new audio for the edited slides and renders again. On approval, the tool publishes the link.

#### Video page

The page plays the MP4 in a custom player. The player is a React component around the native video element with the browser controls off. It draws its own play button, progress bar, and volume control, so the tool sees every action. The progress bar has one mark per slide, and the owner can tap a mark to jump. The page shows a poster frame with a play button, because phones block autoplay with sound.

The video element has the `playsinline` attribute. Screens narrower than 1024 pixels get the 720p file, and larger screens get the 1080p file. iPhone shows native controls in fullscreen, so the player has no fullscreen button on iPhone. The media route supports HTTP range requests, so seek works on phones.

The player maps the video time to the slide with the timeline JSON. While slide 5 plays, the page shows the buyer links under the video. While slide 8 plays, the page shows the calendar.

The player records these events: play, pause, seek, slide start, slide end, complete, and page hide. Each event has the deal, the slide number, the video time, the channel of the link, and a sequence number. The player sends the events in a batch every 10 seconds. When `visibilitychange` sets the page to hidden, the player sends the last batch with `navigator.sendBeacon`. The server ignores an event with a sequence number that it already has. From the events, the server computes the watch time per slide, the slide where the owner stopped, and the number of replays. It writes these to the deal and moves the deal stage. The analyst can download the 720p file from the admin panel.

#### Storage

The demo runs on one server. The tool stores the media files on the local disk and all state in one SQLite file.

SQLite runs in WAL mode, so the API and the worker can read and write at the same time. A daily job copies the database with the SQLite backup API.

The API serves the media through a route that checks the link code and the expiry. There is no public static folder for deal files. File names include a version number, so a cache never serves an old video.

#### Telemetry

The render workers set `DISABLE_TELEMETRY=true`, so Revideo sends no render counts to PostHog.

# Admin panel

The admin panel has five pages and a profile menu: Inbox, Deals, Deal page, Review page, and Metrics. The analyst opens it from the Video link field in Pipedrive or from the browser. The panel uses the stack and the design rules in the Tech stack section.

The demo has no sign-in. An analyst selector in the top bar sets the current analyst. Run the demo on a private address only.

#### Status

Each deal has one status in the panel: Draft, Review, Failed, Link sent, Opened, Form sent, Meeting booked, Lost. Draft, Review, and Failed exist only in the tool. The other five mirror the Pipedrive stage. The panel shows a status as a word and a shape, not only a color.

#### Inbox

The Inbox is the start page. It shows only the deals that need an action today, in four groups: Review, Meeting today, Call, Send on a second channel. Each row shows the company, one line of context, and one button. The button label is the action. A failed render shows in the Review group with a Retry button. A done deal leaves the Inbox.

The Meeting today group shows each deal with a meeting in the next 24 hours. The row shows the meeting time and the interest level. The button is Read meeting brief.

A failed job of any type shows in the Review group with its error line and a Retry button. This includes failed scrapes, failed audio, failed renders, failed Pipedrive writes, and failed meeting briefs.

#### Deals

The Deals page is one table of all deals with a video. It has a search box and three filters: analyst, country, status. The columns are company, country, analyst, status, watch time, and next action. The default view shows the deals of the analyst in the analyst selector. A click on a row opens the deal page.

#### Deal page

The header shows the company, the website, the owner, the language, the analyst, the status, and a link to the Pipedrive deal. The buttons are copy link, download 720p, and change expiry.

The page has these cards:

- Events: link sent, each open, form sent, meeting booked, meeting brief written, meeting brief read, tasks.
- Watch time: one bar per slide, the stop slide, and the replay count.
- Sessions: one row per session on the video page, with a Replay button.
- Form answers: appears after the owner sends the form.
- Open task: appears when a task is open.
- Meeting brief: appears after the owner books a meeting. It is the first card on the page.

A card appears only when its data exists.

#### Review page

The video plays on top with one mark per slide. Below it, one row per slide shows the slide name, the script box, and the audio status.

- Slide 1 is the face-cam intro. It is fixed.
- Slide 3 shows the screenshot and the three lines. When the scrape failed, the box is empty and the analyst writes the lines.
- Slide 4 shows the figures or the "ask in form" flag.
- Slide 5 shows the buyers from MGX. The analyst can remove a buyer.
- Slides 2, 6, 7, and 8 show the script.

When the analyst edits a script, the tool marks that slide "New audio". On approval, the tool makes new audio for the edited slides only and renders again. A "More" link holds the custom form questions, the link expiry, and the language. The Approve button publishes the link and moves the deal to Link sent.

#### Metrics

The Metrics page shows one table per analyst and per country with five numbers: links sent, open rate, average watch time, form rate, meeting rate. One chart compares the video sequence with the text sequence on the first 100 deals. The only filter is the date range.

#### Profile menu

The profile menu is not a page in the sidebar. It holds:

- The face-cam intro per language, with record and replace.
- The voice sample, the clone status, and the consent date.
- The default link expiry and the default second channel.
- A preview of the eight slide templates. The analyst cannot edit them.
- The language of the meeting brief. The default is English.

### Session recordings

The video page records two things. The player records the events: play, pause, seek, slide start, slide end, complete, and page hide. The page records the session: scroll, taps, form field focus, device, browser, screen size, and the channel of the link. The page does not record form values. It records only that a field got a value.

The page sends the data in the same way as the player: a batch every 10 seconds, and `navigator.sendBeacon` when the page is hidden. The server writes each event as one row in the events table of SQLite, with the session ID. From the events, the server computes the watch time per slide, the stop slide, and the replay count. It writes these numbers to the deal.

Pipedrive gets only the computed numbers, the stage change, and the task. The recording stays in Mergero systems. The hourly sweep deletes the session rows and the event rows when the link expires. The privacy notice on the video page says that the page records the session.

The analyst sees the sessions on the deal page in the Sessions card. Each row shows the date, the channel, the device, the watch time, the stop slide, and the form activity. The Replay button shows the session as an event timeline. The timeline has one bar for the video time with a mark per slide. It shows each play, pause, seek, scroll, tap, and form field focus at its time. It does not replay the page visually. The Inbox row shows the last session in one line, for example "Opened on WhatsApp, stopped at slide 5".

The page also records three named events: buyer link tap, forward, and calculator result. A forward event is a tap on the forward button. The meeting brief uses these events.

### Where the video is built and edited

A render worker on the server builds the MP4. The browser does not render. The source of the video is the timeline JSON stored in SQLite. It lists each slide, its template, its variables, and its audio clip.

The tool keeps one folder per deal on the local disk. `{n}` is the video version:

```
deals/{deal}/
  screenshot.png         slide 3
  og-image.jpg           link preview card, 1200 × 630
  poster.v{n}.jpg
  audio/slide-2.v{n}.mp3 … slide-8.v{n}.mp3
  video-1080.v{n}.mp4
  video-720.v{n}.mp4
analysts/{analyst}/
  intro-{language}.mp4
  voice-sample.mp3
  consent.pdf
data/
  app.sqlite             deals, timelines, jobs, sessions, events, tasks, briefs, analysts
  backups/app-{date}.sqlite
```

The analyst edits the video on the Review page. The analyst can change the script text of slides 2 to 8, the three lines about the company, the buyer list, the custom form questions, the link expiry, and the language. The analyst cannot change the layout, the fonts, or the colors. After an edit, the worker makes new audio for the changed slides and renders again. The new MP4 gets the next version number. The page uses the newest approved version. The tool keeps the old timeline as a version.

The layout lives in one scene file in the repository, with one fixed layout per slide. Only a developer changes it. A layout change needs a code change. It applies to new videos only.

| Item | Where | Who | Effect |
|---|---|---|---|
| Script text, slides 2 to 8 | Review page | Analyst | New audio for that slide, new render |
| Three lines about the company | Review page, slide 3 | Analyst | New audio, new render |
| Buyer list | Review page, slide 5 | Analyst | New audio, new render |
| Custom questions, expiry, language | Review page, More | Analyst | Page only, no render |
| Face-cam intro, voice sample | Profile menu | Analyst | New videos only |
| Slide layout, fonts, colors | Scene file in the repository | Developer | Code change, new videos only |
| Contact data | Pipedrive | Analyst in Pipedrive | The tool reads it and does not write it |
| Session recordings | SQLite events table | Nobody | Read on the deal page, deleted at expiry |
| Meeting brief | SQLite briefs table | Nobody | Read on the deal page and in the Inbox, deleted at expiry |

# Tech stack

## Language model

The tool uses Kimi-K3 through the Featherless API: https://featherless.ai/models/moonshotai/Kimi-K3

Kimi-K3 writes the three company lines and the slide scripts. It returns JSON that matches a schema for each slide. The worker rejects output with the wrong word count or the wrong language and asks the model again once. After a second failure, the worker marks the video for review.

Kimi-K3 does not select images or write figures. The images come from the scrape, MGX, and the analyst. The figures come from Asiakastieto or the form. Revideo renders the video, and ElevenLabs makes the audio.

Kimi-K3 also writes the summary and the questions in the meeting brief. See Meeting brief.

The worker sends one request to Featherless at a time, so it stays within the concurrency limit of the plan.

## Stack

- React 19 with Vite 7 and TypeScript
- React Router 7
- TanStack Query and TanStack Table
- Recharts for charts
- react-markdown with remark-gfm
- ESLint 9 with typescript-eslint, Vitest 4 for unit tests
- Playwright for end-to-end tests of the player and the form on mobile Chrome and mobile Safari (WebKit)

## Backend

The demo runs on one server with three parts: the Hono API, the worker process, and the mock services.

- Hono on Node.js serves the API, the admin panel, the video page, and the media files.
- SQLite through better-sqlite3 holds all state. The tables are deals, timelines, jobs, sessions, events, tasks, briefs, and analysts.
- The worker is a separate Node.js process. A crash in headless Chrome does not stop the API.
- The API keys for Pipedrive, Firecrawl, Featherless, and ElevenLabs come from environment variables.
- The API and the worker write JSON log lines to stdout.

### Job queue

The jobs table in SQLite is the queue. Each job has a type, a payload, a status, a run time, an attempt count, an error text, and an idempotency key.

1. The API adds a job with an idempotency key, for example `render:{deal}:{version}`. A second job with the same key is ignored.
2. The worker claims the oldest due job in one transaction.
3. The worker runs one job at a time. This keeps one render at a time and one model request at a time.
4. If a job fails, the worker sets a later run time with backoff.
5. After three attempts, the worker sets the job to Failed and keeps the error text.

Job types: scrape, write-script, write-brief, audio, render, pipedrive-write, sweep, backup.

### Hourly sweep

A sweep job runs every hour. It does these checks:

- It makes a call task for each deal in Link sent with no open after 48 hours.
- It makes a second-channel task for each deal in Opened with no booking after 48 hours.
- It deletes the media files, session rows, event rows, and meeting briefs of each expired link.
- It writes the Video link field on new Pipedrive deals.
- It adds a write-brief job for each deal with a meeting in the next three hours and new events after the last meeting brief.

The sweep records each task in the tasks table, so it does not make the same task twice.

### Mock MGX (MCP server)

A local MCP server replaces MGX in the demo. It reads a seed JSON file. The tool calls it as an MCP client, in the same way as the real MGX.

| Tool | Input | Output |
|---|---|---|
| `search_buyers` | NACE code, country | name, logo URL, website, one-line focus, `name_public` |
| `list_closed_deals` | NACE code | year, country, short text, profit multiple |
| `submit_form` | deal ID, form values | receipt ID |

The tool shows only buyers with `name_public` set to true. When the real MGX is ready, only the server address changes.

### Mock Asiakastieto

The Hono route `GET /mock/asiakastieto/{business_id}` returns revenue, profit, and the fiscal year. It reads a seed JSON file keyed on the Finnish business ID. If the ID is not in the file, the route returns 404, and slide 4 shows "ask in form".

### Pipedrive connection

- The tool uses an API token from the `PIPEDRIVE_API_TOKEN` environment variable. There is no Marketplace app.
- A URL custom field "Video" on each deal opens `{tool}/deals/{deal_id}`. A setup script writes this field on all existing deals.
- The organization has two custom fields: business ID and NACE code.
- `config/pipedrive.json` maps the stage IDs and the custom field keys.
- The call task and the second-channel task are Pipedrive activities.
- When Pipedrive returns HTTP 429, the client waits with backoff and tries again.

## UI

- shadcn/ui on Radix primitives
  - components.json: style `radix-nova`, base color `neutral`, CSS variables on, icon library `lucide`
- Tailwind CSS 4 through `@tailwindcss/vite`
- class-variance-authority, clsx, tailwind-merge, tw-animate-css
- Theme: tweakcn "Amber minimal" preset, dark variant, colors only. Fonts, radius and shadows are local.
- Fonts: Geist and Geist Mono (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`)
- Icons: lucide-react, simple-icons for brand logos
- Toasts: sonner
- Command palette: cmdk
- Theme switch: next-themes
- Animation: lottie-web, in the admin panel only. The video page does not load it.

## Design rules

- Compact shadcn controls, Geist type, restrained and precise look
- Status uses words and shapes, not only color, for color-blind users
- Respect prefers-reduced-motion
- Send each chart through `components/ui/chart.tsx`

