import type { Brand, BuyerSlideItem, DealCardItem, FacecamSegment, Lang, RenderInput, Segment, TemplateName, TemplateVariables } from '@mergero/shared'
import type { Node } from '@revideo/2d'
import { Audio, Img, makeScene2D, Node as Group, Rect, Txt, Video } from '@revideo/2d'
import { clamp, createRef, easeOutCubic, easeOutSine, useScene } from '@revideo/core'
import { SCENE_HEIGHT, SCENE_WIDTH, segmentFrames } from './timing.ts'

export const CANVAS_BACKGROUND = '#111111'

const FONT = 'Poppins'
const HEADING_FONT = 'Lora Variable'
const FONT_GLYPHS = 'AaåäöæøüßÅÄÖÆØÜŁőŠ0123456789€'

const FRAME = {
  top: 100,
  side: 100,
  bottom: 80,
  eyebrowGap: 40,
  bodyGap: 48,
}

const CONTENT_WIDTH = SCENE_WIDTH - 2 * FRAME.side
const HEADLINE_WIDTH = 1400
const LOGO_WIDTH = 180
const LOGO_HEIGHT = 40
const RULE = 2

const HAIRLINE_LIGHT = '#E5E5E5'

const TYPE = {
  display: { fontFamily: HEADING_FONT, fontSize: 88, lineHeight: 96, fontWeight: 400, letterSpacing: -0.9 },
  headline: { fontFamily: HEADING_FONT, fontSize: 72, lineHeight: 80, fontWeight: 400, letterSpacing: -0.7 },
  statement: { fontFamily: HEADING_FONT, fontSize: 64, lineHeight: 76, fontWeight: 400, letterSpacing: -0.6 },
  figure: { fontFamily: HEADING_FONT, fontSize: 120, lineHeight: 128, fontWeight: 400, letterSpacing: -1.8 },
  quote: { fontFamily: HEADING_FONT, fontSize: 44, lineHeight: 56, fontWeight: 400, letterSpacing: -0.4 },
  lowerThird: { fontFamily: HEADING_FONT, fontSize: 46, lineHeight: 52, fontWeight: 400, letterSpacing: -0.4 },
  number: { fontFamily: FONT, fontSize: 56, lineHeight: 64, fontWeight: 300, letterSpacing: 0 },
  body: { fontFamily: FONT, fontSize: 36, lineHeight: 48, fontWeight: 400, letterSpacing: 0 },
  name: { fontFamily: FONT, fontSize: 30, lineHeight: 40, fontWeight: 500, letterSpacing: 0 },
  text: { fontFamily: FONT, fontSize: 28, lineHeight: 38, fontWeight: 400, letterSpacing: 0 },
  label: { fontFamily: FONT, fontSize: 24, lineHeight: 32, fontWeight: 400, letterSpacing: 0 },
  eyebrow: { fontFamily: FONT, fontSize: 24, lineHeight: 32, fontWeight: 500, letterSpacing: 1.9 },
} as const

type TypeStyle = (typeof TYPE)[keyof typeof TYPE]

const CROSSFADE_FRAMES = 10
const IMAGE_TIMEOUT_MS = 15_000
const MEDIA_TIMEOUT_MS = 30_000

interface Theme {
  background: string
  text: string
  body: string
  muted: string
  rule: string
  hairline: string
  logo: 'dark' | 'light'
}

function withAlpha(hex: string, alpha: number): string {
  const value = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (!value) return hex
  const channel = (offset: number) => parseInt(value.slice(offset, offset + 2), 16)
  return `rgba(${channel(0)}, ${channel(2)}, ${channel(4)}, ${alpha})`
}

function lightTheme(brand: Brand): Theme {
  return {
    background: brand.white,
    text: brand.ink,
    body: brand.text,
    muted: brand.muted,
    rule: brand.ink,
    hairline: HAIRLINE_LIGHT,
    logo: 'dark',
  }
}

function darkTheme(brand: Brand): Theme {
  return {
    background: brand.ink,
    text: brand.white,
    body: withAlpha(brand.white, 0.8),
    muted: withAlpha(brand.white, 0.6),
    rule: withAlpha(brand.white, 0.16),
    hairline: withAlpha(brand.white, 0.16),
    logo: 'light',
  }
}

interface LoadedImage {
  url: string
  width: number
  height: number
}

