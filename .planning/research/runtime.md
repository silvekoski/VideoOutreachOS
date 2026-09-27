RUNTIME SPIKE REPORT (Node v26.3.0, darwin arm64, macOS 27.0, pnpm 10.13.1, npm 11.16.0, ffmpeg/ffprobe 8.0.1). Date: 2026-09-26.
All spike code is under /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/runtime (called SPIKE below).

======================================================================
1. better-sqlite3
======================================================================
* Latest is 13.0.3 (published 2026-08-05). It bundles SQLite 3.53.4 and needs node >=22. VERIFIED (npm view, ran `select sqlite_version()`).
* Prebuilt or built from source: prebuilt, with no download and no compile. Since 13.0.0 (2026-07-21) the package uses N-API (node-addon-api ^8, NAPI_VERSION=10). The npm tarball itself ships `prebuilds/{darwin-arm64,darwin-x64,linux-x64,linux-arm64,linuxmusl-x64,linuxmusl-arm64,win32-x64,win32-arm64}.node`. prebuild-install is gone, there is no install script, and `"gypfile": false`. VERIFIED (release notes, package contents, `require.cache` shows `better-sqlite3/prebuilds/darwin-arm64.node` loaded).
* `npm install better-sqlite3@13.0.3`: 0.8 s, 2 packages (plus node-addon-api 8.9.2), unpacked size 27.3 MB because it holds all 8 binaries. VERIFIED.
* pnpm 10.13.1 still prints "Ignored build scripts: better-sqlite3" because it sees binding.gyp. The module works without approval. To silence the warning, add `ignoredBuiltDependencies: [better-sqlite3]` in pnpm-workspace.yaml (VERIFIED, warning gone). If you allow it with `onlyBuiltDependencies`, node-gyp runs, but binding.gyp becomes `type: none` when a prebuild exists, so nothing compiles (VERIFIED: install took 0.2 s and build/Release has no .node file). A source build on platforms with no prebuild is UNVERIFIED here (release notes only).
* @types/better-sqlite3 is 9.6.0. I did not check whether it covers the new 13.x APIs (db.explain, stmt.toString). UNVERIFIED.
* API behavior (all VERIFIED by running SPIKE/sqlite/basic.mjs):
  `new Database(path, { timeout })`: timeout is busy_timeout in ms and defaults to 5000 (`db.pragma('busy_timeout', { simple: true })` returned 5000).
  `db.pragma('journal_mode = WAL')` returns `[ { journal_mode: 'wal' } ]`. With `{ simple: true }` it returns `'wal'`.
  `db.transaction(fn)` returns a callable. A throw inside rolls back (count stayed 1000). It also has `.deferred()`, `.immediate()`, `.exclusive()` variants.
  `stmt.run(...)` returns `{ changes: 1, lastInsertRowid: 1001 }`.
  `await db.backup(destPath, { progress?: (p) => number | undefined, attached?: 'main' })` resolves `{ totalPages: 8, remainingPages: 0 }`. The backup contains the WAL content (1001 rows), and the copied file header keeps WAL mode. The destination directory must exist, or you get a TypeError. The value that progress returns sets the pages per step (source: lib/methods/backup.js).
* Two-process test (SPIKE/sqlite/{setup,writer,claimer,verify}.mjs). Setup: WAL, synchronous=NORMAL, 3 s runs. The writer inserts in a tight autocommit loop. The claimer runs this, which is VERIFIED code:
    const claim = db.transaction((worker) => {
      const ids = pick.all().map((r) => r.id);   // select id from jobs where status='pending' order by id limit 10
      /* 2 ms busy spin to hold the lock */
      let n = 0; for (const id of ids) n += mark.run(worker, new Date().toISOString(), id).changes; // ... where id = ? and status = 'pending'
      return n;
    });
    claim.immediate(`w${process.pid}`);
  Results (VERIFIED):
  - timeout 0, 1 writer + 1 claimer: writer 4641 ok and 356,546 SQLITE_BUSY. Claimer 1353 tx ok and 2698 SQLITE_BUSY. `err.code === 'SQLITE_BUSY'`, message "database is locked".
  - timeout 5000, same load: 0 SQLITE_BUSY on both sides. But the writer's worst single insert waited 2962 ms (claimer worst 69 ms). The SQLite busy handler polls with backoff; it is not a fair queue. A process that takes the write lock again in a tight loop starves the other one.
  - timeout 5000, 1 writer + 2 claimers that pause 20 ms between claims: 0 BUSY. Claimed 350 + 330 = 680 rows, all distinct, no double claim. Claimer worst wait 684 ms, writer worst 10 ms.
  - timeout 0, same load: writer 5022 BUSY, claimers 108 and 111 BUSY.
  - Gotcha: a read-then-write in `BEGIN DEFERRED` after another connection has committed throws SQLITE_BUSY_SNAPSHOT at once (0.3 ms), and busy_timeout does not help (SPIKE/sqlite/snapshot.mjs). Use `.immediate()` for claim transactions.
