import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Lang } from '@mergero/shared'
import { z } from 'zod'
import { escapeHtml, scriptJson } from './escape.ts'

export type Entry = 'admin' | 'video'
export interface AssetOptions {
  lang?: Lang
}
export type AssetTags = (entry: Entry, options?: AssetOptions) => string

export interface ViteOptions {
  production: boolean
  devUrl: string
  distDir: string
}

const ENTRY_SOURCES: Record<Entry, string> = {
  admin: 'src/admin/main.tsx',
  video: 'src/video/main.tsx',
}

const manifestSchema = z.record(
  z.string(),
  z.object({
    file: z.string().min(1),
    imports: z.array(z.string()).optional(),
    css: z.array(z.string()).optional(),
  }),
)

type Manifest = z.infer<typeof manifestSchema>

const languageModule = (lang: Lang) => `/packages/shared/src/i18n/${lang}.ts`

function readManifest(distDir: string): Manifest {
  const file = path.join(distDir, '.vite', 'manifest.json')
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`The Vite manifest ${file} is missing. Run "pnpm build" before the production start.`, { cause: error })
  }
  const parsed = manifestSchema.safeParse(JSON.parse(text))
  if (!parsed.success) throw new Error(`The Vite manifest ${file} is not valid:\n${z.prettifyError(parsed.error)}`)
  return parsed.data
}

function devTags(devUrl: string, entry: Entry): string {
  const base = escapeHtml(devUrl)
  return [
    `<script type="module">
import RefreshRuntime from ${scriptJson(`${devUrl}/@react-refresh`)}
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => (type) => type
window.__vite_plugin_react_preamble_installed__ = true
</script>`,
    `<script type="module" src="${base}/@vite/client"></script>`,
    `<script type="module" src="${base}/${ENTRY_SOURCES[entry]}"></script>`,
  ].join('\n')
}

function productionTags(manifest: Manifest, entry: Entry, options: AssetOptions): string {
  const key = ENTRY_SOURCES[entry]
  const chunk = manifest[key]
  if (!chunk) throw new Error(`The Vite manifest has no entry ${key}. Run "pnpm build" again.`)
  const css = new Set<string>()
  const preload = new Set<string>()
  const seen = new Set<string>()
  const visit = (name: string, root: boolean) => {
    const item = manifest[name]
    if (!item || seen.has(name)) return
    seen.add(name)
    for (const file of item.css ?? []) css.add(file)
    if (!root) preload.add(item.file)
    for (const imported of item.imports ?? []) visit(imported, false)
  }
  visit(key, true)
  const { lang } = options
  const strings = lang === undefined ? undefined : Object.keys(manifest).find((name) => name.endsWith(languageModule(lang)))
  if (strings !== undefined) visit(strings, false)
  return [
    ...[...css].map((file) => `<link rel="stylesheet" crossorigin href="/${escapeHtml(file)}">`),
    `<script type="module" crossorigin src="/${escapeHtml(chunk.file)}"></script>`,
    ...[...preload].map((file) => `<link rel="modulepreload" crossorigin href="/${escapeHtml(file)}">`),
  ].join('\n')
}

export function viteAssets(options: ViteOptions): AssetTags {
  if (!options.production) return (entry) => devTags(options.devUrl, entry)
  let manifest: Manifest | null = null
  return (entry, assetOptions = {}) => {
    manifest ??= readManifest(options.distDir)
    return productionTags(manifest, entry, assetOptions)
  }
}