interface LoadedMedia {
  url: string
  width: number
  height: number
}

interface Assets {
  images: Map<string, LoadedImage | null>
  media: Map<string, LoadedMedia>
}

function decodeBase64(value: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)))
}

function joinPath(root: string, file: string): string {
  return file.startsWith('/') ? file : `${root.replace(/\/+$/, '')}/${file}`
}

function fileUrl(absolutePath: string): string {
  const encoded = absolutePath.split('/').map(encodeURIComponent).join('/')
  return new URL(`/@fs${encoded}`, window.location.origin).href
}

function storageUrl(input: RenderInput, file: string): string {
  return fileUrl(joinPath(input.storageDir, file))
}

function loadImage(url: string): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const image = new Image()
    const timer = setTimeout(() => finish(null), IMAGE_TIMEOUT_MS)
    const finish = (value: LoadedImage | null) => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(value)
    }
    image.onload = () =>
      finish(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { url, width: image.naturalWidth, height: image.naturalHeight }
          : null,
      )
    image.onerror = () => finish(null)
    image.crossOrigin = 'anonymous'
    image.src = url
  })
}

function loadMedia(url: string, kind: 'video' | 'audio', label: string): Promise<LoadedMedia> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind)
    const timer = setTimeout(() => fail('timed out'), MEDIA_TIMEOUT_MS)
    const cleanup = () => {
      clearTimeout(timer)
      element.oncanplay = null
      element.onerror = null
      element.removeAttribute('src')
      element.load()
    }
    const fail = (reason: string) => {
      cleanup()
      reject(new Error(`Media failed to load: ${label} (${reason})`))
    }
    element.oncanplay = () => {
      const loaded = {
        url,
        width: element instanceof HTMLVideoElement ? element.videoWidth : 0,
        height: element instanceof HTMLVideoElement ? element.videoHeight : 0,
      }
      cleanup()
      resolve(loaded)
    }
    element.onerror = () => fail(`media error ${element.error?.code ?? 'unknown'}`)
    element.preload = 'auto'
    element.muted = true
    element.crossOrigin = 'anonymous'
    element.src = url
  })
}

function segmentImages(input: RenderInput, segment: Segment): string[] {
  const variables = segment.variables
  switch (variables.template) {
    case 'your-company':
      return variables.screenshotFile ? [storageUrl(input, variables.screenshotFile)] : []
    case 'who-we-are':
    case 'buyers':
      return variables.buyers.flatMap((buyer) => (buyer.logoFile ? [storageUrl(input, buyer.logoFile)] : []))
    default:
      return []
  }
}

function segmentMedia(input: RenderInput, segment: Segment): { url: string; kind: 'video' | 'audio'; label: string }[] {
  if (segment.template === 'facecam') {
    const file = segment.variables.videoFile
    return [{ url: storageUrl(input, file), kind: 'video', label: file }]
  }
  const file = segment.audio.file
  return file ? [{ url: storageUrl(input, file), kind: 'audio', label: file }] : []
}

async function loadAssets(input: RenderInput, extraImages: string[]): Promise<Assets> {
  const imageUrls = new Set([...extraImages, ...input.timeline.segments.flatMap((segment) => segmentImages(input, segment))])
  const mediaRequests = input.timeline.segments.flatMap((segment) => segmentMedia(input, segment))
  const [images, media] = await Promise.all([
    Promise.all([...imageUrls].map(async (url) => [url, await loadImage(url)] as const)),
    Promise.all(mediaRequests.map(async (request) => [request.url, await loadMedia(request.url, request.kind, request.label)] as const)),
  ])
  return { images: new Map(images), media: new Map(media) }
}

interface SlideContext {
  brand: Brand
  lang: Lang
  fps: number
  logo(theme: Theme): LoadedImage | null
  still: LoadedImage | null
  image(file: string | null): LoadedImage | null
  media(file: string): LoadedMedia
  lines(node: Txt, style: TypeStyle): number
}

interface SlideView {
  root: Node
  video?: Video
  animate(frame: number): void
}

type Variables<T extends TemplateName> = Extract<TemplateVariables, { template: T }>
type Labels = Record<string, string>

function fade(frame: number, start: number, length = 12): number {
  return easeOutCubic(clamp(0, 1, (frame - start) / length))
}

const REVEAL_START = 4
const REVEAL_STAGGER = 5

