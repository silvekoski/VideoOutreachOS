FRONTEND STACK SPIKE REPORT (2026-09-26)

Spike app: /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/ui/app (a local git repo with 5 commits, one per step)
Research files: /private/tmp/claude-501/-Users-veikka-prompt-marketing-hackathon-monorepo/b2795bcd-edcc-40b7-bc69-7bc26c6f5c9a/scratchpad/spikes/ui/_research (amber-minimal.json, add.log, build.log, light.png, index.css.after-shadcn-add-amber-minimal, shadcn docs as .md)
Package manager: pnpm 10.13.1 on Node v26.3.0. The monorepo was not touched. Nothing was installed outside the spike folder except the npx cache and the shared pnpm store.

Final result: all 30 components installed. tsc, vite build, eslint and a real browser run all pass. There are two gotchas you must act on: the new CommandDialog crashes without a `<Command>` wrapper, and simple-icons has only 1 of the 4 brand icons.

1. VITE 7 + REACT 19 + TS

- VERIFIED: create-vite 8.x is the Vite 7 line. create-vite 9.x (latest 9.2.1) targets Vite 8.
  - Command: `npx -y create-vite@8.3.0 app --template react-ts --no-interactive`
  - The template pins vite ^7.3.1, @vitejs/plugin-react ^5.1.1, typescript ~5.9.3, react ^19.2.0 and eslint 9.
- VERIFIED peer dependencies (npm view) for @vitejs/plugin-react:
  - 4.7.0: vite "^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0"
  - 5.2.0: vite "^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0" (engines node ^20.19.0 || >=22.12.0)
  - 6.x (latest 6.1.1): vite "^8.0.0" only
  - Result: use @vitejs/plugin-react@^5 for Vite 7.
- VERIFIED installed versions: vite 7.3.6 (last 7.x; the npm "previous" tag, latest is 8.3.1), @vitejs/plugin-react 5.2.0, react and react-dom 19.3.0, typescript 5.9.3.
  - npm latest for typescript is 7.0.2. I did not test it (UNVERIFIED with typescript-eslint and shadcn).
- VERIFIED gotcha: create-vite writes `<!doctype html>` in lower case. Your CLAUDE.md wants `<!DOCTYPE html>`, so I fixed it in the spike.
- VERIFIED gotcha: pnpm 10 prints "Ignored build scripts: esbuild". Dev and build still work.

2. TAILWIND 4 + SHADCN INIT

- VERIFIED: tailwindcss 4.3.3 and @tailwindcss/vite 4.3.3 (peer vite "^5.2.0 || ^6 || ^7 || ^8").
- Final vite.config.ts (ran it):
```
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import Icons from "unplugin-icons/vite"
import { defineConfig } from "vite"
export default defineConfig({
  plugins: [react(), tailwindcss(), Icons({ compiler: "jsx", jsx: "react" })],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
})
```
- tsconfig.json and tsconfig.app.json both get `"baseUrl": "."` and `"paths": {"@/*": ["./src/*"]}`, as the shadcn Vite docs say. tsconfig.app.json types: `["vite/client", "unplugin-icons/types/react"]`.

"radix-nova" is a valid style:
- VERIFIED: https://ui.shadcn.com/schema.json lists 26 style values: "default", "new-york", and radix-, base- and aria- combined with vega, nova, maia, lyra, mira, luma, sera and rhea.
- Bases (CLI `--base`): radix, base, aria.
- VERIFIED: https://ui.shadcn.com/r/styles/radix-nova/button.json returns 200. /r/styles/nova/button.json returns 404.
- VERIFIED gotcha: the page https://ui.shadcn.com/docs/components-json is out of date. It still says only "new-york".

There is no `--style` flag and no `--base-color` flag:
- VERIFIED from `shadcn init --help` (shadcn 4.21.0). The flags are: -t/--template (next, start, vite, react-router, laravel, astro), -b/--base (base, radix, aria), -p/--preset [name], -y/--yes (default true), -d/--defaults, -f/--force, -c/--cwd, -n/--name, -s/--silent, --css-variables/--no-css-variables (default true), --monorepo/--no-monorepo, --rtl/--no-rtl, --pointer/--no-pointer, --reinstall/--no-reinstall.
- VERIFIED from the CLI source: the named presets are nova, vega, maia, lyra, mira, luma, sera and rhea. The nova preset sets baseColor neutral, iconLibrary lucide, font geist, menuAccent subtle and menuColor default.

