SPIKE REPORT: Revideo 0.11.0 (2026-09-26)

The spike works. `renderVideo()` renders a 1920x1080, 30 fps mp4 with a video segment, two slides, mixed audio and the Geist font with åäöæøüß in about 2.4 s for 5 s of output (steady state, system Chrome, Apple Silicon). Four problems will affect the real tool:
- If a browser media load fails or Chrome dies, the render hangs forever.
- Some wrong media paths give a silent mp4 and no error.
- A backtick or `${...}` in a variable string breaks the render, or runs as JS in the render page.
- Local media outside the project only works as a full `http://localhost:<port>/@fs/<abs>` URL, with that folder in `server.fs.allow`.

VERIFIED means I ran it, or I read it in the installed package source or the official docs in the midrender/revideo repo. UNVERIFIED means neither.

====================================================================
0. VERSIONS AND ENVIRONMENT
====================================================================
- VERIFIED (npm registry): @revideo/core, @revideo/2d, @revideo/renderer, @revideo/vite-plugin, @revideo/ui and @revideo/ffmpeg are all 0.11.0. The `latest` tag is 0.11.0 (published 2026-07-10T01:36:52Z).
- VERIFIED: the registry also lists a stray "1.6.0" of @revideo/core, published 2024-03-25. Pin 0.11.0 exactly. `^1` or a "highest version" tool will pick the wrong package.
- VERIFIED: the repo moved to github.com/midrender/revideo. It is MIT, not archived, last push 2026-07-15T22:43:55Z. The docs.re.video URLs now redirect (301) to midrender.com/revideo/docs, and those pages are client-rendered. I read the docs from `packages/docs/src/content/*.mdx` in the repo instead.
- VERIFIED: pnpm resolved these transitive packages: vite 8.3.1 (renderer asks for ^8.1.2), puppeteer 25.12.0 (^25.3.0), posthog-node 5.54.1, fluent-ffmpeg 2.1.3 (deprecated).
- VERIFIED: Node v26.3.0 runs `node render.ts` directly (native type stripping). ESM named import from the CJS package works: `import {renderVideo} from '@revideo/renderer'`.
- VERIFIED: Chrome. Puppeteer 25.12.0 wants Chrome 154.0.8037.57. I did not download it. I used the system Chrome 153.0.8010.54 via `puppeteer.executablePath`, and it works.

====================================================================
1. FILES (all under the spike folder)
====================================================================
Root: /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/revideo/