function reveal(groups: Node[], start = REVEAL_START, stagger = REVEAL_STAGGER): (frame: number) => void {
  for (const group of groups) group.opacity(0)
  return (frame) => groups.forEach((group, index) => group.opacity(fade(frame, start + index * stagger)))
}

function text(
  value: string,
  style: TypeStyle,
  fill: string,
  width: number,
  align: CanvasTextAlign = 'left',
  wrap: true | 'balance' = true,
): Txt {
  return (
    <Txt
      text={value}
      fontFamily={style.fontFamily}
      fontSize={style.fontSize}
      lineHeight={style.lineHeight}
      fontWeight={style.fontWeight}
      letterSpacing={style.letterSpacing}
      fill={fill}
      width={width}
      textWrap={wrap}
      textAlign={align}
    />
  ) as Txt
}

function eyebrow(value: string, theme: Theme, ctx: SlideContext, width = CONTENT_WIDTH): Txt {
  return text(value.toLocaleUpperCase(ctx.lang), TYPE.eyebrow, theme.muted, width)
}

function image(loaded: LoadedImage, maxWidth: number, maxHeight: number): Node {
  const scale = Math.min(maxWidth / loaded.width, maxHeight / loaded.height)
  return <Img src={loaded.url} width={Math.round(loaded.width * scale)} height={Math.round(loaded.height * scale)} />
}

function ruledColumn(width: number, theme: Theme, gap: number, children: Node[]): Node {
  return (
    <Rect width={width} direction={'column'} gap={gap} shrink={0}>
      <Rect width={width} height={RULE} fill={theme.rule} shrink={0} marginBottom={32 - gap} />
      {children}
    </Rect>
  )
}

interface FramedSlide {
  root: Node
  heading: Node
}

interface FrameContent {
  eyebrow?: string
  headline?: string
  headlineStyle?: TypeStyle
  headlineWidth?: number
  body: Node
  align?: 'start' | 'center' | 'end'
}

function framedSlide(ctx: SlideContext, theme: Theme, content: FrameContent): FramedSlide {
  const logo = ctx.logo(theme)
  const headlineWidth = content.headlineWidth ?? HEADLINE_WIDTH
  const heading = (
    <Rect direction={'column'} gap={FRAME.eyebrowGap} width={CONTENT_WIDTH - LOGO_WIDTH - 40}>
      {content.eyebrow ? eyebrow(content.eyebrow, theme, ctx, CONTENT_WIDTH - LOGO_WIDTH - 40) : null}
      {content.headline ? text(content.headline, content.headlineStyle ?? TYPE.headline, theme.text, headlineWidth, 'left', 'balance') : null}
    </Rect>
  )
  const root = (
    <Rect
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      fill={theme.background}
      layout
      direction={'column'}
      padding={[FRAME.top, FRAME.side, FRAME.bottom, FRAME.side]}
      gap={FRAME.bodyGap}
    >
      <Rect width={CONTENT_WIDTH} direction={'row'} justifyContent={'space-between'} alignItems={'start'} shrink={0}>
        {heading}
        {logo ? image(logo, LOGO_WIDTH, LOGO_HEIGHT) : null}
      </Rect>
      <Rect width={CONTENT_WIDTH} grow={1} basis={0} minHeight={0} direction={'column'} justifyContent={content.align ?? 'end'}>
        {content.body}
      </Rect>
    </Rect>
  )
  return { root, heading }
}

function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