Exact init command (VERIFIED, exit 0, no prompts), run inside the existing Vite project:
```
npx -y shadcn@4.21.0 init --base radix --preset nova --no-monorepo -y < /dev/null
```
VERIFIED traps:
- `--preset radix-nova` fails: "Invalid preset: radix-nova. Available presets: nova, vega, maia, lyra, mira, luma, sera, rhea".
- `--preset nova` without `--base` in a non-TTY run gives style "base-nova" (Base UI, not Radix).
- `-d` gives "base-nova". CLI help says `--preset=base-nova`, but the docs page still says `--preset=nova`.
- So `--base radix` is mandatory.
- UNVERIFIED (not run): for a new project, `npx shadcn@latest init -t vite --base radix --preset nova -n app`.

What init did (VERIFIED):
- It wrote components.json (shown in section 6).
- It wrote src/lib/utils.ts as `export { cn } from "cn"`.
- It rewrote src/index.css with the neutral oklch tokens and imports of tw-animate-css, shadcn/tailwind.css and @fontsource-variable/geist. The file has no final newline, and its `@layer base` indentation is broken.
- It detected pnpm from the lockfile and added these packages:
  - @fontsource-variable/geist ^5.3.0
  - class-variance-authority ^0.7.1
  - cn ^0.4.0
  - lucide-react ^1.48.0
  - radix-ui ^1.6.7
  - shadcn ^4.21.0 (runtime dependency, only for `@import "shadcn/tailwind.css"`)
  - tw-animate-css ^1.4.0

New in this CLI version (VERIFIED): clsx and tailwind-merge are gone.
- "cn" 0.4.0 (repo shadcn-ui/cn) is a drop-in replacement for twMerge(clsx()).
- All 30 generated components import `{ cn } from "cn"` directly. None import "@/lib/utils".
- For older projects the README gives `npx shadcn@latest migrate cn`.

3. COMPONENTS

Command (VERIFIED, exit 0):
```
npx -y shadcn@4.21.0 add -y button card table badge dialog sheet dropdown-menu select input textarea label tabs tooltip command popover sonner chart separator skeleton scroll-area sidebar avatar progress switch checkbox radio-group alert breadcrumb collapsible toggle-group < /dev/null
```
- VERIFIED: all 30 succeeded, with 0 failures.
- It also pulled in 3 extra files as registry dependencies: input-group.tsx (needed by command), toggle.tsx (needed by toggle-group) and src/hooks/use-mobile.ts (needed by sidebar).
- It added these packages: cmdk ^1.1.1, next-themes ^0.4.6 (needed by sonner), recharts 3.8.0 (exact pin, from the registry entry "recharts@3.8.0"), sonner ^2.0.8. No CSS change was needed.

