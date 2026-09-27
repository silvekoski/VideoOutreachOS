import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import {
  LANGUAGE_LOCALES,
  SLOT_LIMITS,
  checkLines,
  checkScript,
  checkTranslations,
  fill,
  formatMoney,
  linesOutputJsonSchema,
  linesOutputSchema,
  multiplesFor,
  resolveLanguage,
  scriptOutputJsonSchema,
  scriptOutputSchema,
  slideLabels,
  textLength,
  translationsOutputJsonSchema,
  translationsOutputSchema,
} from '@mergero/shared'
import type {
  BuyerScope,
  BuyerSlideItem,
  DealCardItem,
  DealScope,
  Financials,
  Lang,
  MgxBuyer,
  MgxClosedDeal,
  MgxData,
  ReviewReason,
  ScriptContext,
  ScriptSlideNumber,
  Segment,
  SlideSegment,
  TemplateName,
  Timeline,
  TranslationSource,
} from '@mergero/shared'
import { transaction } from '../db/index.ts'
import type { AnalystRow, DealRow } from '../db/rows.ts'
import { readyIntro, requireAnalyst } from '../domain/analysts.ts'
import { mergeroConfig } from '../domain/config.ts'
import { requireDeal, updateDeal } from '../domain/deals.ts'
import { LINES_SLOT, MIN_COMPANY_LINES, advance, recordReviewReasons, videoBasis } from '../domain/pipeline.ts'
import { createVersion, getTimeline, newestTimeline, updateVersion } from '../domain/timelines.ts'
import { log } from '../log.ts'
import { paths } from '../paths.ts'
import { NonRetryableError, errorText } from '../queue/index.ts'
import { calculatorFor } from '../video/valuation.ts'
import { askModel } from './ask-model.ts'
import type { ModelAnswer } from './ask-model.ts'
import { companyLinesPrompt, slideScriptPrompt, translateTextsPrompt } from './prompts.ts'
import { storageRelative, writeFileAtomic } from './storage.ts'
import type { JobContext, JobHandler } from './types.ts'

const FPS = 30
const WIDTH = 1920
const HEIGHT = 1080
const PAUSE_S = 0.4
const WHO_WE_ARE_BUYERS = 6
const WHO_WE_ARE_DEALS = 3
const SECTOR_BUYERS = 6
const SECTOR_DEALS = 2
const MAX_MODEL_TEXT = 20_000
const MEETING_MINUTES = 30
const LOGO_TIMEOUT_MS = 10_000
const LOGO_MAX_BYTES = 2_000_000
const LOGO_TYPES: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

type SlideVariables = SlideSegment['variables']
type CompanyVariables = Extract<SlideVariables, { template: 'your-company' }>

interface SlideContent {
  featured: MgxBuyer[]
  buyers: MgxBuyer[]
  buyerScope: BuyerScope
  recentDeals: MgxClosedDeal[]
  sectorDeals: MgxClosedDeal[]
  dealScope: DealScope
}

interface Written {
  lines: string[] | null
  screenshotFile: string | null
  scripts: Map<ScriptSlideNumber, { script: string; inputs: string }>
  failures: ReviewReason[]
}

function fits(slot: string, text: string): boolean {
  return textLength(text) <= (SLOT_LIMITS[slot] ?? Number.POSITIVE_INFINITY)
}

function filledLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean)
}

function slideSegment(timeline: Timeline, slide: number): SlideSegment | undefined {
  return timeline.segments.find((segment): segment is SlideSegment => segment.slide === slide && segment.template !== 'facecam')
}

function companyVariables(timeline: Timeline): CompanyVariables | null {
  const variables = slideSegment(timeline, 3)?.variables
  return variables?.template === 'your-company' ? variables : null
}

async function loadFinancials(ctx: JobContext, deal: DealRow): Promise<Financials> {
  const { businessId } = videoBasis(deal)
  if (!businessId) return { source: 'ask_in_form' }
  const record = await ctx.providers.financials.get(businessId)
  return record
    ? { source: 'asiakastieto', revenue: record.revenue, profit: record.profit, fiscalYear: record.fiscalYear }
    : { source: 'ask_in_form' }
}