function countryName(code: string, lang: Lang): string {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

function dealMeta(deal: DealCardItem, ctx: SlideContext): string {
  return `${deal.year} · ${countryName(deal.country, ctx.lang)}`
}

const FACECAM_PORTRAIT_TOP_BIAS = 0.2
const FACECAM_MARGIN = 96
const FACECAM_NAME_WIDTH = 1200

function facecamSlide(variables: FacecamSegment['variables'], ctx: SlideContext): SlideView {
  const media = ctx.media(variables.videoFile)
  const scale = media.width > 0 && media.height > 0 ? Math.max(SCENE_WIDTH / media.width, SCENE_HEIGHT / media.height) : 1
  const width = media.width > 0 ? Math.round(media.width * scale) : SCENE_WIDTH
  const height = media.height > 0 ? Math.round(media.height * scale) : SCENE_HEIGHT
  const logo = ctx.logo(darkTheme(ctx.brand))
  const video = createRef<Video>()
  const lowerThird = createRef<Rect>()

  const root = (
    <Rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill={ctx.brand.ink} clip>
      <Video ref={video} src={media.url} width={width} height={height} y={(height - SCENE_HEIGHT) * FACECAM_PORTRAIT_TOP_BIAS} />
      <Rect
        ref={lowerThird}
        layout
        direction={'column'}
        gap={16}
        padding={[32, 40]}
        fill={withAlpha(ctx.brand.ink, 0.88)}
        offset={[-1, 1]}
        position={[-SCENE_WIDTH / 2 + FACECAM_MARGIN, SCENE_HEIGHT / 2 - FACECAM_MARGIN]}
      >
        <Txt
          text={variables.analystName}
          fontFamily={TYPE.lowerThird.fontFamily}
          fontSize={TYPE.lowerThird.fontSize}
          lineHeight={TYPE.lowerThird.lineHeight}
          fontWeight={TYPE.lowerThird.fontWeight}
          letterSpacing={TYPE.lowerThird.letterSpacing}
          fill={ctx.brand.white}
          maxWidth={FACECAM_NAME_WIDTH}
          textWrap
        />
        {logo ? image(logo, LOGO_WIDTH, LOGO_HEIGHT) : null}
      </Rect>
    </Rect>
  )

  lowerThird().opacity(0)
  return {
    root,
    video: video(),
    animate: (frame) => lowerThird().opacity(fade(frame, 15, 16)),
  }
}

const WHO_GAP = 24
const WHO_TILE_WIDTH = (CONTENT_WIDTH - 5 * WHO_GAP) / 6
const WHO_TILE_HEIGHT = 140
const WHO_DEAL_GAP = 48
const WHO_DEAL_WIDTH = (CONTENT_WIDTH - 2 * WHO_DEAL_GAP) / 3

function whoWeAreTile(buyer: BuyerSlideItem, theme: Theme, ctx: SlideContext): Node {
  const logo = ctx.image(buyer.logoFile)
  const inner = WHO_TILE_WIDTH - 40
  return (
    <Rect
      width={WHO_TILE_WIDTH}
      height={WHO_TILE_HEIGHT}
      stroke={theme.hairline}
      lineWidth={RULE}
      alignItems={'center'}
      justifyContent={'center'}
      padding={20}
      shrink={0}
    >
      {logo ? image(logo, inner, 72) : text(buyer.name, TYPE.label, theme.muted, inner, 'center')}
    </Rect>
  )
}

function whoWeAreSlide(variables: Variables<'who-we-are'>, labels: Labels, ctx: SlideContext): SlideView {
  const theme = lightTheme(ctx.brand)
  const headline = fillPlaceholders(labels.headline ?? '', { buyerCount: new Intl.NumberFormat(ctx.lang).format(variables.buyerCount) })
  const logos = (
    <Rect direction={'column'} gap={WHO_GAP}>
      {text(labels['buyers-heading'] ?? '', TYPE.label, theme.muted, CONTENT_WIDTH)}
      <Rect direction={'row'} gap={WHO_GAP}>
        {variables.buyers.slice(0, 6).map((buyer) => whoWeAreTile(buyer, theme, ctx))}
      </Rect>
    </Rect>
  )
  const deals = (
    <Rect direction={'column'} gap={WHO_GAP} marginTop={48}>
      {text(labels['deals-heading'] ?? '', TYPE.label, theme.muted, CONTENT_WIDTH)}
      <Rect direction={'row'} gap={WHO_DEAL_GAP}>
        {variables.deals.slice(0, 3).map((deal) =>
          ruledColumn(WHO_DEAL_WIDTH, theme, 12, [
            text(dealMeta(deal, ctx), TYPE.label, theme.muted, WHO_DEAL_WIDTH),
            text(deal.text, TYPE.text, theme.body, WHO_DEAL_WIDTH),
          ]),
        )}
      </Rect>
    </Rect>
  )
  const body = (
    <Rect direction={'column'}>
      {logos}
      {deals}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, { headline, headlineStyle: TYPE.display, body })
  return { root: framed.root, animate: reveal([framed.heading, logos, deals]) }
}

const COMPANY_GAP = 80
const COMPANY_FRAME_WIDTH = 880
const COMPANY_ASPECT = 10 / 16
const COMPANY_CAPTION_SPACE = TYPE.label.lineHeight + 16
const SCROLL_END_HOLD_S = 1
const SCROLL_HEIGHTS_PER_S = 0.4

function hostName(website: string | null): string {
  if (!website) return ''
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(website) ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '')
  } catch {
    return website
  }
}