Project folder: <root>/project/
- package.json
- tsconfig.json
- render.ts
- src/project.ts
- src/scene.tsx
- src/timeline.ts
- experiments/*.ts(x): paths, dynamic, crash, twice, parallel, telemetry, escape, exporter, no-audio, font, misc
- output/spike.mp4: the final render
- check/audio-check.py: per-window RMS and pitch analyzer

Media folder (outside the project root): <root>/media/
- intro.mp4
- slide-1.png, slide-2.png
- vo-1.mp3, vo-2.mp3, vo-long.mp3, vo-short.mp3
- intro-noaudio.mp4

Media generation commands (VERIFIED):
```
ffmpeg -f lavfi -i "testsrc=size=1280x720:rate=30:duration=2" -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=2" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest intro.mp4
ffmpeg -f lavfi -i "testsrc2=size=640x360" -frames:v 1 slide-1.png
ffmpeg -f lavfi -i "mandelbrot=size=640x360" -frames:v 1 slide-2.png
ffmpeg -f lavfi -i "sine=frequency=660:sample_rate=44100:duration=1.5" -c:a libmp3lame -b:a 128k vo-1.mp3
```
vo-2.mp3 is the same at 880 Hz. vo-long.mp3 is 550 Hz, 2.3 s. vo-short.mp3 is 990 Hz, 1.2 s.

====================================================================
2. package.json (VERIFIED working)
====================================================================
```json
{
  "name": "revideo-spike",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": { "render": "node render.ts", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@fontsource-variable/geist": "5.3.0",
    "@revideo/2d": "0.11.0",
    "@revideo/core": "0.11.0",
    "@revideo/renderer": "0.11.0",
    "@revideo/ui": "0.11.0",
    "@revideo/vite-plugin": "0.11.0"
  },
  "devDependencies": { "@types/node": "26.6.3", "typescript": "5.9.3" },
  "pnpm": {
    "onlyBuiltDependencies": ["@ffmpeg-installer/darwin-arm64", "@ffprobe-installer/darwin-arm64"],
    "ignoredBuiltDependencies": ["@revideo/telemetry", "puppeteer"]
  }
}
```

Why each extra item is there:
- @revideo/vite-plugin (VERIFIED): renderer 0.11.0 calls `require("@revideo/vite-plugin")` but does not list it as a dependency. Under pnpm the first run fails with MODULE_NOT_FOUND.
- @revideo/ui (VERIFIED): the vite-plugin editor partial calls `require.resolve('@revideo/ui')` and reads `editor.html`, even for headless renders. Without it: "Cannot find module '@revideo/ui'". The official template gets both packages through @revideo/cli and @revideo/ui devDependencies.
- @revideo/telemetry (VERIFIED): renderer requires it with no direct dependency. It resolves through pnpm's hidden hoist (`node_modules/.pnpm/node_modules`). That works with default hoisting but is fragile.
- onlyBuiltDependencies (VERIFIED): pnpm 10 blocks postinstall scripts. The @ffprobe-installer postinstall is `chmod u+x ffprobe`. Without it the bundled ffprobe fails with `spawn ... EACCES`.
- ignoredBuiltDependencies:
  - puppeteer: its postinstall would download Chrome for Testing into ~/.cache/puppeteer.
  - @revideo/telemetry: its postinstall writes a UUID to ~/.revideo/id.txt.

====================================================================
3. tsconfig.json and JSX (VERIFIED: tsc passes and catches a bad JSX prop)
====================================================================
```json
{
  "extends": "@revideo/2d/tsconfig.project.json",
  "compilerOptions": {
    "strict": true, "skipLibCheck": true, "noEmit": true,
    "allowImportingTsExtensions": true, "types": ["node"]
  },
  "include": ["src", "render.ts"]
}
```
- `@revideo/2d/tsconfig.project.json` sets `"jsx": "react-jsx"` and `"jsxImportSource": "@revideo/2d/lib"`. It extends the core config: module esnext, moduleResolution bundler, target es2020, experimentalDecorators, strict false.
- The Vite 8 JSX transform does not come from tsconfig. The vite-plugin projects partial sets `oxc: {jsx: {runtime: 'automatic', importSource: '@revideo/2d/lib'}}`, so no per-file pragma is needed.

====================================================================
4. src/project.ts (VERIFIED)
====================================================================
```ts
import {makeProject} from '@revideo/core';
import '@fontsource-variable/geist';
import scene from './scene';

export default makeProject({
  scenes: [scene],
  settings: {
    shared: {size: {x: 1920, y: 1080}, background: '#0b0b0f'},
    rendering: {fps: 30, exporter: {name: '@revideo/core/wasm'}},
  },
});
```
- FPS can only be set here, in `settings.rendering.fps` (default 30). `renderVideo` `projectSettings` only accepts range, background, size and exporter.
- makeProject defaults: size 1920x1080, fps 30, exporter '@revideo/core/wasm', range [0, Infinity], background 'FFFFFF00'.

====================================================================
5. src/timeline.ts and src/scene.tsx (VERIFIED)
====================================================================
```ts
export type VideoSegment = {kind: 'video'; src: string; duration?: number};
export type SlideSegment = {kind: 'slide'; title: string; image: string; audio: string; duration?: number};
export type Segment = VideoSegment | SlideSegment;
export type Timeline = {segments: Segment[]};

export const decodeTimeline = (base64: string): Timeline =>
  base64
    ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64), char => char.charCodeAt(0))))
    : {segments: []};
```

```tsx
import {Audio, Img, makeScene2D, Rect, Txt, Video} from '@revideo/2d';
import {createRef, useScene, waitFor} from '@revideo/core';
import {decodeTimeline} from './timeline';

const FONT = 'Geist Variable';

const mediaUrl = (absolutePath: string) =>
  new URL(`/@fs${encodeURI(absolutePath)}`, window.location.origin).href;

export default makeScene2D('main', function* (view) {
  const timeline = decodeTimeline(useScene().variables.get('timeline', '')());

  yield document.fonts.load(`700 96px "${FONT}"`, 'åäöæøüß');

  for (const segment of timeline.segments) {
    if (segment.kind === 'video') {
      const video = createRef<Video>();
      yield view.add(<Video ref={video} src={mediaUrl(segment.src)} size={['100%', '100%']} />);
      video().play();
      yield* waitFor(segment.duration ?? video().getDuration());
      video().pause();
      video().remove();
      continue;
    }
    const slide = createRef<Rect>();
    const audio = createRef<Audio>();
    yield view.add(
      <Rect ref={slide} size={['100%', '100%']} fill={'#1d3557'} layout direction={'column'} alignItems={'center'} justifyContent={'center'} gap={48}>
        <Txt text={segment.title} fontFamily={FONT} fontWeight={700} fontSize={96} fill={'#f1faee'} />
        <Img src={mediaUrl(segment.image)} width={640} radius={24} />
      </Rect>,
    );
    yield view.add(<Audio ref={audio} src={mediaUrl(segment.audio)} />);
    audio().play();
    yield* waitFor(segment.duration ?? audio().getDuration());
    audio().pause();
    audio().remove();
    slide().remove();
  }
});
```

API notes (VERIFIED):
- `useScene().variables.get<T>(name, initial)` returns an accessor `() => T`, not the value.
- `yield view.add(...)` waits for async resources (media canplay, image load). If you call `play()` or `getDuration()` without the yield, the log shows "Tried to access an asynchronous property before the node was ready".
- The scene can `yield` a plain Promise. GeneratorScene.next awaits it without advancing a frame.

====================================================================
6. render.ts (VERIFIED, `CHROME_PATH=... node render.ts`)
====================================================================
```ts
import {renderVideo} from '@revideo/renderer';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import type {Timeline} from './src/timeline.ts';

process.env.DISABLE_TELEMETRY = 'true';

const MEDIA_DIR = path.resolve(import.meta.dirname, '../media');
const media = (name: string) => path.join(MEDIA_DIR, name);
const FFPROBE = '/opt/homebrew/bin/ffprobe';

const timeline: Timeline = {
  segments: [
    {kind: 'video', src: media('intro.mp4'), duration: 2},
    {kind: 'slide', title: 'Hej Åsa, Mäkinen, Øster', image: media('slide-1.png'), audio: media('vo-1.mp3'), duration: 1.5},
    {kind: 'slide', title: 'Grüße Søren æ ö ü ß `${x}`', image: media('slide-2.png'), audio: media('vo-2.mp3'), duration: 1.5},
  ],
};

const started = performance.now();
const file = await renderVideo({
  projectFile: './src/project.ts',
  variables: {timeline: Buffer.from(JSON.stringify(timeline)).toString('base64')},
  settings: {
    outFile: 'spike.mp4',
    outDir: './output',
    workers: 1,
    logProgress: true,
    viteBasePort: 9100,
    ffmpeg: {ffmpegPath: '/opt/homebrew/bin/ffmpeg', ffprobePath: FFPROBE, ffmpegLogLevel: 'error'},
    puppeteer: {executablePath: process.env.CHROME_PATH},
    projectSettings: {size: {x: 1920, y: 1080}, exporter: {name: '@revideo/core/wasm'}},
    viteConfig: {server: {fs: {allow: [process.cwd(), MEDIA_DIR]}}, logLevel: 'warn'},
  },
});
console.log(`rendered ${file} in ${((performance.now() - started) / 1000).toFixed(2)} s`);
console.log(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels,duration', '-of', 'compact', file], {encoding: 'utf8'}));
```

Exact option types (VERIFIED from renderer `lib/server/render-video.d.ts`):
```ts
renderVideo({projectFile: string, variables?: Record<string, unknown>, settings?: RenderSettings}): Promise<string>

RenderSettings {
  outFile?: `${string}.mp4` | `${string}.webm` | `${string}.mov`;
  outDir?: string;                         // default './output', relative to process.cwd()
  ffmpeg?: {ffmpegPath?, ffprobePath?, ffmpegLogLevel?: 'quiet'|'panic'|'fatal'|'error'|'warning'|'info'|'verbose'|'debug'|'trace'};
  puppeteer?: LaunchOptions;               // spread into puppeteer.launch({headless: true, ...})
  workers?: number;                        // default 1
  logProgress?: boolean;
  projectSettings?: {range?: [number, number]; background?: string | null; size?: {x, y}; exporter?: ExporterSettings};
  viteBasePort?: number;                   // default 9000, worker i uses base + i
  viteServerOptions?: ...;                 // deprecated
  viteConfig?: vite InlineConfig;          // spread into createServer({configFile: false, plugins, ...viteConfig, server: {...}})
  progressCallback?: (worker: number, progress: number) => void;  // progress 0..1
}
```
- ExporterSettings is one of:
  - `{name: '@revideo/core/wasm'}`
  - `{name: '@revideo/core/ffmpeg', options: {format: 'mp4' | 'webm' | 'proRes'}}`
  - `'@revideo/core/image-sequence'`, which renderVideo rejects
- Also exported: `renderPartialVideo({projectFile, variables, settings, numWorkers, workerId}): Promise<{audioFile, videoFile}>`.

Behavior of these options (VERIFIED, source and runs):
- Return value is relative: "output/spike.mp4" (path.join(outDir, outFile)).
- Passing any `settings` object replaces the renderer's default settings object. The exporter then comes from the project (default wasm).
- If Vite 9100 is busy it takes the next free port, because strictPort is false.
- Puppeteer: the renderer always pushes `--single-process` into `settings.puppeteer.args`. It changes the array you passed in.
- `projectFile` is inserted as a raw import specifier. Server side it is also `path.join(process.cwd(), projectFile)`. The render must run with cwd set to the Revideo package folder. An absolute projectFile inside cwd also worked.
- `ffmpeg` settings go into a process-wide singleton, `ffmpegSettings` in @revideo/ffmpeg. `FFMPEG_PATH`, `FFPROBE_PATH` and `FFMPEG_LOG_LEVEL` env vars are read once, at module load.

====================================================================
7. RESULT, ffprobe OUTPUT AND TIMING (VERIFIED)
====================================================================
```
rendered output/spike.mp4 in 2.39 s   (3 runs: 2.39, 2.43, 2.39 s; first ever run 3.44 s; whole process about 3.6 s)
stream|index=0|codec_name=h264|codec_type=video|width=1920|height=1080|r_frame_rate=30/1|duration=5.033333
stream|index=1|codec_name=aac|codec_type=audio|sample_rate=48000|channels=2|r_frame_rate=0/0|duration=5.033000
format|duration=5.033333
```
- Detail: h264 Main, yuv420p, bt709, nb_frames=151. Audio: aac LC, 48 kHz stereo.

Audio mix check (check/audio-check.py, 0.25 s windows):
| Time | Content | Level |
|---|---|---|
| 0 to 2 s | 440 Hz (video's own track) | -24.1 dBFS |
| 2 to 3.5 s | 660 Hz (vo-1) | -24.6 dBFS |
| 3.5 to 5 s | 880 Hz (vo-2) | -24.5 dBFS |
| after 5.0 s | silence | |

So the video track audio and both mp3 clips are placed and mixed correctly.

Visual check (VERIFIED from extracted frames):
- The video frames match the source at 1.5 s. There are 63 distinct frames in 0 to 2.1 s, so the video plays and is not frozen.
- Slides show the Geist glyphs åäöæøüß.
- The literal text `${x}` renders as text.

Exporter comparison, same 5 s timeline (VERIFIED):
| Exporter | Time | Codec | Bitrate |
|---|---|---|---|
| wasm (WebCodecs + mp4-wasm) | 2.1 to 2.5 s | h264 Main | 846 kb/s |
| `{name:'@revideo/core/ffmpeg', options:{format:'mp4'}}` | 3.5 s | libx264 High | 222 kb/s |

Workers (VERIFIED): 1, 2 and 3 workers took 2.10, 2.28 and 2.77 s. Each worker starts its own Chrome and Vite server. The 3-worker output still has a correct audio mix and 151 frames.

Faststart (VERIFIED): the output mp4 atom order is ftyp, free, mdat, moov, so it is not faststart. For web delivery, remux with `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`.

Frame count (VERIFIED): output is often 1 frame longer than the timeline sum. The render range includes the end frame.
- 1 s scene: 31 frames
- 5 s timeline: 151 frames
- 5.5 s timeline: 166 frames
- slide-only 2.3 s: 69 frames (exact)
- one 2 s scene: 60 frames

Treat the total as plus or minus 1 frame. The cause of the inconsistency is UNVERIFIED.

====================================================================
8. LOCAL MEDIA PATHS (the important part)
====================================================================
How it works (VERIFIED from source):
- Img and Video frames load in the browser from the Vite server. Video uses the WebCodecs decoder for .mp4, .mov and unknown types, and ffmpeg for webm.
- Audio for Audio and Video nodes is mixed in Node by ffmpeg. The browser sends the raw `src()` string to `POST /audio-processing/generate-audio`. The server resolves it with @revideo/ffmpeg `resolvePath(outDir, src)`:
  - http://, https:// and data: URLs are used as they are.
  - Anything else becomes `path.join(outDir, '../public', src)`.
- So one src string must work in the browser and in server ffmpeg at the same time.

Test matrix (VERIFIED, experiments/paths.ts; outDir ./output; fs.allow = [cwd, mediaDir] unless noted):
| src form | Img | Audio | Video |
|---|---|---|---|
| `http://localhost:<port>/@fs/<abs>` (the scene builds it from `window.location.origin`) | works | works, audible in mix | works, frames and its audio track |
| `/@fs/<abs>` (root-relative) | works | loads in browser; server looks in `<project>/public/@fs/...`, ffprobe fails, generate-audio returns 500 | frames work; its audio is lost the same way |
| raw absolute `/Users/.../a.mp3` | rejects "Failed to load an image" | render HANGS | render HANGS |
| `file:///...` | rejects "Failed to load an image" | render HANGS | render HANGS |
| `viteConfig.publicDir = mediaDir` with `/vo-1.mp3` | works | server looks in `<outDir>/../public`, fails | frames work, audio fails |
| full URL but no `server.fs.allow` | Vite logs "The request id ... is outside of Vite serving allow list", Img rejects | (see first row: a failed audio load hangs) | (same) |

What happens after the root-relative /@fs audio failure (VERIFIED):
- With Homebrew ffmpeg 8: renderVideo throws "Input format lavfi is not available".
- With the bundled ffmpeg 4.4.1: renderVideo RESOLVES and the mp4 is completely SILENT (-120 dBFS). The only sign is a Node console line "error in request handler". The 500 also drops all other audio in that render. WasmExporter.generateAudio does not check `response.ok`, and the renderer then creates a silent track.

Recommendation (VERIFIED working):
- Pass absolute disk paths in the variables.
- In the scene, build `new URL('/@fs' + encodeURI(abs), window.location.origin).href`. The port is whatever Vite got, so this works with workers and parallel renders.
- Set `viteConfig.server.fs.allow = [process.cwd(), mediaDir]`. Setting fs.allow replaces Vite's default list, so keep cwd in it.
- Encoding of spaces and `#`: I used encodeURI, which leaves `#` and `?` as they are. Encode each path segment with encodeURIComponent to be safe. UNVERIFIED, not tested.
- Alternative (UNVERIFIED): a separate static HTTP server for the media folder, with http URLs in the variables.

====================================================================
9. CUSTOM FONT (VERIFIED)
====================================================================
- `import '@fontsource-variable/geist';` in project.ts. Vite injects the CSS, and the woff2 files are served from node_modules, which is inside the root.
  - Family name: 'Geist Variable'.
  - å ä ö æ ø ü ß are all in the latin subset (U+0000-00FF, file `geist-latin-wght-normal.woff2`).
- At scene start: `yield document.fonts.load('700 96px "Geist Variable"', 'åäöæøüß')`. The log confirmed the latin face status was "loaded".
- In an A/B test, the first frame was identical without the explicit load. Revideo waits by itself: Txt.draw awaits `document.fonts.ready`, and Layout collects fonts that are still loading. I keep the explicit load as a guard.
- `document.fonts.check()` is not proof that the font loaded. It returns true when no @font-face matches the family at all. Inspect `[...document.fonts]` status instead.
- The official docs pattern is a global.css with `@import url(...)` or `@font-face` imported in project.ts. For a font outside the project, the @font-face URL needs /@fs plus fs.allow (UNVERIFIED).

====================================================================
10. DYNAMIC DURATIONS (VERIFIED)
====================================================================
- There is no duration setting. Total length is whatever the scene generator yields. `Renderer.getNumberOfFrames()` runs `playback.recalculate()`, which runs the generator to completion.
- Test with durations omitted, vo-long 2.3 s and vo-short 1.2 s:
  - `yield view.add(<Audio/>)` then `audio().getDuration()` gave exactly 2.3 and 1.2. Video `getDuration()` gave 2.
  - Output: 5.533 s, 166 frames. Pitch windows: 440 Hz 0 to 2 s, 550 Hz 2 to 4.3 s, 990 Hz 4.3 to 5.5 s.
- Durations precomputed in Node with ffprobe and passed in the variables also work (main render).
- The generator runs about 5 to 9 times per render (recalculate, the media-asset dry run, the render pass). Keep it deterministic and free of side effects.

====================================================================
11. TELEMETRY (VERIFIED, source plus a fetch stub; nothing was sent)
====================================================================
- Package @revideo/telemetry 0.11.0 uses posthog-node ^5.39.2 (5.54.1 resolved).
  - Key `phc_YpKoFD7smPe4SXRtVyMW766uP9AjUwnuRJ8hh2EJcVv`, host `https://eu.posthog.com`.
  - The PostHog client is created at import and registers `process.on('beforeExit', shutdown)`, even when telemetry is disabled.
- Opt-out check: `process.env.DISABLE_TELEMETRY === 'true'`. It must be exactly the string "true" ("1" does not work), and it is read at each event, so setting it in code before render works.
- Events and call sites:
  - "revideo-server-started": vite-plugin metrics partial, at every configResolved, so every render and every worker.
  - "revideo-render-started": renderer, worker 0.
  - "revideo-error" with `{error: 'ffmpeg-not-found' | 'ffmpeg-sigsegv' | 'ffmpeg-error', message: err.message}`: @revideo/ffmpeg VideoFrameExtractor and FFmpegExporterServer. The ffmpeg error message can contain local file paths.
  - "revideo-cli-command" and "revideo-create-command" exist but are not used by the renderer.
- Captured with telemetry enabled: `POST https://eu.posthog.com/batch/` with body
  `{"api_key":"phc_...","batch":[{"event":"revideo-server-started","properties":{"version":"0.11.0","$lib":"posthog-node","$lib_version":"5.54.1","$is_server":true,"$geoip_disable":true},...,"distinct_id":"anonymous-user"},{"event":"revideo-render-started",...}]}`.
  - distinct_id is read from `~/.revideo/id.txt`. The telemetry postinstall writes a UUID there, which pnpm 10 blocks by default. Otherwise it is "anonymous-user".
- With `DISABLE_TELEMETRY=true`: 0 requests.
- Other file I/O: the vite-plugin settings partial reads `~/.revideo/settings.json`.

====================================================================
12. CRASHES, RUNNING TWICE, CONCURRENCY (VERIFIED)
====================================================================
| Case | Result |
|---|---|
| Exception thrown in the scene | renderVideo REJECTS with `Error('boom from scene')` after about 1.0 s (message only; the browser stack is lost). Browser and Vite are closed, and the process exits normally. |
| Chrome killed with SIGKILL mid-render | renderVideo NEVER settles (30 s watchdog fired). Nothing listens for a browser disconnect; the `browserError` hook is never called by the client. |
| Media that fails to load in the browser (404, 403, file://, raw path) for Audio or Video | HANG. Media.waitForCanPlay only logs "ERROR: Error loading video" and never resolves. Img rejects correctly. |
| Puppeteer launch failure (no executablePath and no downloaded Chrome) | Rejects with "Could not find Chrome (ver. 154.0.8037.57)...". The Vite server started in the same Promise.all is never closed, so the Node process does not exit. |
| Four sequential renderVideo calls in one process | All succeed, 1.2 to 1.6 s each. |
| Two concurrent renderVideo calls (Promise.all) | Both correct (2.300 s and 1.200 s outputs, correct pitches); Vite took two ports. Watch for shared state: the ffmpegSettings singleton and static VideoFrameExtractor maps. |
| Failed renders | Leave `<outDir>/<name>-0.mp4` and `<os.tmpdir()>/revideo-<name>-<worker>-<uuid>/`. I deleted the ones I created. |

Recommendation: run each render in a child process with a hard timeout, then kill the process tree. In-process try/catch does not cover a hang or a crash.

====================================================================
13. OTHER GOTCHAS
====================================================================
- Variables are injected into the page as JavaScript code (VERIFIED). rendererPlugin writes `project.variables = JSON.parse(\`${JSON.stringify(variables, escapeSpecialChars)}\`)` into a virtual module. The escaper does not escape backticks or `${`.
  - A title with a backtick is a Vite parse error ("Failed to parse source for import analysis") and the render HANGS.
  - A title `Dollar ${6*7} brace` rendered as "Dollar 42 brace". User text runs as JS in the render page, and that page can read any file under fs.allow through /@fs.
  - Fix used here (VERIFIED): pass base64(JSON) as the variable and decode in the scene.
- ffmpeg 8 and fluent-ffmpeg 2.1.3 do not work together (VERIFIED). Any `.inputFormat('lavfi')` fails with "Input format lavfi is not available", because ffmpeg 8 no longer lists lavfi in `-formats`. Result:
  - With /opt/homebrew/bin/ffmpeg, a render that has NO audio asset at all throws (the silent-track fallback fails).
  - The bundled @ffmpeg-installer/darwin-arm64 binary is ffmpeg 4.4.1 (the docs claim v6). It handles no-audio renders, but it hides audio failures as silence (section 8).
  - Choose one of these, then always check the result with an audio loudness check after render:
    - bundled 4.4 (needs the chmod postinstall allowed)
    - Homebrew 8, and make sure there is always at least one audio asset
- H.264 in the browser (VERIFIED works with Google Chrome 153): the wasm exporter and the default mp4 decoder use WebCodecs. Plain Chromium builds without proprietary codecs will not decode or encode H.264. Use Chrome or Chrome for Testing, not open-source Chromium (UNVERIFIED on Linux).
- `workers` gives no speedup for short videos on this Mac: each worker is a full Chrome plus Vite.
- The vite-plugin's editor, settings and ws partials all load for a headless render (it reads ~/.revideo/settings.json).
- Browser console output reaches Node stdout as `Worker 0: JSHandle:...` lines.

====================================================================
14. DISK
====================================================================
- node_modules is 288 MB (no Chrome download). This includes the bundled ffmpeg and ffprobe, about 55 MB.
- Nothing was written to ~/.revideo or ~/.cache/puppeteer.