* Side note: `node:sqlite` DatabaseSync works in Node 26.3.0 with no warning and bundles SQLite 3.53.2. VERIFIED by running it; I did not evaluate it further.

======================================================================
2. Hono 4 + @hono/node-server 2.x
======================================================================
* Versions: hono 4.13.9, @hono/node-server 2.1.1 (2026-08-14). node-server needs node >=20 and has peer dependency hono ^4. v2 has two breaking changes: Node 18 support is gone, and `@hono/node-server/vercel` is removed. The public API is otherwise the same. VERIFIED (release notes).
* Package exports: `.`, `./serve-static`, `./utils/*`, `./conninfo`, `./early-hints`. VERIFIED.
* `import { serve } from '@hono/node-server'`
  `serve(options: Options, listeningListener?: (info: AddressInfo) => void): ServerType`, where ServerType = http.Server | Http2Server | Http2SecureServer.
  `Options = { fetch: FetchCallback; port?: number (default 3000); hostname?: string; overrideGlobalObjects?: boolean; autoCleanupIncoming?: boolean; websocket?: { server: WebSocketServerLike }; serverOptions?; createServer? }`.
  Also exported: `createAdaptorServer(options)` and `getRequestListener(fetchCallback, { hostname?, errorHandler?, overrideGlobalObjects?, autoCleanupIncoming? })`. VERIFIED (dist/index.d.mts, dist/index.mjs: `server.listen(options?.port ?? 3e3, ...)`).
* `import { serveStatic } from '@hono/node-server/serve-static'`. Options: `{ root?, path?, index?, precompressed?, rewriteRequestPath?, onFound?, onNotFound? }`. `root` is relative to process.cwd(). The built-in serveStatic already handles Range: curl gave 206 with Content-Range and 416 with `bytes */size`. It sets Accept-Ranges only on ranged responses, not on a plain 200. VERIFIED (curl and source).
* Custom route, VERIFIED under `node server.ts` (native type stripping). Full file: SPIKE/hono/server.ts.
    const fileBody = (path: string, range?: { start: number; end: number }) =>
      Readable.toWeb(createReadStream(path, range)) as ReadableStream<Uint8Array>;
    app.use('*', async (c, next) => { await next(); c.header('X-Robots-Tag', 'noindex, nofollow, noarchive'); });
    app.get('/v/:file{.+\\.mp4}', async (c) => {
      const path = resolve(MEDIA_DIR, c.req.param('file'));
      if (!path.startsWith(MEDIA_DIR + '/')) return c.notFound();
      const st = await stat(path).catch(() => null);
      if (!st?.isFile()) return c.notFound();
      const size = st.size;
      c.header('Accept-Ranges', 'bytes');
      const rangeHeader = c.req.header('Range');
      const range = rangeHeader ? parseRange(rangeHeader, size) : null; // /^bytes=(\d*)-(\d*)$/, suffix, open-ended, clamp end; multi-range -> null (ignored)
      if (range === 'unsatisfiable') { c.header('Content-Range', `bytes */${size}`); c.header('Content-Length', '0'); return c.body(null, 416); }
      c.header('Content-Type', 'video/mp4');
      c.header('Cache-Control', 'public, max-age=3600');
      c.header('Last-Modified', st.mtime.toUTCString());
      const head = c.req.method === 'HEAD';
      if (range) {
        c.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
        c.header('Content-Length', String(range.end - range.start + 1));
        return head ? c.body(null, 206) : c.body(fileBody(path, range), 206);
      }
      c.header('Content-Length', String(size));
      return head ? c.body(null, 200) : c.body(fileBody(path), 200);
    });