interface ScreenshotFrame {
  root: Node
  scroll(frame: number): void
}

function screenshotFrame(screenshot: LoadedImage, website: string | null, frameWidth: number, theme: Theme, start: number, frames: number, fps: number): ScreenshotFrame {
  const frameHeight = Math.round(frameWidth * COMPANY_ASPECT)
  const scale = Math.max(frameWidth / screenshot.width, frameHeight / screenshot.height)
  const width = Math.round(screenshot.width * scale)
  const height = Math.round(screenshot.height * scale)
  const top = (height - frameHeight) / 2
  const scrollFrames = frames - start - Math.round(SCROLL_END_HOLD_S * fps)
  const distance = Math.min(height - frameHeight, (scrollFrames / fps) * SCROLL_HEIGHTS_PER_S * frameHeight)
  const host = hostName(website)
  const img = createRef<Img>()
  const root = (
    <Rect direction={'column'} gap={16} shrink={0}>
      <Rect width={frameWidth} height={frameHeight} stroke={theme.hairline} lineWidth={RULE} clip shrink={0}>
        <Img ref={img} layout={false} src={screenshot.url} width={width} height={height} y={top} />
      </Rect>
      {host ? text(host, TYPE.label, theme.muted, frameWidth) : null}
    </Rect>
  )
  return {
    root,
    scroll: (frame) => {
      if (distance >= 1) img().y(top - distance * easeOutSine(clamp(0, 1, (frame - start) / scrollFrames)))
    },
  }
}

function yourCompanySlide(variables: Variables<'your-company'>, labels: Labels, ctx: SlideContext, frames: number): SlideView {
  const theme = lightTheme(ctx.brand)
  const screenshot = ctx.image(variables.screenshotFile)
  const headlineWidth = CONTENT_WIDTH - LOGO_WIDTH - 40
  const headlineLines = ctx.lines(text(variables.company, TYPE.headline, theme.text, headlineWidth, 'left', 'balance'), TYPE.headline)
  const bodyHeight =
    SCENE_HEIGHT - FRAME.top - FRAME.bottom - TYPE.eyebrow.lineHeight - FRAME.eyebrowGap - headlineLines * TYPE.headline.lineHeight - FRAME.bodyGap
  const frameWidth = Math.min(COMPANY_FRAME_WIDTH, Math.floor((bodyHeight - COMPANY_CAPTION_SPACE) / COMPANY_ASPECT))
  const linesWidth = screenshot ? CONTENT_WIDTH - frameWidth - COMPANY_GAP : 1100
  const lines = (
    <Rect width={linesWidth} direction={'column'} gap={28} shrink={0}>
      {variables.lines.slice(0, 3).map((line) => text(line, TYPE.text, theme.body, linesWidth))}
    </Rect>
  )
  const frame = screenshot ? screenshotFrame(screenshot, variables.website, frameWidth, theme, REVEAL_START + 2 * REVEAL_STAGGER, frames, ctx.fps) : null
  const body = (
    <Rect width={CONTENT_WIDTH} direction={'row'} gap={COMPANY_GAP}>
      {lines}
      {frame?.root}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, {
    eyebrow: labels.headline ?? '',
    headline: variables.company,
    headlineWidth,
    body,
    align: 'start',
  })
  if (!frame) return { root: framed.root, animate: reveal([framed.heading, lines]) }
  const show = reveal([framed.heading, lines, frame.root])
  return {
    root: framed.root,
    animate: (index) => {
      show(index)
      frame.scroll(index)
    },
  }
}

const STATEMENT_WIDTH = 1500

function statementSlide(eyebrowText: string, statement: string, ctx: SlideContext, meta?: string): SlideView {
  const theme = lightTheme(ctx.brand)
  const body = (
    <Rect direction={'column'} gap={48}>
      {meta ? text(meta, TYPE.label, theme.muted, STATEMENT_WIDTH) : null}
      {text(statement, TYPE.statement, theme.text, STATEMENT_WIDTH)}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, { eyebrow: eyebrowText, body, align: 'center' })
  return { root: framed.root, animate: reveal([framed.heading, body]) }
}