Radix packaging (VERIFIED):
- It uses the single `radix-ui` 1.6.7 package. There are no top-level @radix-ui/* dependencies.
- Imports look like `import { Dialog as DialogPrimitive } from "radix-ui"` and `import { Slot } from "radix-ui"` (Button uses `Slot.Root`).
- 19 import forms are used: Avatar, Checkbox, Collapsible, Dialog, DropdownMenu, Label, Popover, Progress, RadioGroup, ScrollArea, Select, Separator, Slot, Switch, Tabs, Toggle, ToggleGroup and Tooltip.

Chart (VERIFIED):
- chart.tsx does `import * as RechartsPrimitive from "recharts"` and `import type { TooltipValueType } from "recharts"`.
- It type-checks and builds with recharts 3.8.0, and also with 3.10.1 (current latest; tested, then reverted).
- The BarChart rendered 4 bars in Chrome.
- Gotcha: recharts 3.8.0 has a peer dependency on react-is. pnpm installed it automatically (react-is 19.3.0). If the monorepo sets auto-install-peers=false, you must add react-is by hand.

Checks (all VERIFIED with exit 0):
- `pnpm lint`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npx tsc -b`
- `npx vite build` (vite v7.3.6, 2622 modules, dist JS 1,055.73 kB / 320.29 kB gzip, CSS 101.59 kB / 16.11 kB gzip, only the >500 kB chunk warning)
- `npx tsc --noEmit` at the root also exits 0, but it checks 0 files: tsconfig.json is solution-style (`"files": []`), so that pass means nothing. Use `tsc -b` or `-p tsconfig.app.json`.

Gotchas:
- VERIFIED: 12 generated files keep "use client" although rsc is false (avatar, command, dropdown-menu, label, radio-group, separator, sheet, sonner, switch, toggle-group, toggle, tooltip). Vite 7.3.6 gave no warning.
- VERIFIED: with the create-vite ESLint config, the generated code gives 6 lint errors:
  - react-refresh/only-export-components in badge, button, sidebar, tabs and toggle
  - react-hooks/set-state-in-effect in use-mobile.ts
  - Fix: add this override to eslint.config.js:
```
{ files: ['src/components/ui/**/*.tsx', 'src/hooks/use-mobile.ts'],
  rules: { 'react-refresh/only-export-components': 'off', 'react-hooks/set-state-in-effect': 'off' } }
```
- VERIFIED: SidebarInset renders a `<main>`. Do not put another `<main>` inside it.
- VERIFIED: the CLI tells you to wrap the app in `<TooltipProvider>`.

4. TWEAKCN AMBER MINIMAL

- VERIFIED: GET https://tweakcn.com/r/themes/amber-minimal.json returns HTTP 200 (application/json). It is a shadcn registry item: `{"$schema":"https://ui.shadcn.com/schema/registry-item.json","name":"amber-minimal","type":"registry:style","css":{...},"cssVars":{"theme":{...},"light":{...},"dark":{...}}}`

:root colors (cssVars.light):
- background: oklch(1.0000 0 0)
- foreground: oklch(0.2686 0 0)
- card: oklch(1.0000 0 0)
- card-foreground: oklch(0.2686 0 0)
- popover: oklch(1.0000 0 0)
- popover-foreground: oklch(0.2686 0 0)
- primary: oklch(0.7686 0.1647 70.0804)
- primary-foreground: oklch(0 0 0)
- secondary: oklch(0.9670 0.0029 264.5419)
- secondary-foreground: oklch(0.4461 0.0263 256.8018)
- muted: oklch(0.9846 0.0017 247.8389)
- muted-foreground: oklch(0.5510 0.0234 264.3637)
- accent: oklch(0.9869 0.0214 95.2774)
- accent-foreground: oklch(0.4732 0.1247 46.2007)
- destructive: oklch(0.6368 0.2078 25.3313)
- destructive-foreground: oklch(1.0000 0 0)
- border: oklch(0.9276 0.0058 264.5313)
- input: oklch(0.9276 0.0058 264.5313)
- ring: oklch(0.7686 0.1647 70.0804)
- chart-1: oklch(0.7686 0.1647 70.0804)
- chart-2: oklch(0.6658 0.1574 58.3183)
- chart-3: oklch(0.5553 0.1455 48.9975)
- chart-4: oklch(0.4732 0.1247 46.2007)
- chart-5: oklch(0.4137 0.1054 45.9038)
- sidebar: oklch(0.9846 0.0017 247.8389)
- sidebar-foreground: oklch(0.2686 0 0)
- sidebar-primary: oklch(0.7686 0.1647 70.0804)
- sidebar-primary-foreground: oklch(1.0000 0 0)
- sidebar-accent: oklch(0.9869 0.0214 95.2774)
- sidebar-accent-foreground: oklch(0.4732 0.1247 46.2007)
- sidebar-border: oklch(0.9276 0.0058 264.5313)
- sidebar-ring: oklch(0.7686 0.1647 70.0804)

.dark colors (cssVars.dark):
- background: oklch(0.2046 0 0)
- foreground: oklch(0.9219 0 0)
- card: oklch(0.2686 0 0)
- card-foreground: oklch(0.9219 0 0)
- popover: oklch(0.2686 0 0)
- popover-foreground: oklch(0.9219 0 0)
- primary: oklch(0.7686 0.1647 70.0804)
- primary-foreground: oklch(0 0 0)
- secondary: oklch(0.2686 0 0)
- secondary-foreground: oklch(0.9219 0 0)
- muted: oklch(0.2393 0 0)
- muted-foreground: oklch(0.7155 0 0)
- accent: oklch(0.4732 0.1247 46.2007)
- accent-foreground: oklch(0.9243 0.1151 95.7459)
- destructive: oklch(0.6368 0.2078 25.3313)
- destructive-foreground: oklch(1.0000 0 0)
- border: oklch(0.3715 0 0)
- input: oklch(0.3715 0 0)
- ring: oklch(0.7686 0.1647 70.0804)
- chart-1: oklch(0.8369 0.1644 84.4286)
- chart-2: oklch(0.6658 0.1574 58.3183)
- chart-3: oklch(0.4732 0.1247 46.2007)
- chart-4: oklch(0.5553 0.1455 48.9975)
- chart-5: oklch(0.4732 0.1247 46.2007) (same value as chart-3)
- sidebar: oklch(0.1684 0 0)
- sidebar-foreground: oklch(0.9219 0 0)
- sidebar-primary: oklch(0.7686 0.1647 70.0804)
- sidebar-primary-foreground: oklch(1.0000 0 0)
- sidebar-accent: oklch(0.4732 0.1247 46.2007)
- sidebar-accent-foreground: oklch(0.9243 0.1151 95.7459)
- sidebar-border: oklch(0.3715 0 0)
- sidebar-ring: oklch(0.7686 0.1647 70.0804)

Values that are not colors: radius 0.375rem, fonts Inter / JetBrains Mono / Source Serif 4, plus shadow-*, spacing 0.25rem and tracking-normal 0em.

- VERIFIED: `npx shadcn@4.21.0 add -y https://tweakcn.com/r/themes/amber-minimal.json` works, but I do not recommend it:
  - It changes --font-sans to "Inter, sans-serif", and Inter is not installed.
  - It adds entries to @theme inline that point at themselves, for example `--spacing: var(--spacing)`, `--shadow: var(--shadow)` and `--tracking-normal: var(--tracking-normal)`.
  - It sets radius to 0.375rem and adds letter-spacing to body.
  - I reverted it and copied only the 62 color values (31 in :root, 31 in .dark) with a script into the nova CSS. Geist and radius 0.625rem stay as they were.