* curl results on an 8,616,094-byte file (VERIFIED):
  `curl -r 0-99`: 206, content-length 100, `content-range: bytes 0-99/8616094`, accept-ranges bytes, x-robots-tag present, bytes match the file.
  Full GET: 200, content-length 8616094, output identical to the file (cmp).
  `bytes=-500`: 206, last 500 bytes match.
  `bytes=0-99999999`: 206, clamped to `0-8616093`.
  `bytes=99999999-` and `bytes=-0`: 416, `content-range: bytes */8616094`, content-length 0.
  `bytes=0-1,5-6`: 200 full (multi-range is ignored, which RFC 9110 allows).
  HEAD: 200 with Content-Length. HEAD with a range: 206.
  Encoded traversal `..%2f..%2fetc%2fpasswd.mp4`: 404.
* Client abort: 3 curl runs aborted mid-stream (`--limit-rate 200k --max-time 1`). After that, the open stream count was 0 and lsof showed 0 file handles on the mp4. VERIFIED.
* HEAD gotcha: Hono sends HEAD to the GET handler (`c.req.method === 'HEAD'` inside it) and discards the body. A naive handler that always creates the stream leaks the ReadStream (opened 1, closed 0 after 500 ms). Check the method, as the route above does. VERIFIED (SPIKE/hono/head-check.ts).
* TS gotcha: `Readable.toWeb()` is typed `ReadableStream<any>` from node:stream/web. With TypeScript 7.0.2 and @types/node 26.6.3, `c.body(Readable.toWeb(rs), 200)` fails with TS2769, and `new Response(Readable.toWeb(rs))` fails with TS2345. The cast `as ReadableStream<Uint8Array>` passes tsc. VERIFIED.
* Real browser check: system Chrome 153.0.8010.54, driven through Playwright `channel: 'chrome'` with Pixel 7 emulation. The video element sent `Range: bytes=0-` (206). For the file without faststart (moov at the end) it also sent `bytes=8585216-`. For the +faststart output it sent only `bytes=0-`. Chrome never sent a GET without Range. VERIFIED (SPIKE/pw/beacon.mjs, SPIKE/pw/faststart.mjs).
* sendBeacon: real Chrome `navigator.sendBeacon('/beacon', JSON.stringify(obj))` sends POST with `Content-Type: text/plain;charset=UTF-8` and Playwright resourceType "ping". The handler that follows parsed it, UTF-8 intact ("Jyväskylä" in the curl test). VERIFIED.
    app.post('/beacon', async (c) => { const raw = await c.req.text(); let p; try { p = JSON.parse(raw); } catch { return c.body(null, 400); } /* store p */ return c.body(null, 204); });
* X-Robots-Tag: the middleware shown above adds the header to 200, 206, 416, 404, 204 and HEAD responses. VERIFIED.

