I fixed both findings. The layout now lives in one scene file, and the company name slot allows 95 characters without overflow. Typecheck and eslint are clean for my files, the scene tests pass (8 of 8) and the shared tests pass (281 of 281).

**scene-not-one-file**
- **Change:** `packages/scene/src/scene.tsx` now holds the brand constants, the themes, the asset loader, the shared components, the 8 slide layouts and the scene. I deleted `src/brand.ts`, `src/components.tsx`, `src/assets.ts` and `src/templates/*.tsx`. `project.ts` imports `CANVAS_BACKGROUND` from `scene.tsx`.
- **Kept:** `src/timing.ts` stays as a separate file, because the Node render runner imports it and Node type stripping cannot import a `.tsx` file. No edit in `render/**` was necessary.
- **Scope:** I also merged `assets.ts`, which your list did not name. It is used only by the scene, and without it `src/` is `project.ts`, `scene.tsx` and `timing.ts`.
- **Audit mismatch:** the audit fix said to record a decision and get the user's confirmation before a merge. I merged, because your task said to.
- **Server hash:** `sceneHash()` in `apps/server/src/jobs/render.ts` reads `src` recursively, so it still works. It will re-render the previews one time.
- **Verification:** after the pure merge, all 8 preview frames were byte-identical to a baseline render made before the change. The new test `packages/scene/test/layout.test.ts` checks that `src/` contains only those three files.

**long-company-name-blocks-forever**
- **Measurement:** Revideo lays out text in the browser, so I measured in headless Chrome with the same Geist woff2 files and the same text settings Revideo uses. Then I confirmed the results with real renders.
  - Worst cases: 10 long DACH and Nordic company names and 8 long person names, each as-is, in upper case, and with every letter replaced by W, M or Ö. Also runs of W, M and WM.
  - Company name, 60 px over 1680 px: 2 lines hold 44 characters, so the old limit of 60 already overlapped the body. 3 lines hold 70 and 4 lines hold 95. No smaller fixed size reaches 90 in 3 lines (48 px gives 85).
  - Realistic company names up to 92 characters take 2 lines, so they keep the current look.
  - Analyst name, facecam lower third, 46 px: before, the name did not wrap and had no maximum width, so 37 or more W characters ran past the right edge of the frame. Now it wraps at 1200 px, and 2 lines hold 51 characters.
  - Analyst name, slide 8 card, 40 px in 464 px: 4 lines hold 36, 5 lines hold 44 and 6 lines hold 51. The card fits 6 lines in the body height.
- **Layout changes in `scene.tsx`:**
  - Slide 3: the headline box grows from 2 lines to as many as the name needs. The scene gets the line count from Revideo's own layout through a hidden test text (`ctx.lines`). Each extra line makes the body 68 px shorter. The browser frame scales down (620, 564, 496 px high) and the lines column takes the free width (640, 730, 838 px). A name of 2 lines or fewer looks the same as before.
  - Slide 3 address bar: the address field now has `basis={0} minWidth={0}`, so a long URL is clipped inside the field. The German stress render showed the URL spilling past the field once the frame got narrower.
  - Slide 1: the lower third name wraps at 1200 px, and the blue bar grows 52 px for each extra line.
  - All slides: the scene sets `overflow-wrap: break-word` on the Revideo view, so a word too long for its box breaks inside the box. Normal text keeps the same line breaks.
  - `FONT_GLYPHS` now includes `ŁőŠ`, so the latin-ext part of Geist loads before layout. Before, names with such letters were measured with a fallback font.
- **Limits in `packages/shared/src/slots.ts`:** `your-company.company` 60 to 95, `facecam.name` 40 to 44, `book-meeting.name` 40 to 44.
- **Tests:**
  - `packages/shared/test/slots.test.ts`: the Brenner name passes; 95 W and 44 M characters pass; 96 and 45 give the expected reasons.
  - `packages/scene/test/layout.test.ts` renders slide 3 with 95 W characters and checks the pixels: no dark pixels in the side margins, a 4th headline line, a clear band between headline and body, and body content below it.
  - When I removed the headline growth or the word breaking, the test failed, so it catches both.

**Renders (under `/private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/scene-check/`)**
- `previews/`: slides 2 to 8 are byte-identical to the baseline in `before/`. Slide 1 differs by at most 2 of 255 in one 8 x 16 block at the right edge of the lower third, which is not visible.
- `frames-worst/`: 13 worst-case frames.
  - Company name: 94 and 95 characters of W, all caps, German words and M, with and without the screenshot.
  - Analyst name: 44 characters of W and M in the lower third and on the card.
- `frames-de/`, `frames-fi/`: German and Finnish text at the maximum length in every slot. I looked at every frame and nothing overflows or overlaps.
- Scripts: `previews.ts`, `worst.ts`, `stress.ts`, `measure/*.mjs`.

**Contract changes:** only the three `SLOT_LIMITS` values.

**Not fixed, outside my files**
- **Blocked names:** the analyst still cannot clear a `text_too_long` reason; names over 95 or 44 characters still block the deal. The audit's fix for that is on the server side: read the Pipedrive names again on ensure while the deal is not published, or add a display name to `ReviewPatch`.
- **Company lines:** `your-company.line` (90) is not safe for the W worst case. By the same widths, 90 W characters need about 5 lines per item, which is more than the body height, even before my change. Realistic German and Finnish lines fit. I did not change it, because checks, prompts, the fallback writer and the Review UI use that limit.
- **Docs:** `.planning/build-reports/scene.md` still lists the old files and the "PRD conflict" note. `architecture.md` could mention the growing slide 3 headline and the name wrap.

**Other agents**
- During my run, `render/previews.ts` failed the typecheck because another agent added `transcript` to the facecam variables. That agent fixed it; I did not edit it.
- Another agent is editing `test/render.test.ts` (it now imports `RenderInputError`), so I put my tests in the new file `test/layout.test.ts`.