async function loadMgx(ctx: JobContext, deal: DealRow): Promise<MgxData> {
  const { mgx } = ctx.providers
  const nace = deal.snapshot.nace ?? undefined
  const [featured, countryFeatured, buyers, sectorDeals, recentDeals] = await Promise.all([
    mgx.searchBuyers({}),
    mgx.searchBuyers({ country: deal.country }),
    nace ? mgx.searchBuyers({ nace, country: deal.country }) : Promise.resolve([]),
    nace ? mgx.listClosedDeals({ nace }) : Promise.resolve([]),
    mgx.listClosedDeals({}),
  ])
  const shown = (items: readonly MgxBuyer[]) => items.filter((buyer) => buyer.namePublic)
  return {
    buyers: shown(buyers),
    featuredBuyers: shown(featured),
    countryFeaturedBuyers: shown(countryFeatured),
    sectorDeals,
    recentDeals,
    multiples: multiplesFor(sectorDeals, deal.snapshot.nace),
    nace: deal.snapshot.nace,
    fetchedAt: ctx.now().toISOString(),
  }
}

function possibleDeals(mgx: MgxData, shown: readonly MgxClosedDeal[]): { deals: MgxClosedDeal[]; scope: DealScope } {
  const fitting = (items: readonly MgxClosedDeal[]) => items.filter((item) => fits('what-is-possible.deal-text', item.text))
  const sector = fitting(mgx.sectorDeals)
  if (sector.length > 0) return { deals: sector.slice(0, SECTOR_DEALS), scope: 'sector' }
  const recent = fitting(mgx.recentDeals)
  const shownIds = new Set(shown.map((item) => item.id))
  const unseen = recent.filter((item) => !shownIds.has(item.id))
  return { deals: (unseen.length > 0 ? unseen : recent).slice(0, SECTOR_DEALS), scope: 'recent' }
}

function pickBuyers(pool: readonly MgxBuyer[], removed: ReadonlySet<string>, shown: ReadonlySet<string> = new Set()): MgxBuyer[] {
  const misfit = (buyer: MgxBuyer) => (fits('buyers.name', buyer.name) ? 0 : 2) + (fits('buyers.focus', buyer.focus) ? 0 : 1)
  const rank = (buyer: MgxBuyer) => misfit(buyer) * 2 + (shown.has(buyer.id) ? 1 : 0)
  return pool
    .filter((buyer) => !removed.has(buyer.id))
    .toSorted((a, b) => rank(a) - rank(b))
    .slice(0, SECTOR_BUYERS)
}

function slideBuyers(mgx: MgxData, removed: ReadonlySet<string>, featured: readonly MgxBuyer[]): { buyers: MgxBuyer[]; scope: BuyerScope } {
  const sector = pickBuyers(mgx.buyers, removed)
  if (sector.length > 0) return { buyers: sector, scope: 'sector' }
  const shown = new Set(featured.map((buyer) => buyer.id))
  const country = pickBuyers(mgx.countryFeaturedBuyers ?? [], removed, shown)
  return { buyers: country.length > 0 ? country : pickBuyers(mgx.featuredBuyers, removed, shown), scope: 'featured' }
}