- VERIFIED contrast (computed from oklch, primary is about #f59e0b):
  - Black on primary: 9.78:1
  - White sidebar-primary-foreground on primary: 2.15:1 (fails WCAG AA 1.4.3; level A is not affected)
  - Destructive text on white: 3.76:1

5. RUNTIME LIBRARIES

All checks in this section ran in Chrome on the dev server and on vite preview, unless marked otherwise.

next-themes 0.4.6 (peer react ^16.8 || ... || ^19):
- VERIFIED: it works in plain Vite. `setTheme` sets `class="light"|"dark"` on `<html>`, sets style.colorScheme and writes localStorage "theme".
- VERIFIED: a keyboard-only DropdownMenuRadioGroup switch works.
- VERIFIED gotcha: in React 19.3 dev you get the console error "Encountered a script tag while rendering React component...". Pass `scriptProps={{ type: "application/json" }}` to fix it. React's isScriptDataBlock skips non-JS types, and on the client that script never runs anyway.
- Because the script never runs, put a pre-paint script in the index.html head. The script (VERIFIED it runs) is below. That it stops a flash is UNVERIFIED by eye.
```
<script>(function(){try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()</script>
```
- main.tsx (VERIFIED):
```
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange scriptProps={{ type: "application/json" }}>
  <TooltipProvider><App /><Toaster /></TooltipProvider>
</ThemeProvider>
```

Sonner 2.0.8:
- VERIFIED: the shadcn sonner.tsx reads `useTheme()` from next-themes and passes it to `<Sonner theme>`.
- data-sonner-theme followed the theme: "dark" under system dark, "light" after the switch.
- The toast background comes from --popover. Call it with `import { toast } from "sonner"`, for example `toast.success("Video queued")`.

cmdk 1.1.1 through command.tsx (VERIFIED):
- Critical: the new CommandDialog does NOT wrap its children in `<Command>`. The old pattern crashes with "Cannot read properties of undefined (reading 'subscribe')" at CommandInput.
- The docs pattern works: `<CommandDialog open onOpenChange><Command><CommandInput/><CommandList>...</CommandList></Command></CommandDialog>`.
- Ctrl+K, filtering, Enter to select and toast all work.
- Minor: the sr-only DialogTitle "Command Palette" is rendered outside DialogContent, so the h2 stays in the page while the dialog is closed.

lottie-web 5.13.0:
- VERIFIED: use `import lottie from "lottie-web/build/player/lottie_light"`. It is typed through lottie_light.d.ts, uses the SVG renderer only and has no eval. The package has no "exports" map, so deep imports work.
- VERIFIED: `import lottie from "lottie-web"` gives the Vite warning "Use of eval in .../lottie.js is strongly discouraged" and adds about 307 kB minified.
- Signature: `lottie.loadAnimation<T extends 'svg'|'canvas'|'html'>({ container: Element, renderer?, loop?: boolean|number, autoplay?, animationData? | path?, rendererSettings? }): AnimationItem`
- AnimationItem methods include `goToAndStop(value, isFrame?)`, `totalFrames`, `destroy()` and `addEventListener("DOMLoaded", cb)`.

Reduced motion:
- VERIFIED pattern: a `useSyncExternalStore` hook on `matchMedia("(prefers-reduced-motion: reduce)")`. When it matches, call loadAnimation with `loop: false, autoplay: false`, then on "DOMLoaded" call `goToAndStop(totalFrames - 1, true)`. Destroy the animation in the effect cleanup; StrictMode left 1 SVG.
- VERIFIED by overriding matchMedia: the frame stayed static with reduced motion on, and it animated with reduced motion off.
- There is no reduced-motion handling in tw-animate-css or in the components. shadcn/tailwind.css only covers `.shimmer`.
- I added a global `@media (prefers-reduced-motion: reduce)` rule in `@layer base`. It is in the built CSS (VERIFIED). I did not test it with browser media emulation (UNVERIFIED at runtime).

Fonts (VERIFIED in document.fonts):
- CSS: `@import "@fontsource-variable/geist";` and `@import "@fontsource-variable/geist-mono";` (a JS `import "@fontsource-variable/geist"` also resolves through the exports map).
- The families are 'Geist Variable' and 'Geist Mono Variable', weight 100 900. Italic is available as `/wght-italic.css`.
- Theme settings: `--font-sans: 'Geist Variable', sans-serif; --font-mono: 'Geist Mono Variable', monospace;`

simple-icons 16.32.0 (3461 icons):
- VERIFIED: only WhatsApp exists. Use `import { siWhatsapp } from "simple-icons"` (title "WhatsApp", slug "whatsapp", hex "25D366", type `SimpleIcon`). It tree-shakes: no other icon was in the bundle.
- These three names are missing:
  - siLinkedin: removed in v14.0.0 (issue #11372)
  - siMicrosoftteams: removed in v13.0.0 with all Microsoft icons after Microsoft legal (issue #11236)
  - Pipedrive: was never included (0 issues found)
- Alternative (VERIFIED in build and render), Iconify "logos" through unplugin-icons 24.0.0:
  - Install: `pnpm add -D unplugin-icons @iconify-json/logos @svgr/core @svgr/plugin-jsx`
  - Use `import LogosPipedrive from "~icons/logos/pipedrive"`, `~icons/logos/linkedin-icon`, `~icons/logos/microsoft-teams` and `~icons/logos/whatsapp-icon`.
  - LinkedIn brand guidelines restrict logo use.

6. FINAL FILES

src/components/ui (32 files): alert, avatar, badge, breadcrumb, button, card, chart, checkbox, collapsible, command, dialog, dropdown-menu, input-group, input, label, popover, progress, radio-group, scroll-area, select, separator, sheet, sidebar, skeleton, sonner, switch, table, tabs, textarea, toggle-group, toggle, tooltip (all .tsx).

Other files in src: src/app.tsx, src/main.tsx, src/index.css, src/lib/utils.ts, src/hooks/use-mobile.ts, src/hooks/use-prefers-reduced-motion.ts, src/components/{brand-icon,lottie-player,mode-toggle}.tsx, src/assets/pulse.json.

components.json (as init wrote it, VERIFIED):
```
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/index.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
```

src/index.css (final). It is what init generated, plus the amber colors, geist-mono and the reduced-motion rule:
- Imports: `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css"; @import "@fontsource-variable/geist"; @import "@fontsource-variable/geist-mono";`
- `@custom-variant dark (&:is(.dark *));`
- `@theme inline {`
  - `--font-heading: var(--font-sans); --font-sans: 'Geist Variable', sans-serif; --font-mono: 'Geist Mono Variable', monospace;`
  - `--color-X: var(--X)` for sidebar-ring, sidebar-border, sidebar-accent-foreground, sidebar-accent, sidebar-primary-foreground, sidebar-primary, sidebar-foreground, sidebar, chart-5..1, ring, input, border, destructive, accent-foreground, accent, muted-foreground, muted, secondary-foreground, secondary, primary-foreground, primary, popover-foreground, popover, card-foreground, card, foreground, background
  - `--radius-sm: calc(var(--radius) * 0.6); --radius-md: calc(var(--radius) * 0.8); --radius-lg: var(--radius); --radius-xl: calc(var(--radius) * 1.4); --radius-2xl: calc(var(--radius) * 1.8); --radius-3xl: calc(var(--radius) * 2.2); --radius-4xl: calc(var(--radius) * 2.6);`
  - `}`
- `:root { ... }` has the exact light values from section 4 (without destructive-foreground), plus `--radius: 0.625rem;`
- `.dark { ... }` has the exact dark values from section 4 (without destructive-foreground).
- Base layer:
```
@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
  html { @apply font-sans; }
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
  }
}
```
The full verbatim file is at app/src/index.css.

Final package.json dependencies:
- @fontsource-variable/geist ^5.3.0
- @fontsource-variable/geist-mono ^5.3.0
- @tailwindcss/vite ^4.3.3
- class-variance-authority ^0.7.1
- cmdk ^1.1.1
- cn ^0.4.0
- lottie-web ^5.13.0
- lucide-react ^1.48.0
- next-themes ^0.4.6
- radix-ui ^1.6.7
- react ^19.2.0
- react-dom ^19.2.0
- recharts 3.8.0
- shadcn ^4.21.0
- simple-icons ^16.32.0
- sonner ^2.0.8
- tailwindcss ^4.3.3
- tw-animate-css ^1.4.0

devDependencies (template set plus these):
- vite ^7.3.6
- @vitejs/plugin-react ^5.2.0
- typescript ~5.9.3
- unplugin-icons ^24.0.0
- @iconify-json/logos ^1.2.14
- @svgr/core ^8.1.0
- @svgr/plugin-jsx ^8.1.0

Sources:
- https://ui.shadcn.com/docs/cli
- https://ui.shadcn.com/docs/components-json
- https://ui.shadcn.com/docs/installation/vite
- https://ui.shadcn.com/schema.json
- https://ui.shadcn.com/docs/changelog/2025-12-shadcn-create
- https://ui.shadcn.com/docs/changelog/2026-07-react-aria
- https://ui.shadcn.com/docs/components/radix/command
- https://tweakcn.com/r/themes/amber-minimal.json
- https://github.com/simple-icons/simple-icons/issues/11236
- https://github.com/simple-icons/simple-icons/issues/11372
- https://github.com/unplugin/unplugin-icons
- https://api.iconify.design/logos.json
