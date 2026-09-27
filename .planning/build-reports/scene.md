I built the Revideo scene and the render runner in `packages/scene/`. Typecheck, lint and the 4 tests pass. I rendered the 8 previews and German and Finnish stress timelines, and checked the frames by eye: no text overflows and nothing overlaps.

**Files** (all under `/Users/veikka/prompt-marketing-hackathon-monorepo/packages/scene/`)
- `tsconfig.json`: for `src`, extends the Revideo config. It maps `@mergero/shared` to `../shared/src/types.ts` with `paths`, so the browser typecheck does not include zod or tinyld.
- `tsconfig.render.json`: extends `tsconfig.base.json`, covers `render/` and `test/`.
- `src/project.ts`, `src/scene.tsx`, `src/timing.ts`, `src/brand.ts`, `src/assets.ts`, `src/components.tsx`.
- `src/templates/`: one file per template (facecam, who-we-are, your-company, your-figures, buyers, what-is-possible, privacy, book-meeting).
- `render/index.ts`, `render/render-timeline.ts`, `render/child.ts`, `render/job.ts`, `render/media.ts`, `render/previews.ts`.
- `test/render.test.ts`.

**Public exports** (`render/index.ts`)
```ts
renderTimeline(o: { input: RenderInput; outFile: string; chromePath: string; ffmpegPath: string; ffprobePath: string; timeoutMs?: number; onProgress?: (p: number) => void }): Promise<{ file: string; frames: number; durationS: number }>
renderTemplatePreviews(o: { outDir: string; chromePath: string; ffmpegPath: string; ffprobePath: string; brand: Brand; repoRoot: string }): Promise<string[]>
sampleTimeline(media: SampleMedia): Timeline
makeSampleMedia(storageDir: string, ffmpegPath: string, o: { introS: number; audioS: number }): Promise<SampleMedia>
```
- `renderTimeline` returns the absolute output path. `frames` and `durationS` are measured with ffprobe.
- `renderTemplatePreviews` writes `slide-1.jpg` to `slide-8.jpg` at 1280 px width. It writes each file under a temp name and then renames it.

**How the runner behaves**
- **Checks before a render:**
  - The timeline must be 30 fps and 1920 x 1080, and each segment `durationS` must be above 0.
  - Each path must stay inside `storageDir` (or `repoRoot` for the brand logos).
  - Each referenced file must exist, and the Chrome binary too. The error names each missing file and its use, for example `(slide 7 audio)`.
- **Temp files:** the job JSON, the output, an analyst still and the child's `TMPDIR` all go in one `mkdtemp` folder, which is removed in `finally`. Because `TMPDIR` points there, Revideo's temp folders and the Chrome profile are removed too.
- **Child process:** spawned detached with IPC. It exits if the parent dies. Progress comes back in 1% steps, and `onProgress(1)` is called at the end.
- **Timeout:** default is 120 s plus 4 times the video length. On timeout the runner kills the child's process group and every descendant with SIGKILL, including their own groups. This matters because puppeteer starts Chrome in a separate process group.
- **Output check:** the output must have a video and an audio stream, and its frame count must be within 1 of the plan.
- **Analyst still:** before the render, ffmpeg takes a square frame from the intro at 35% of its length. The "Book a meeting" slide shows it as the analyst's photo. It reaches the scene as a second base64 variable, `still`.

**How the scene behaves**
- **Media load failures:** the scene probes each image and media file first. An audio or video file that does not load fails the render fast with the file name, so it does not hang. An image that does not load is skipped:

  | Missing image | What shows instead |
  |---|---|
  | Buyer logo on "Who we are" | The buyer name in the tile |
  | Buyer logo on "Buyers" | The buyer's initials |
  | Screenshot | The company lines use the full width |
  | Analyst still | The analyst's initials |
- **Motion:** a 10-frame crossfade between segments, and short staggered fades inside each slide.

**Label keys the scene reads** (they match the shared i18n file)
- who-we-are: `headline` (with `{buyerCount}`), `buyers-heading`, `deals-heading`.
- your-company: `headline`, shown small above the company name.
- your-figures: `headline`, `revenue`, `profit`, `fiscal-year` (with `{year}`), `source`, and `ask-calculator` or `ask-form` depending on `variables.calculator`.
- buyers and what-is-possible: `headline`.
- privacy: `headline`, `point-1` to `point-3` (icons: eye with a slash, check mark, lock).
- book-meeting: `headline`, `line`.

**Deviations and conflicts**
- **PRD conflict:** the PRD says the scene is one TypeScript file. The task asked for one file per template, so I did that: there is still one scene in `scene.tsx`, and it imports the templates.
- **Extra end frame:** the output always has one more frame than the plan, and it is at the end. I checked the audio with silence detection: slide 3 audio starts at exactly 3.800 s, which is the planned time. The worker should keep using the planned slide times.
- **Runtime import from shared:** `previews.ts` imports `slideLabels` from `@mergero/shared/i18n` at runtime (Node side only), so the previews show the real English labels.
- **New style tokens:** I added some style values in `src/brand.ts` that are not in `config/mergero.json`: canvas background, hairline, tint, shadow, and the dark and blue slide themes.
- **Contract edits:** none.

**Verification**
- `pnpm --filter @mergero/scene typecheck`, `pnpm exec eslint packages/scene`: clean.
- `pnpm vitest run --project scene`: 4 of 4 pass in about 12 s:
  - The missing-file check.
  - A path outside the storage folder.
  - The timeout kill: Chrome was seen running, then no process was left, and the temp folder was empty.
  - A real render: length within one frame, H.264 1920 x 1080 and AAC streams, audio not silent (ebur128 above -40 LUFS). Its temp folder name has a space and "ä" in it, to test the URL encoding.
- **Stress renders:**
  - Text at every `SLOT_LIMITS` maximum from shared `slots.ts`, with long German and Finnish compound words.
  - Missing logos, no screenshot, the "ask" layout.
  - A portrait intro video.
- **Speed:** a 156 s video (4681 frames) renders in 32.6 s on this Mac, with peak memory of about 875 MB. The 1080p output is about 3.5 Mb/s.

**Open issues**
- On Linux, Chrome running as root needs `--no-sandbox`. I did not add it.
- The Vite cache in `packages/scene/node_modules/.vite` is shared between renders. Two renders in separate processes on a cold cache could conflict; the worker runs one job at a time, so this should not happen now.
- `makeSampleMedia` uses the ffmpeg `drawtext` filter for the sample screenshot. That needs an ffmpeg build with freetype and fontconfig; the Homebrew build has both.
- The eslint ignore entry `packages/scene/output/**` is no longer used, because all output goes to temp folders.
