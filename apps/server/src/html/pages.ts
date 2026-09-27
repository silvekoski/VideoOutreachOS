import { readFileSync } from 'node:fs'
import path from 'node:path'
import { LANGUAGE_LOCALES, fill, normalizeLang, t } from '@mergero/shared'
import type { Lang, MergeroContact, VideoPageData } from '@mergero/shared'
import { brand } from '../domain/config.ts'
import { env } from '../env.ts'
import { escapeHtml, scriptJson } from './escape.ts'

const ADMIN_TITLE = 'Mergero video tool'

const THEME_SCRIPT =
  '<script>(function(){try{var t=localStorage.getItem("theme")||"dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()</script>'

const HEAD_START = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:,">`

export function adminDocument(assets: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD_START}
<title>${ADMIN_TITLE}</title>
${THEME_SCRIPT}
${assets}
</head>
<body>
<div id="root"></div>
</body>
</html>
`
}

export interface VideoDocumentInput {
  data: VideoPageData
  pageUrl: string
  imageUrl: string | null
  assets: string
}

function metaTag(attribute: 'name' | 'property', key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`
}

export function videoDocument({ data, pageUrl, imageUrl, assets }: VideoDocumentInput): string {
  const strings = t(data.pageLanguage)
  const title = fill(strings.page.documentTitle, { company: data.company })
  const ogTitle = fill(strings.og.title, { analyst: data.analystName, company: data.company })
  const image = imageUrl
    ? [
        metaTag('property', 'og:image', imageUrl),
        metaTag('property', 'og:image:type', 'image/jpeg'),
        metaTag('property', 'og:image:width', '1200'),
        metaTag('property', 'og:image:height', '630'),
      ]
    : []
  const meta = [
    metaTag('name', 'description', strings.og.description),
    metaTag('property', 'og:type', 'website'),
    metaTag('property', 'og:site_name', 'Mergero'),
    metaTag('property', 'og:locale', LANGUAGE_LOCALES[data.pageLanguage].replace('-', '_')),
    metaTag('property', 'og:url', pageUrl),
    metaTag('property', 'og:title', ogTitle),
    metaTag('property', 'og:description', strings.og.description),
    ...image,
    metaTag('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary'),
  ]
  return `<!DOCTYPE html>
<html lang="${escapeHtml(data.pageLanguage)}">
<head>
${HEAD_START}
<title>${escapeHtml(title)}</title>
${meta.join('\n')}
${assets}
</head>
<body>
<div id="root"></div>
<script type="application/json" id="bootstrap">${scriptJson(data)}</script>
</body>
</html>
`
}

export function preferredLanguage(header: string | undefined): Lang {
  const ranked = (header ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.split(';').map((item) => item.trim())
      const q = params.find((param) => param.startsWith('q='))
      const quality = q === undefined ? 1 : Number(q.slice(2))
      return { lang: normalizeLang(tag), quality: Number.isFinite(quality) ? quality : 0, index }
    })
    .filter((item) => item.lang !== null && item.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
  return ranked[0]?.lang ?? 'en'
}

let logoSrc: string | null = null

function logoDataUrl(): string {
  logoSrc ??= `data:image/svg+xml;base64,${readFileSync(path.resolve(env.repoRoot, brand().logoOnLight)).toString('base64')}`
  return logoSrc
}

function styles(): string {
  const colors = brand()
  return `:root{color-scheme:light;--ink:${colors.ink};--muted:${colors.muted};--brand:${colors.primary};--link:${colors.primary};--surface:${colors.surface};--card:${colors.white}}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--ink);font:1rem/1.55 Poppins,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1,h2{font-family:"Lora Variable",Lora,Georgia,serif}
main{max-width:36rem;margin:0 auto;padding:3rem 1.25rem 4rem}
.brand{display:block;height:1.5rem;width:auto;margin:0 0 2.5rem}
h1{margin:0 0 .75rem;font-size:1.75rem;line-height:1.2}
h2{margin:0 0 .5rem;font-size:1.0625rem}
p{margin:0 0 1rem}
.lead{font-size:1.0625rem}
section{margin-top:1.5rem;padding:1.25rem;border-radius:.75rem;background:var(--card)}
section p:last-child{margin-bottom:0}
address{font-style:normal}
.note{color:var(--muted);font-size:.9375rem}
a{color:var(--link);text-underline-offset:2px}
a:focus-visible{outline:3px solid var(--brand);outline-offset:2px;border-radius:2px}`
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//u, '').replace(/\/$/u, '')
}

function contactSection(lang: Lang, contact: MergeroContact): string {
  const phone = contact.phone.replace(/[^\d+]/gu, '')
  return `<section aria-labelledby="contact-heading">
<h2 id="contact-heading">${escapeHtml(t(lang).page.contactHeading)}</h2>
<address>
<strong>${escapeHtml(contact.company)}</strong><br>
${escapeHtml(contact.address)}<br>
<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a><br>
<a href="tel:${escapeHtml(phone)}">${escapeHtml(contact.phone)}</a><br>
<a href="${escapeHtml(contact.website)}">${escapeHtml(displayUrl(contact.website))}</a>
</address>
</section>`
}

function privacySection(lang: Lang, contact: MergeroContact): string {
  const strings = t(lang).page
  return `<section aria-labelledby="privacy-heading">
<h2 id="privacy-heading">${escapeHtml(strings.privacyHeading)}</h2>
<p class="note">${escapeHtml(strings.privacyText)}</p>
<p><a href="${escapeHtml(contact.privacyUrl)}">${escapeHtml(displayUrl(contact.privacyUrl))}</a></p>
</section>`
}

export interface MessagePageInput {
  lang: Lang
  title: string
  text: string
  contact?: MergeroContact | null
}

export function messagePage({ lang, title, text, contact = null }: MessagePageInput): string {
  const sections = contact ? `\n${contactSection(lang, contact)}\n${privacySection(lang, contact)}` : ''
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
${HEAD_START}
<title>${escapeHtml(title)} | Mergero</title>
<style>${styles()}</style>
</head>
<body>
<main>
<img class="brand" src="${logoDataUrl()}" alt="Mergero" width="500" height="68">
<h1>${escapeHtml(title)}</h1>
<p class="lead">${escapeHtml(text)}</p>${sections}
</main>
</body>
</html>
`
}