======================================================================
3. tsx and Node native type stripping
======================================================================
* tsx 4.23.15 (esbuild 0.28.2) on Node 26.3.0. Test: a simulated pnpm workspace (SPIKE/ts-ws). @demo/shared has `exports: { ".": "./src/index.ts", "./time": "./src/time.ts" }`, and apps/server depends on it with `"workspace:*"`. `tsx src/main.ts` runs. The same code also runs from `pnpm deploy --prod` output, where the package sits under node_modules/.pnpm. `node --import <tsx>/dist/esm/index.mjs src/main.ts` also works. tsx also accepts enum, parameter properties, extensionless imports, and a non-type import of an interface. VERIFIED.
* Node native stripping status: Stability 2 (Stable) since v25.2.0 and v24.12.0. `--experimental-transform-types` was removed in v26.0.0 (26.3.0 prints "bad option: --experimental-transform-types"). `process.features.typescript === 'strip'`. tsconfig.json is ignored. File extensions are mandatory. VERIFIED (nodejs.org/api/typescript.html and runs).
* pnpm symlink case: pnpm makes `apps/server/node_modules/@demo/shared -> ../../../../packages/shared`, and `node src/main.ts` WORKS. Node resolves the realpath, which is outside node_modules, so it strips types. VERIFIED.
* Node refuses with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` ("Stripping types is currently unsupported for files under node_modules") in three cases, all VERIFIED:
  (a) `node --preserve-symlinks src/main.ts`
  (b) the package is copied into node_modules
  (c) `pnpm --filter @demo/server deploy --prod <dir>` output
  Consequence: a production image built with pnpm deploy must use tsx, or the workspace packages must build to JS.
* Strip-only errors, VERIFIED:
  enum: `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` "TypeScript enum is not supported in strip-only mode".
  Parameter property: same code.
  `import './helper'` with no extension: `ERR_MODULE_NOT_FOUND`.
  `import { Thing }` where Thing is an interface and has no `type` keyword: SyntaxError "does not provide an export named 'Thing'".
  `import.meta.main` and `import.meta.dirname` work.
* This tsconfig passes tsc 7.0.2 (latest `typescript`) on server.ts: module/moduleResolution NodeNext, strict, noEmit, erasableSyntaxOnly, verbatimModuleSyntax, allowImportingTsExtensions, types ["node"]. VERIFIED.

======================================================================
4. Language detection (SPIKE/lang/run.mjs, samples in SPIKE/lang/samples.mjs)
======================================================================
* Samples: 18 business texts that I wrote, 3 per language, 34 to 58 words each. The dan and nob texts are parallel translations, which makes them a hard pair. This is a small sample. VERIFIED results for these texts only.
* Packages: franc 6.2.0 (2024-01-11, MIT), franc-all 7.2.0, franc-min 6.2.0, eld 2.1.0 (2026-08-13, Apache-2.0), tinyld 1.3.4 (2023-05-17, MIT, no release since).
* franc-min has no fin, nob, nno or dan data, so it cannot be used for this job. franc and franc-all include all six languages and nno. VERIFIED (data.js).
* franc API: `import { franc, francAll } from 'franc'`. `franc(text, { only?: string[], ignore?: string[], minLength?: number /* default 10 */ }) => 'fin' | ... | 'und'`. `francAll` returns `[lang, score][]`, where 1 is best. VERIFIED.
* Accuracy (correct/18) for full / first 12 words / first 6 words:
  franc only=[fin,swe,nob,dan,deu,eng]: 18 / 17 (nob->dan) / 15 (swe->nob, deu->eng, eng->dan)
  franc with no `only`: 16 (both misses nob->nno) / 15 / 9
  franc-all with `only`: same as franc
  eld/large with subset: 18 / 18 / 18
  eld/medium with subset: 18 / 18 / 17 (dan->nob)
  tinyld (normal) with `only`: 18 / 18 / 18
  tinyld/heavy with `only`: 17 (nob->dan) / 15 / 16
* Danish vs Norwegian margin in franc is very thin. `francAll` top-2 on full texts: nob texts [nob 1, dan 0.997 / 0.971 / 0.994]; dan texts [dan 1, nob 0.978 / 0.947 / 0.953]. tinyld separates the two clearly (nob 0.97 / 0.80 / 0.85 against da 0.02 to 0.03). VERIFIED.
* eld API: `import { eld } from 'eld/large'` (or 'eld/medium', 'eld/small', 'eld/extrasmall'). Call `eld.setLanguageSubset(['fi','sv','no','da','de','en'])` once, then `eld.detect(text)` returns `{ language: 'no', getScores(), isReliable() }`. Codes are ISO 639-1, and Norwegian is 'no' (no Bokmal/Nynorsk split). Cost: eld/large import 445 ms and RSS 535 MB; eld/medium 149 ms and 248 MB. VERIFIED.
* tinyld API: `import { detect, detectAll } from 'tinyld'` (also 'tinyld/heavy', 'tinyld/light'). `detect(text, { only: ['fi','sv','no','da','de','en'] })` returns ISO 639-1, with 'no' for Norwegian. `only` also accepts ISO 639-3 codes. Import takes 50 ms, RSS 100 MB. franc: 14 ms, 59 MB. VERIFIED.
* Suggestion (not a test result): use tinyld normal with `only`, or eld/medium with a subset. If you keep franc, always pass `only`, and treat a dan/nob result with a small francAll gap as ambiguous.

======================================================================
5. ffmpeg 8.0.1 (test media and scripts in SPIKE/media)
======================================================================
Meter used for every figure below (SPIKE/media/measure.sh):
  ffmpeg -hide_banner -nostats -i IN -map 0:a:0 -af ebur128=peak=true:framelog=quiet -f null -
(a) loudnorm to -16 LUFS
  Single pass:
    ffmpeg -y -i in.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 44100 -c:a libmp3lame -b:a 192k out.mp3
  Two pass, pass 1 (the JSON is on stderr; all values are strings):
    ffmpeg -hide_banner -nostats -i in.mp3 -map 0:a:0 -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null -
    -> { input_i, input_tp, input_lra, input_thresh, output_i, output_tp, output_lra, output_thresh, normalization_type, target_offset }
  Two pass, pass 2:
    ffmpeg -y -i in.mp3 -map 0:a:0 -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=<input_i>:measured_TP=<input_tp>:measured_LRA=<input_lra>:measured_thresh=<input_thresh>:offset=<target_offset>:linear=true:print_format=json" -ar 44100 -c:a libmp3lame -b:a 192k out.mp3
  mp4, audio only, video copied:
    ffmpeg -y -i in.mp4 -map 0:v:0 -map 0:a:0 -c:v copy -movflags +faststart -af "<pass-2 loudnorm string>" -ar 48000 -c:a aac -b:a 160k out.mp4
  Measured integrated loudness (ebur128), VERIFIED:
    voice.mp3 (flat), source -36.8 LUFS / TP -26.0: single pass -16.3 / TP -5.4; two pass "linear" -16.3 / TP -5.4 (loudnorm itself reported -15.95).
    speechlike.mp3 (dynamic), source -26.4 LUFS / LRA 10.2 / TP -7.3: single pass -17.0 / LRA 6.4 / TP -1.7; two pass fell back to "dynamic" -16.6 / LRA 6.0 / TP -1.7.
    src-1080p.mp4 audio, source -48.0: two pass "dynamic" -16.0 / TP -11.6. The video packets are bit-identical to the source (framemd5).
  Gotchas, VERIFIED:
    - Linear mode needs all of these: measured_lra != 0, measured_lra <= LRA target, and measured_tp + (I - measured_I) <= TP target (af_loudnorm.c, release/8.0, lines 806 to 816). If one fails, it silently uses dynamic mode. The pure tone with LRA 0.00 went dynamic.
    - Without -ar, the output was 96000 Hz for AAC and 48000 Hz for MP3, because loudnorm works at 192 kHz.
    - Silent input gives input_i "-inf". Guard for it (SPIKE/media/loudnorm.ts throws).
    - In zsh, quote '0:a:0?' or it is a glob error.
  The Node helper SPIKE/media/loudnorm.ts (execFile, parses the JSON between the last '{' and the last '}') ran under `node loudnorm.ts`.
(b) 1080p to 720p:
    ffmpeg -y -i in.mp4 -map 0:v:0 -map '0:a:0?' -vf "scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,format=yuv420p" -c:v libx264 -preset medium -crf 23 -profile:v high -level:v 4.0 -c:a aac -b:a 128k -ar 48000 -ac 2 -movflags +faststart out.mp4
  Result: h264 High level 40, 1280x720, yuv420p; AAC LC 48000 Hz stereo. Top-level atoms went from `ftyp free mdat moov` to `ftyp moov free mdat`. A 12 s clip took 1.2 s wall. A 1080x1920 portrait input gave 406x720. VERIFIED.
(c) Poster frame:
    ffmpeg -y -ss 3.5 -i in.mp4 -frames:v 1 -q:v 2 -update 1 poster.jpg
  Result: 1280x720 mjpeg yuvj420p (pc range), 62 KB. The input-seek frame framemd5 equals the output-seek frame, so it is frame-accurate. Without `-update 1` the image2 muxer warns but exits 0. With -ss beyond the duration, the exit code is 234 and no file is written, so clamp -ss. VERIFIED.
(d) Screenshot to 1200x630 JPEG (scale to cover, crop from the top, center horizontally):
    ffmpeg -y -i shot.png -vf "scale=1200:630:force_original_aspect_ratio=increase:flags=lanczos,crop=1200:630:(iw-ow)/2:0,format=yuv420p" -color_range pc -frames:v 1 -q:v 3 -update 1 og.jpg
  Tested with 1440x2400 (scaled to 1200x2000, top 630 rows kept; top-row md5 equals the uncropped scale), 1280x720 and 2560x1080: all gave 1200x630. Output is yuvj420p, 24.4 KB. Without the `format` step you get yuvj444p at 39.4 KB. `format=yuvj420p` gives the same pixels (PSNR inf) but prints "deprecated pixel format used". VERIFIED.
(e) Duration:
    ffprobe -v error -show_entries format=duration -of json in.mp3   ->   {"format":{"duration":"15.000000"}}   (a string)
  Gotcha: a VBR mp3 with no Xing header (`-write_xing 0`) gives the warning "Estimating duration from bitrate" and reports 17.638062 s for a 20.0 s file. An exact alternative:
    ffprobe -v error -select_streams a:0 -count_packets -show_entries stream=nb_read_packets,sample_rate -of json in.mp3
  This gave 767 packets * 1152 / 44100 = 20.035 s, which matches the decode time of 20.03 s. VERIFIED. 1152 samples per frame applies to MPEG-1 Layer III (32/44.1/48 kHz). For lower sample rates it is 576 (UNVERIFIED, from the spec, not tested).

======================================================================
6. Playwright 1.63.0
======================================================================
* `import { devices } from 'playwright'` has 207 descriptors. Each also has a "<name> landscape" variant. VERIFIED.
  Android Chrome: 'Pixel 7' (Android 14, UA Chrome/153.0.8010.12, viewport 412x839, DPR 2.625), 'Pixel 10' (Android 16, 360x732, DPR 3), 'Galaxy S24' (360x780, DPR 3). defaultBrowserType is chromium.
  iPhone Safari: 'iPhone 15' (393x659, DPR 3, UA iPhone OS 17_5 Version/26.6), 'iPhone 16', 'iPhone 17' (402x681), 'iPhone 17 Pro' (402x681), 'iPhone Air', 'iPhone 17e'. defaultBrowserType is webkit.
* ~/Library/Caches/ms-playwright contains chromium-1208, chromium-1234, chromium_headless_shell-1208, chromium_headless_shell-1234 and ffmpeg-1011. WebKit is NOT installed. VERIFIED.
* Playwright 1.63.0 expects chromium 1243 (Chrome for Testing 153.0.8010.12), firefox 1543 and webkit 2359 (WebKit 26.6). So its chromium is missing too. VERIFIED (browsers.json, `npx playwright install --dry-run`).
* WebKit size (not installed). The host (macOS 27.0 arm64) maps to https://cdn.playwright.dev/dbazure/download/playwright/builds/webkit/2359/webkit-mac-26-arm64.zip, and the target is ~/Library/Caches/ms-playwright/webkit-2359. The download is 81.9 MB and it unpacks to 296.7 MB (7115 entries; I read the zip index with an HTTP Range request). For reference, chromium-1243 is 191.0 MB zip / 375.6 MB unpacked, and chromium_headless_shell-1243 is 98.8 MB / 204.7 MB. VERIFIED.
* `chromium.launch({ channel: 'chrome' })` uses the installed Google Chrome 153.0.8010.54 with no download, and it worked for the section 2 tests. VERIFIED.

======================================================================
Files (all absolute)
======================================================================
/private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/runtime/sqlite/basic.mjs, setup.mjs, writer.mjs, claimer.mjs, verify.mjs, snapshot.mjs
/private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/runtime/hono/server.ts, head-check.ts, inline-body.ts, tsconfig.json
/private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/runtime/ts-ws/ (workspace), ts-deploy/ (pnpm deploy output), ts-syntax/
/private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/runtime/lang/samples.mjs, run.mjs
/private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/runtime/media/loudnorm.ts, measure.sh, atoms.py
/private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/runtime/pw/devices.mjs, beacon.mjs, faststart.mjs
The spike folder uses 244 MB. The monorepo was not touched. The Vale MCP tools were not available in this session, so this text did not get a Vale check.