function clipped(text: string, slot: string): string {
  const max = SLOT_LIMITS[slot] ?? Number.POSITIVE_INFINITY
  const chars = [...text.normalize('NFC')]
  if (chars.length <= max) return text
  const cut = chars.slice(0, max - 1).join('')
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/u, '')}…`
}

function fittedBuyers(content: SlideContent): SlideContent {
  const buyers = content.buyers.map((buyer) => ({ ...buyer, name: clipped(buyer.name, 'buyers.name'), focus: clipped(buyer.focus, 'buyers.focus') }))
  return { ...content, buyers }
}

function selectContent(deal: DealRow, mgx: MgxData): SlideContent {
  const recentDeals = mgx.recentDeals.filter((item) => fits('who-we-are.deal-text', item.text)).slice(0, WHO_WE_ARE_DEALS)
  const possible = possibleDeals(mgx, recentDeals)
  const featured = mgx.featuredBuyers.filter((buyer) => fits('who-we-are.buyer-name', buyer.name)).slice(0, WHO_WE_ARE_BUYERS)
  const buyers = slideBuyers(mgx, new Set(deal.removedBuyers), featured)
  return {
    featured,
    buyers: buyers.buyers,
    buyerScope: buyers.scope,
    recentDeals,
    sectorDeals: possible.deals,
    dealScope: possible.scope,
  }
}

function translationSources(content: SlideContent): TranslationSource[] {
  const sources = new Map<string, TranslationSource>()
  const add = (id: string, text: string, slot: string) => {
    const max = Math.min(SLOT_LIMITS[slot] ?? Number.POSITIVE_INFINITY, sources.get(id)?.max ?? Number.POSITIVE_INFINITY)
    sources.set(id, { id, text, max })
  }
  for (const buyer of content.buyers) add(`buyer:${buyer.id}`, buyer.focus, 'buyers.focus')
  for (const item of content.recentDeals) add(`deal:${item.id}`, item.text, 'who-we-are.deal-text')
  for (const item of content.sectorDeals) add(`deal:${item.id}`, item.text, 'what-is-possible.deal-text')
  return [...sources.values()]
}

async function translateContent(ctx: JobContext, dealId: number, lang: Lang, content: SlideContent): Promise<SlideContent> {
  const sources = translationSources(content)
  if (lang === 'en' || sources.length === 0) return content
  const answer = await askModel(
    ctx.providers.model,
    {
      system: translateTextsPrompt(lang),
      input: { task: 'translate-texts', lang, texts: sources },
      schemaName: 'translate-texts',
      jsonSchema: translationsOutputJsonSchema,
      schema: translationsOutputSchema,
      check: (value) => checkTranslations(value.texts, lang, sources),
    },
    { dealId },
  )
  if (!answer.ok) {
    log.warn('buyer and deal texts stay in the original language, the translation failed the checks', { dealId, lang, errors: answer.errors })
    return content
  }
  const texts = new Map(answer.value.texts.map((item) => [item.id, item.text.trim()]))
  const translatedDeal = (item: MgxClosedDeal): MgxClosedDeal => ({ ...item, text: texts.get(`deal:${item.id}`) ?? item.text })
  return {
    ...content,
    buyers: content.buyers.map((buyer) => ({ ...buyer, focus: texts.get(`buyer:${buyer.id}`) ?? buyer.focus })),
    recentDeals: content.recentDeals.map(translatedDeal),
    sectorDeals: content.sectorDeals.map(translatedDeal),
  }
}

async function downloadLogo(url: string, key: string): Promise<string | null> {
  try {
    if (!/^https?:$/u.test(new URL(url).protocol)) throw new Error('not an http address')
    const res = await fetch(url, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
    const ext = LOGO_TYPES[type]
    if (!ext) throw new Error(`unsupported content type "${type}"`)
    if (Number(res.headers.get('content-length') ?? 0) > LOGO_MAX_BYTES) throw new Error('the file is too large')
    const body = Buffer.from(await res.arrayBuffer())
    if (body.length === 0 || body.length > LOGO_MAX_BYTES) throw new Error(`the file has ${body.length} bytes`)
    const name = `${key}.${ext}`
    await writeFileAtomic(path.join(paths.logosDir, name), body)
    return name
  } catch (error) {
    log.warn('buyer logo skipped', { url, error: errorText(error) })
    return null
  }
}

async function cachedLogos(buyers: readonly MgxBuyer[]): Promise<Map<string, string>> {
  const names = await readdir(paths.logosDir).catch(() => [] as string[])
  const existing = new Map(names.filter((name) => !name.startsWith('.')).map((name) => [name.split('.')[0], name]))
  const urls = [...new Set(buyers.flatMap((buyer) => (buyer.logoUrl ? [buyer.logoUrl] : [])))]
  const files = new Map<string, string>()
  await Promise.all(
    urls.map(async (url) => {
      const key = createHash('sha1').update(url).digest('hex')
      const name = existing.get(key) ?? (await downloadLogo(url, key))
      if (name) files.set(url, storageRelative(path.join(paths.logosDir, name)))
    }),
  )
  return files
}

function buyerItem(buyer: MgxBuyer, logos: ReadonlyMap<string, string>): BuyerSlideItem {
  return {
    id: buyer.id,
    name: buyer.name,
    focus: buyer.focus,
    website: buyer.website,
    logoFile: buyer.logoUrl ? (logos.get(buyer.logoUrl) ?? null) : null,
  }
}

function dealCard(item: MgxClosedDeal): DealCardItem {
  return { id: item.id, year: item.year, country: item.country, text: item.text }
}

function labelsFor(lang: Lang, template: TemplateName, vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(slideLabels(lang, template))
      .map(([key, text]) => [key, fill(text, vars)] as const)
      .filter(([, text]) => !/\{\w+\}/u.test(text)),
  )
}

function withHeadline(labels: Record<string, string>, variant: string, use: boolean): Record<string, string> {
  const { [`headline-${variant}`]: headline, ...rest } = labels
  return use && headline ? { ...rest, headline } : rest
}

function segmentLabels(lang: Lang, variables: SlideVariables, vars: Record<string, string>): Record<string, string> {
  const labels = labelsFor(lang, variables.template, vars)
  if (variables.template === 'buyers') return withHeadline(labels, 'featured', variables.scope === 'featured')
  if (variables.template === 'what-is-possible') return withHeadline(labels, 'recent', variables.scope === 'recent')
  return labels
}

function buildTimeline(
  deal: DealRow,
  analyst: AnalystRow,
  lang: Lang,
  financials: Financials,
  content: SlideContent,
  logos: ReadonlyMap<string, string>,
): Timeline {
  const { snapshot } = deal
  const vars: Record<string, string> = {
    buyerCount: new Intl.NumberFormat(LANGUAGE_LOCALES[lang]).format(mergeroConfig().facts.buyerCount),
    ...(financials.source === 'asiakastieto' ? { year: String(financials.fiscalYear) } : {}),
  }
  const slides: [ScriptSlideNumber, SlideVariables][] = [
    [
      2,
      {
        template: 'who-we-are',
        buyers: content.featured.map((buyer) => buyerItem(buyer, logos)),
        deals: content.recentDeals.map(dealCard),
        buyerCount: mergeroConfig().facts.buyerCount,
      },
    ],
    [
      3,
      {
        template: 'your-company',
        company: snapshot.company,
        website: deal.scrape?.homeUrl ?? snapshot.website,
        lines: [],
        linesSource: null,
        screenshotFile: deal.scrape?.screenshot ? storageRelative(paths.screenshot(deal.id)) : null,
      },
    ],
    [
      4,
      financials.source === 'asiakastieto'
        ? {
            template: 'your-figures',
            mode: 'figures',
            revenue: financials.revenue,
            profit: financials.profit,
            revenueText: formatMoney(financials.revenue, lang),
            profitText: formatMoney(financials.profit, lang),
            fiscalYear: financials.fiscalYear,
          }
        : { template: 'your-figures', mode: 'ask', calculator: calculatorFor(deal) !== null },
    ],
    [5, { template: 'buyers', buyers: content.buyers.map((buyer) => buyerItem(buyer, logos)), scope: content.buyerScope }],
    [6, { template: 'what-is-possible', deals: content.sectorDeals.map(dealCard), scope: content.dealScope }],
    [7, { template: 'privacy' }],
    [8, { template: 'book-meeting', analystName: analyst.name, company: snapshot.company }],
  ]
  const intro = readyIntro(analyst, lang)
  const segments: Segment[] = [
    {
      slide: 1,
      template: 'facecam',
      variables: { template: 'facecam', videoFile: intro?.file ?? '', analystName: analyst.name, transcript: intro?.transcript ?? null },
      labels: labelsFor(lang, 'facecam', vars),
      durationS: intro?.durationS ?? 0,
      startS: null,
      endS: null,
    },
    ...slides.map(
      ([slide, variables]): SlideSegment => ({
        slide,
        template: variables.template,
        variables,
        labels: segmentLabels(lang, variables, vars),
        script: '',
        scriptSource: null,
        audio: { file: null, durationS: null, status: 'missing', error: null },
        durationS: null,
        startS: null,
        endS: null,
      }),
    ),
  ]
  const basis = videoBasis(deal)
  return { dealId: deal.id, version: 1, language: lang, fps: FPS, width: WIDTH, height: HEIGHT, pauseS: PAUSE_S, segments, basis }
}

function keepAnalystText(timeline: Timeline, previous: Timeline | null): Timeline {
  if (!previous) return timeline
  const oldCompany = companyVariables(previous)
  const company = companyVariables(timeline)
  if (company && oldCompany?.linesSource === 'analyst') Object.assign(company, { lines: [...oldCompany.lines], linesSource: 'analyst' })
  for (const segment of timeline.segments) {
    const old = slideSegment(previous, segment.slide)
    if (segment.template === 'facecam' || old?.scriptSource !== 'analyst' || old.script.trim() === '') continue
    segment.script = old.script
    segment.scriptSource = 'analyst'
    const changed = previous.language !== timeline.language || JSON.stringify(old.variables) !== JSON.stringify(segment.variables)
    if (old.scriptCheck || changed) segment.scriptCheck = true
  }
  return timeline
}

async function prepareNewVersion(
  ctx: JobContext,
  deal: DealRow,
  analyst: AnalystRow,
  previous: Timeline | null,
): Promise<{ deal: DealRow; timeline: Timeline }> {
  const financials = await loadFinancials(ctx, deal)
  const mgx = await loadMgx(ctx, deal)
  const lang = resolveLanguage({
    country: deal.country,
    siteLanguage: deal.scrape?.siteLanguage ?? null,
    linkedinLanguages: deal.snapshot.linkedinLanguages,
  })
  const updated = updateDeal(
    ctx.db,
    deal.id,
    { financials, mgx, language: lang, ...(deal.pageLanguage === deal.language ? { pageLanguage: lang } : {}) },
    ctx.now(),
  )
  const content = fittedBuyers(await translateContent(ctx, deal.id, lang, selectContent(updated, mgx)))
  const logos = await cachedLogos([...content.featured, ...content.buyers])
  log.info('video data collected', {
    dealId: deal.id,
    language: lang,
    financials: financials.source,
    buyers: `${content.buyers.length} (${content.buyerScope})`,
    featuredBuyers: content.featured.length,
    sectorDeals: mgx.sectorDeals.length,
    possibleDeals: `${content.sectorDeals.length} (${content.dealScope})`,
    logos: logos.size,
  })
  return { deal: updated, timeline: keepAnalystText(buildTimeline(updated, analyst, lang, financials, content, logos), previous) }
}

function scriptContext(deal: DealRow, analyst: AnalystRow, timeline: Timeline): ScriptContext {
  const company = companyVariables(timeline)
  const figures = slideSegment(timeline, 4)?.variables
  const buyers = slideSegment(timeline, 5)?.variables
  const deals = slideSegment(timeline, 6)?.variables
  return {
    lang: timeline.language,
    company: company?.company ?? deal.snapshot.company,
    ownerFirstName: deal.snapshot.ownerFirstName,
    analystName: analyst.name,
    buyerNames: buyers?.template === 'buyers' ? buyers.buyers.map((buyer) => buyer.name) : [],
    buyerScope: buyers?.template === 'buyers' ? (buyers.scope ?? 'sector') : 'sector',
    buyerCount: mergeroConfig().facts.buyerCount,
    figures: deal.financials ?? { source: 'ask_in_form' },
    calculator: figures?.template === 'your-figures' && figures.mode === 'ask' ? figures.calculator : calculatorFor(deal) !== null,
    lines: company ? filledLines(company.lines) : [],
    linesSource: company?.linesSource ?? null,
    hasWebsite: deal.scrape?.ok === true && Boolean(company?.screenshotFile),
    dealTexts: deals?.template === 'what-is-possible' ? deals.deals.map((item) => item.text) : [],
    dealScope: deals?.template === 'what-is-possible' ? (deals.scope ?? 'sector') : 'sector',
    country: deal.country,
  }
}

function slideFacts(segment: SlideSegment, context: ScriptContext): Record<string, unknown> {
  const variables = segment.variables
  const cards = (deals: DealCardItem[]) => deals.map(({ year, country, text }) => ({ year, country, text }))
  switch (variables.template) {
    case 'who-we-are':
      return {
        featuredBuyers: variables.buyers.map(({ name, focus }) => ({ name, focus })),
        recentDeals: cards(variables.deals),
        buyerCount: variables.buyerCount,
        publicBuyerCount: mergeroConfig().facts.publicBuyerCount,
      }
    case 'your-company':
      return { company: variables.company, website: variables.website, lines: filledLines(variables.lines) }
    case 'your-figures':
      return variables.mode === 'figures'
        ? {
            figures: context.figures,
            revenueText: variables.revenueText,
            profitText: variables.profitText,
            fiscalYear: variables.fiscalYear,
          }
        : { figures: context.figures, calculator: context.calculator }
    case 'buyers':
      return { buyers: variables.buyers.map(({ name, focus }) => ({ name, focus })), scope: variables.scope ?? 'sector' }
    case 'what-is-possible':
      return { deals: cards(variables.deals), scope: variables.scope ?? 'sector' }
    case 'privacy':
      return { points: Object.entries(segment.labels).filter(([key]) => key.startsWith('point-')).map(([, text]) => text) }
    case 'book-meeting':
      return { meeting: segment.labels.line ?? '', meetingMinutes: MEETING_MINUTES, analystName: variables.analystName }
  }
}

async function writeLines(ctx: JobContext, deal: DealRow, lang: Lang, company: string): Promise<ModelAnswer<string[]>> {
  const input = { task: 'company-lines', lang, company, text: (deal.scrape?.markdown ?? '').slice(0, MAX_MODEL_TEXT) }
  const answer = await askModel(
    ctx.providers.model,
    {
      system: companyLinesPrompt(lang),
      input,
      schemaName: 'company-lines',
      jsonSchema: linesOutputJsonSchema,
      schema: linesOutputSchema,
      check: (value) => checkLines(value.lines.map((line) => line.trim()), lang, input),
    },
    { dealId: deal.id, slide: 3 },
  )
  return answer.ok ? { ok: true, value: answer.value.lines.map((line) => line.trim()) } : answer
}

async function writeScript(
  ctx: JobContext,
  dealId: number,
  segment: SlideSegment,
  context: ScriptContext,
): Promise<ModelAnswer<string>> {
  const input = { task: 'slide-script', slide: segment.slide, context, facts: slideFacts(segment, context) }
  const answer = await askModel(
    ctx.providers.model,
    {
      system: slideScriptPrompt(segment.slide, context),
      input,
      schemaName: 'slide-script',
      jsonSchema: scriptOutputJsonSchema,
      schema: scriptOutputSchema,
      check: (value) => checkScript(value.script.trim(), context.lang, input),
    },
    { dealId, slide: segment.slide },
  )
  return answer.ok ? { ok: true, value: answer.value.script.trim() } : answer
}

async function writeContent(
  ctx: JobContext,
  deal: DealRow,
  analyst: AnalystRow,
  timeline: Timeline,
  slides: readonly ScriptSlideNumber[],
  lines: boolean,
): Promise<Written> {
  const written: Written = { lines: null, screenshotFile: null, scripts: new Map(), failures: [] }
  const company = companyVariables(timeline)
  const needLines = lines && company !== null && company.linesSource !== 'analyst' && filledLines(company.lines).length < MIN_COMPANY_LINES
  if (needLines && deal.scrape?.ok && deal.scrape.markdown) {
    const answer = await writeLines(ctx, deal, timeline.language, company.company)
    if (answer.ok) {
      written.lines = answer.value
      written.screenshotFile = deal.scrape.screenshot ? storageRelative(paths.screenshot(deal.id)) : null
      company.lines = answer.value
      company.linesSource = 'model'
      company.screenshotFile ??= written.screenshotFile
    } else {
      written.failures.push({
        code: 'model_failed',
        slide: 3,
        slot: LINES_SLOT,
        detail: `Slide 3: the company lines failed the checks twice (${answer.errors.join('; ')})`,
      })
    }
  }
  const context = scriptContext(deal, analyst, timeline)
  for (const slide of slides) {
    const segment = slideSegment(timeline, slide)
    if (!segment || segment.scriptSource === 'analyst') continue
    if (segment.script.trim() !== '' && !(slide === 3 && written.lines !== null)) continue
    const answer = await writeScript(ctx, deal.id, segment, context)
    if (answer.ok) {
      written.scripts.set(slide, { script: answer.value, inputs: JSON.stringify(segment.variables) })
    } else {
      written.failures.push({
        code: 'model_failed',
        slide,
        detail: `Slide ${slide}: the script failed the checks twice (${answer.errors.join('; ')})`,
      })
    }
  }
  return written
}

function applyWritten(timeline: Timeline, written: Written, source: SlideSegment['scriptSource']): Timeline {
  const company = companyVariables(timeline)
  if (written.lines && company && company.linesSource !== 'analyst') {
    company.lines = written.lines
    company.linesSource = 'model'
    company.screenshotFile ??= written.screenshotFile
  }
  for (const [slide, { script, inputs }] of written.scripts) {
    const segment = slideSegment(timeline, slide)
    if (!segment || segment.scriptSource === 'analyst' || JSON.stringify(segment.variables) !== inputs) continue
    segment.script = script
    segment.scriptSource = source
    segment.audio = { ...segment.audio, status: segment.audio.file ? 'new' : 'missing', error: null }
  }
  return timeline
}

export const writeScriptHandler: JobHandler<'write-script'> = {
  async run(job, ctx) {
    const { dealId, version, slides, lines } = job.payload
    let deal = requireDeal(ctx.db, dealId)
    const analyst = requireAnalyst(ctx.db, deal.analystId)
    const row = getTimeline(ctx.db, dealId, version)
    const newest = newestTimeline(ctx.db, dealId)
    if (!row && version !== (newest?.version ?? 0) + 1) {
      throw new NonRetryableError(`Deal ${dealId} has no timeline version ${version}`)
    }
    if (row && row.renderStatus !== 'pending') {
      log.info('write-script skipped, the version is no longer pending', { dealId, version, renderStatus: row.renderStatus })
      advance(ctx.db, dealId, ctx.now(), { finishedJobId: job.id })
      return
    }
    let timeline: Timeline
    if (row) {
      timeline = row.timeline
    } else {
      const fresh = await prepareNewVersion(ctx, deal, analyst, newest?.timeline ?? null)
      deal = fresh.deal
      timeline = fresh.timeline
    }

    const written = await writeContent(ctx, deal, analyst, timeline, slides, lines)
    const source = ctx.providers.model.mode === 'fake' ? 'fallback' : 'model'
    const now = ctx.now()
    transaction(ctx.db, () => {
      if (row) updateVersion(ctx.db, dealId, version, (current) => applyWritten(current, written, source))
      else createVersion(ctx.db, dealId, applyWritten(timeline, written, source), now)
      if (written.failures.length > 0) recordReviewReasons(ctx.db, dealId, written.failures, now)
    })
    log.info('scripts written', {
      dealId,
      version,
      slides: [...written.scripts.keys()],
      lines: written.lines !== null,
      failed: written.failures.map((reason) => reason.slot ?? `slide ${reason.slide}`),
    })
    advance(ctx.db, dealId, ctx.now(), { finishedJobId: job.id })
  },
}