const FIGURES_GAP = 64
const FIGURES_WIDTH = (CONTENT_WIDTH - FIGURES_GAP) / 2

function yourFiguresSlide(variables: Variables<'your-figures'>, labels: Labels, ctx: SlideContext): SlideView {
  const headline = labels.headline ?? ''
  if (variables.mode === 'ask') return statementSlide(headline, labels[variables.calculator ? 'ask-calculator' : 'ask-form'] ?? '', ctx)
  const theme = lightTheme(ctx.brand)
  const figures = (
    <Rect direction={'row'} gap={FIGURES_GAP}>
      {[
        [labels.revenue ?? '', variables.revenueText],
        [labels.profit ?? '', variables.profitText],
      ].map(([label, value]) =>
        ruledColumn(FIGURES_WIDTH, theme, 16, [text(label ?? '', TYPE.label, theme.muted, FIGURES_WIDTH), text(value ?? '', TYPE.figure, theme.text, FIGURES_WIDTH)]),
      )}
    </Rect>
  )
  const fiscalYear = fillPlaceholders(labels['fiscal-year'] ?? '{year}', { year: String(variables.fiscalYear) })
  const meta = text([fiscalYear, labels.source].filter(Boolean).join(' · '), TYPE.label, theme.muted, CONTENT_WIDTH)
  const body = (
    <Rect direction={'column'} gap={48}>
      {figures}
      {meta}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, { headline, body })
  return { root: framed.root, animate: reveal([framed.heading, figures, meta]) }
}

const BUYERS_COLUMN_GAP = 48
const BUYERS_ROW_GAP = 56
const BUYERS_ITEM_WIDTH = (CONTENT_WIDTH - 2 * BUYERS_COLUMN_GAP) / 3
const BUYERS_LOGO_WIDTH = 240
const BUYERS_LOGO_HEIGHT = 64

function buyerItem(buyer: BuyerSlideItem, theme: Theme, ctx: SlideContext): Node {
  const logo = ctx.image(buyer.logoFile)
  return ruledColumn(BUYERS_ITEM_WIDTH, theme, 12, [
    ...(logo
      ? [
          <Rect height={BUYERS_LOGO_HEIGHT} alignItems={'center'} marginBottom={12} shrink={0}>
            {image(logo, BUYERS_LOGO_WIDTH, BUYERS_LOGO_HEIGHT)}
          </Rect>,
        ]
      : []),
    text(buyer.name, TYPE.name, theme.text, BUYERS_ITEM_WIDTH),
    text(buyer.focus, TYPE.label, theme.body, BUYERS_ITEM_WIDTH),
  ])
}

function buyersSlide(variables: Variables<'buyers'>, labels: Labels, ctx: SlideContext): SlideView {
  if (variables.buyers.length === 0) return statementSlide(labels.headline ?? '', labels.empty ?? '', ctx)
  const theme = lightTheme(ctx.brand)
  const items = variables.buyers.slice(0, 6).map((buyer) => buyerItem(buyer, theme, ctx))
  const body = (
    <Rect width={CONTENT_WIDTH} direction={'row'} wrap={'wrap'} columnGap={BUYERS_COLUMN_GAP} rowGap={BUYERS_ROW_GAP}>
      {items}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, { headline: labels.headline ?? '', body })
  return { root: framed.root, animate: reveal([framed.heading, ...items], 4, 3) }
}

const POSSIBLE_GAP = 64
const POSSIBLE_WIDTH = (CONTENT_WIDTH - POSSIBLE_GAP) / 2
const SUMMARY_WIDTH = (CONTENT_WIDTH - 2 * POSSIBLE_GAP) / 3

function multipleText(value: number, lang: Lang): string {
  return `${new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)} ×`
}

function stat(value: string, label: string, theme: Theme, width: number): Node {
  return (
    <Rect direction={'column'} gap={4} width={width} shrink={0}>
      {text(value, TYPE.number, theme.text, width)}
      {text(label, TYPE.label, theme.muted, width)}
    </Rect>
  )
}

function whatIsPossibleSlide(variables: Variables<'what-is-possible'>, labels: Labels, ctx: SlideContext): SlideView {
  const headline = labels.headline ?? ''
  const [first, second] = variables.deals
  if (!first) return statementSlide(headline, labels.empty ?? '', ctx)
  if (!second) return statementSlide(headline, first.text, ctx, dealMeta(first, ctx))
  const theme = lightTheme(ctx.brand)
  const cards = [first, second].map((deal) =>
    ruledColumn(POSSIBLE_WIDTH, theme, 24, [
      text(dealMeta(deal, ctx), TYPE.label, theme.muted, POSSIBLE_WIDTH),
      text(deal.text, TYPE.quote, theme.text, POSSIBLE_WIDTH),
      ...(deal.profitMultiple ? [stat(multipleText(deal.profitMultiple, ctx.lang), labels.multiple ?? '', theme, POSSIBLE_WIDTH)] : []),
    ]),
  )
  const { summary } = variables
  const summaryRow = summary ? (
    <Rect direction={'row'} gap={POSSIBLE_GAP}>
      {[
        [new Intl.NumberFormat(ctx.lang).format(summary.dealCount), labels['summary-deals'] ?? ''],
        [multipleText(summary.p25, ctx.lang), labels['summary-low'] ?? ''],
        [multipleText(summary.p75, ctx.lang), labels['summary-high'] ?? ''],
      ].map(([value, label]) => ruledColumn(SUMMARY_WIDTH, theme, 16, [stat(value ?? '', label ?? '', theme, SUMMARY_WIDTH)]))}
    </Rect>
  ) : null
  const row = (
    <Rect direction={'row'} gap={POSSIBLE_GAP}>
      {cards}
    </Rect>
  )
  const body = summaryRow ? (
    <Rect direction={'column'} gap={96}>
      {row}
      {summaryRow}
    </Rect>
  ) : (
    row
  )
  const framed = framedSlide(ctx, theme, { eyebrow: headline, body, align: 'center' })
  return { root: framed.root, animate: reveal(summaryRow ? [framed.heading, ...cards, summaryRow] : [framed.heading, ...cards]) }
}

const PRIVACY_GAP = 64
const PRIVACY_WIDTH = (CONTENT_WIDTH - 2 * PRIVACY_GAP) / 3
const PRIVACY_POINTS = ['point-1', 'point-2', 'point-3']

function privacySlide(labels: Labels, ctx: SlideContext): SlideView {
  const theme = lightTheme(ctx.brand)
  const columns = PRIVACY_POINTS.flatMap((key) => labels[key] ?? []).map((point, index) =>
    ruledColumn(PRIVACY_WIDTH, theme, 20, [
      text(String(index + 1).padStart(2, '0'), TYPE.number, theme.text, PRIVACY_WIDTH),
      text(point, TYPE.text, theme.body, PRIVACY_WIDTH),
    ]),
  )
  const body = (
    <Rect direction={'row'} gap={PRIVACY_GAP}>
      {columns}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, { headline: labels.headline ?? '', body })
  return { root: framed.root, animate: reveal([framed.heading, ...columns]) }
}

const MEETING_PHOTO = 320
const MEETING_GAP = 96

function bookMeetingSlide(variables: Variables<'book-meeting'>, labels: Labels, ctx: SlideContext): SlideView {
  const theme = darkTheme(ctx.brand)
  const logo = ctx.logo(theme)
  const still = ctx.still
  const leadWidth = still ? CONTENT_WIDTH - MEETING_PHOTO - MEETING_GAP : 1500
  const photoScale = still ? Math.max(MEETING_PHOTO / still.width, MEETING_PHOTO / still.height) : 1
  const photo = still ? (
    <Rect width={MEETING_PHOTO} height={MEETING_PHOTO} radius={MEETING_PHOTO / 2} clip shrink={0}>
      <Img layout={false} src={still.url} width={still.width * photoScale} height={still.height * photoScale} />
    </Rect>
  ) : null
  const heading = (
    <Rect direction={'column'} gap={48} width={leadWidth}>
      {eyebrow(labels.headline ?? '', theme, ctx, leadWidth)}
      {text(variables.analystName, TYPE.display, theme.text, leadWidth, 'left', 'balance')}
    </Rect>
  )
  const line = text(labels.line ?? '', TYPE.body, theme.body, Math.min(leadWidth, 1200))
  const root = (
    <Rect
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      fill={theme.background}
      layout
      direction={'column'}
      padding={[FRAME.top, FRAME.side, FRAME.bottom, FRAME.side]}
    >
      <Rect shrink={0}>{logo ? image(logo, LOGO_WIDTH, LOGO_HEIGHT) : null}</Rect>
      <Rect width={CONTENT_WIDTH} grow={1} direction={'row'} alignItems={'center'} gap={MEETING_GAP}>
        <Rect direction={'column'} gap={48} width={leadWidth}>
          {heading}
          {line}
        </Rect>
        {photo}
      </Rect>
    </Rect>
  )
  return { root, animate: reveal(photo ? [heading, line, photo] : [heading, line]) }
}

function buildSlide(segment: Segment, ctx: SlideContext, frames: number): SlideView {
  if (segment.template === 'facecam') return facecamSlide(segment.variables, ctx)
  const { labels, variables } = segment
  switch (variables.template) {
    case 'who-we-are':
      return whoWeAreSlide(variables, labels, ctx)
    case 'your-company':
      return yourCompanySlide(variables, labels, ctx, frames)
    case 'your-figures':
      return yourFiguresSlide(variables, labels, ctx)
    case 'buyers':
      return buyersSlide(variables, labels, ctx)
    case 'what-is-possible':
      return whatIsPossibleSlide(variables, labels, ctx)
    case 'privacy':
      return privacySlide(labels, ctx)
    case 'book-meeting':
      return bookMeetingSlide(variables, labels, ctx)
  }
}

export default makeScene2D('mergero', function* (view) {
  const variables = useScene().variables
  const input = JSON.parse(decodeBase64(variables.get('input', '')())) as RenderInput
  const stillBase64 = variables.get('still', '')()
  const { brand, timeline } = input
  const logoOnLight = fileUrl(joinPath(input.repoRoot, brand.logoOnLight))
  const logoOnDark = fileUrl(joinPath(input.repoRoot, brand.logoOnDark))
  const stillUrl = stillBase64 ? fileUrl(decodeBase64(stillBase64)) : null

  view.element.style.overflowWrap = 'break-word'
  yield Promise.all(
    [`400 72px "${HEADING_FONT}"`, `300 40px "${FONT}"`, `400 40px "${FONT}"`, `500 40px "${FONT}"`].map((font) =>
      document.fonts.load(font, FONT_GLYPHS),
    ),
  )
  const assets = (yield loadAssets(input, stillUrl ? [logoOnLight, logoOnDark, stillUrl] : [logoOnLight, logoOnDark])) as Assets

  const ctx: SlideContext = {
    brand,
    lang: timeline.language,
    fps: timeline.fps,
    logo: (theme) => assets.images.get(theme.logo === 'dark' ? logoOnLight : logoOnDark) ?? null,
    still: stillUrl ? (assets.images.get(stillUrl) ?? null) : null,
    image: (file) => (file ? (assets.images.get(storageUrl(input, file)) ?? null) : null),
    media: (file) => {
      const media = assets.media.get(storageUrl(input, file))
      if (!media) throw new Error(`Media not loaded: ${file}`)
      return media
    },
    lines: (node, style) => {
      view.add(node)
      const count = Math.round(node.height() / style.lineHeight)
      node.remove()
      node.dispose()
      return count
    },
  }

  let outgoing: Node | null = null
  for (const segment of timeline.segments) {
    if (segment.durationS === null) throw new Error(`Slide ${segment.slide} has no duration`)
    const frames = segmentFrames(segment.durationS, timeline.fps)
    const slide = buildSlide(segment, ctx, frames)
    const audioFile = segment.template === 'facecam' ? null : segment.audio.file
    const audio = audioFile ? new Audio({ src: storageUrl(input, audioFile) }) : null
    const incoming = (
      <Group opacity={outgoing ? 0 : 1}>
        {slide.root}
        {audio}
      </Group>
    )
    yield view.add(incoming)
    slide.video?.play()
    audio?.play()

    for (let frame = 0; frame < frames; frame++) {
      if (outgoing) {
        incoming.opacity(fade(frame, 0, CROSSFADE_FRAMES))
        if (frame >= CROSSFADE_FRAMES) {
          outgoing.remove()
          outgoing = null
        }
      }
      slide.animate(frame)
      yield
    }

    slide.video?.pause()
    audio?.pause()
    outgoing?.remove()
    incoming.opacity(1)
    outgoing = incoming
  }
})
