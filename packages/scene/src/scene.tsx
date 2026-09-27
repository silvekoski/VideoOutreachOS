import type { Brand, BuyerSlideItem, DealCardItem, FacecamSegment, Lang, RenderInput, Segment, TemplateName, TemplateVariables } from '@mergero/shared'
import type { Node } from '@revideo/2d'
import { Audio, Img, makeScene2D, Node as Group, Path, Rect, Txt, Video } from '@revideo/2d'
import { clamp, createRef, easeOutCubic, useScene } from '@revideo/core'
import { SCENE_HEIGHT, SCENE_WIDTH, segmentFrames } from './timing.ts'

export const CANVAS_BACKGROUND = '#111111'

const FONT = 'Poppins'
const HEADING_FONT = 'Lora Variable'
const FONT_GLYPHS = 'AaåäöæøüßÅÄÖÆØÜŁőŠ0123456789€'

const FRAME = {
  top: 80,
  side: 120,
  bottom: 48,
  footer: 44,
  footerGap: 40,
  headlineGap: 56,
  eyebrowGap: 14,
}

const CONTENT_WIDTH = 1680
const BODY_HEIGHT = 676

const HAIRLINE_LIGHT = '#E5E5E5'
const BROWSER_DOT = '#CFCFCF'
const SHADOW = 'rgba(11, 15, 20, 0.14)'

const TYPE = {
  headline: { fontFamily: HEADING_FONT, fontSize: 60, lineHeight: 68, fontWeight: 600, letterSpacing: -0.8 },
  figure: { fontFamily: HEADING_FONT, fontSize: 88, lineHeight: 96, fontWeight: 600, letterSpacing: -1.5 },
  monogram: { fontFamily: HEADING_FONT, fontSize: 88, lineHeight: 96, fontWeight: 600, letterSpacing: -1.5 },
  year: { fontFamily: HEADING_FONT, fontSize: 72, lineHeight: 76, fontWeight: 600, letterSpacing: -1 },
  lowerThird: { fontFamily: HEADING_FONT, fontSize: 46, lineHeight: 52, fontWeight: 600, letterSpacing: -0.4 },
  lead: { fontFamily: FONT, fontSize: 40, lineHeight: 56, fontWeight: 400, letterSpacing: -0.4 },
  person: { fontFamily: HEADING_FONT, fontSize: 40, lineHeight: 48, fontWeight: 600, letterSpacing: -0.3 },
  body: { fontFamily: FONT, fontSize: 36, lineHeight: 50, fontWeight: 400, letterSpacing: -0.3 },
  text: { fontFamily: FONT, fontSize: 29, lineHeight: 42, fontWeight: 400, letterSpacing: -0.2 },
  label: { fontFamily: FONT, fontSize: 31, lineHeight: 44, fontWeight: 500, letterSpacing: -0.2 },
  name: { fontFamily: FONT, fontSize: 27, lineHeight: 36, fontWeight: 600, letterSpacing: -0.2 },
  card: { fontFamily: FONT, fontSize: 25, lineHeight: 36, fontWeight: 400, letterSpacing: -0.1 },
  small: { fontFamily: FONT, fontSize: 23, lineHeight: 32, fontWeight: 400, letterSpacing: 0 },
  caption: { fontFamily: FONT, fontSize: 21, lineHeight: 29, fontWeight: 500, letterSpacing: 0 },
  eyebrow: { fontFamily: FONT, fontSize: 22, lineHeight: 30, fontWeight: 600, letterSpacing: 0.2 },
  address: { fontFamily: FONT, fontSize: 18, lineHeight: 24, fontWeight: 500, letterSpacing: 0 },
} as const

type TypeStyle = (typeof TYPE)[keyof typeof TYPE]

const HEADLINE_HEIGHT = 2 * TYPE.headline.lineHeight
const EYEBROW_SPACE = TYPE.eyebrow.lineHeight + FRAME.eyebrowGap

const CROSSFADE_FRAMES = 10
const PROGRESS_SLIDES = 7
const FIRST_PROGRESS_SLIDE = 2
const IMAGE_TIMEOUT_MS = 15_000
const MEDIA_TIMEOUT_MS = 30_000

interface Theme {
  background: string
  text: string
  muted: string
  accent: string
  hairline: string
  panel: string
  iconFill: string
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
    muted: brand.muted,
    accent: brand.primary,
    hairline: HAIRLINE_LIGHT,
    panel: brand.surface,
    iconFill: brand.surface,
    logo: 'dark',
  }
}

function inkTheme(brand: Brand): Theme {
  return {
    background: brand.ink,
    text: brand.white,
    muted: 'rgba(255, 255, 255, 0.72)',
    accent: brand.white,
    hairline: 'rgba(255, 255, 255, 0.16)',
    panel: 'rgba(255, 255, 255, 0.06)',
    iconFill: brand.primary,
    logo: 'light',
  }
}

function primaryTheme(brand: Brand): Theme {
  return {
    background: brand.primary,
    text: brand.white,
    muted: 'rgba(255, 255, 255, 0.9)',
    accent: brand.white,
    hairline: 'rgba(255, 255, 255, 0.32)',
    panel: 'rgba(255, 255, 255, 0.12)',
    iconFill: brand.white,
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

function reveal(groups: Node[], start = 4, stagger = 5): (frame: number) => void {
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

function image(loaded: LoadedImage, maxWidth: number, maxHeight: number): Node {
  const scale = Math.min(maxWidth / loaded.width, maxHeight / loaded.height)
  return <Img src={loaded.url} width={Math.round(loaded.width * scale)} height={Math.round(loaded.height * scale)} />
}

function icon(data: string, size: number, stroke: string, background: string): Node {
  const scale = (size * 0.46) / 24
  return (
    <Rect width={size} height={size} radius={size / 2} fill={background} shrink={0}>
      <Path
        layout={false}
        data={data}
        stroke={stroke}
        lineWidth={1.9}
        lineCap={'round'}
        lineJoin={'round'}
        scale={scale}
        position={[-12 * scale, -12 * scale]}
      />
    </Rect>
  )
}

const ICONS = {
  lock: 'M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 6 10.5z M8 10.5V7.5a4 4 0 0 1 8 0v3 M12 14.5v2.5',
  eyeOff:
    'M2.5 12c2.3-4.2 5.5-6.5 9.5-6.5s7.2 2.3 9.5 6.5c-2.3 4.2-5.5 6.5-9.5 6.5S4.8 16.2 2.5 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M4 4l16 16',
  check: 'M12 2.75a9.25 9.25 0 1 0 0 18.5a9.25 9.25 0 1 0 0-18.5z M7.8 12.3l2.9 2.9l5.5-5.8',
  calendar:
    'M5.5 5h13a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5z M4 9.5h16 M8.5 3v4 M15.5 3v4 M8.5 13.5h0.2 M12 13.5h0.2 M15.5 13.5h0.2 M8.5 16.5h0.2 M12 16.5h0.2',
  form: 'M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z M8.5 8.5h7 M8.5 12h7 M8.5 15.5h4',
}

function progress(slide: number, theme: Theme): Node {
  return (
    <Rect direction={'row'} gap={8} alignItems={'center'}>
      {Array.from({ length: PROGRESS_SLIDES }, (_, index) => (
        <Rect
          width={28}
          height={4}
          radius={2}
          fill={index === slide - FIRST_PROGRESS_SLIDE ? theme.accent : theme.hairline}
        />
      ))}
    </Rect>
  )
}

interface FramedSlide {
  root: Node
  heading: Node
}

interface FrameContent {
  headline: string
  eyebrow?: string
  headlineLines?: number
  body: Node
}

function framedSlide(ctx: SlideContext, theme: Theme, slide: number, content: FrameContent): FramedSlide {
  const logo = ctx.logo(theme)
  const extra = content.eyebrow ? EYEBROW_SPACE : 0
  const moreLines = Math.max(0, (content.headlineLines ?? 2) - 2) * TYPE.headline.lineHeight
  const title = text(content.headline, TYPE.headline, theme.text, CONTENT_WIDTH, 'left', 'balance')
  const heading = content.eyebrow ? (
    <Rect direction={'column'} gap={FRAME.eyebrowGap}>
      {text(content.eyebrow, TYPE.eyebrow, theme.accent, CONTENT_WIDTH)}
      {title}
    </Rect>
  ) : (
    title
  )
  const root = (
    <Rect
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      fill={theme.background}
      layout
      direction={'column'}
      padding={[FRAME.top, FRAME.side, FRAME.bottom, FRAME.side]}
      gap={FRAME.footerGap}
    >
      <Rect direction={'column'} width={CONTENT_WIDTH} gap={FRAME.headlineGap}>
        <Rect width={CONTENT_WIDTH} height={HEADLINE_HEIGHT + moreLines + extra}>
          {heading}
        </Rect>
        <Rect width={CONTENT_WIDTH} height={BODY_HEIGHT - moreLines - extra}>
          {content.body}
        </Rect>
      </Rect>
      <Rect
        width={CONTENT_WIDTH}
        height={FRAME.footer}
        direction={'row'}
        alignItems={'center'}
        justifyContent={'space-between'}
      >
        {logo ? image(logo, 480, FRAME.footer) : <Rect />}
        {progress(slide, theme)}
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

const FACECAM_PORTRAIT_TOP_BIAS = 0.2
const FACECAM_MARGIN = 96
const FACECAM_NAME_WIDTH = 1200
const FACECAM_BAR_HEIGHT = 92

function facecamSlide(variables: FacecamSegment['variables'], ctx: SlideContext): SlideView {
  const media = ctx.media(variables.videoFile)
  const scale = media.width > 0 && media.height > 0 ? Math.max(SCENE_WIDTH / media.width, SCENE_HEIGHT / media.height) : 1
  const width = media.width > 0 ? Math.round(media.width * scale) : SCENE_WIDTH
  const height = media.height > 0 ? Math.round(media.height * scale) : SCENE_HEIGHT
  const logo = ctx.logo(inkTheme(ctx.brand))
  const video = createRef<Video>()
  const lowerThird = createRef<Rect>()
  const name = () =>
    (
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
    ) as Txt
  const nameLines = ctx.lines(name(), TYPE.lowerThird)

  const root = (
    <Rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill={ctx.brand.ink} clip>
      <Video ref={video} src={media.url} width={width} height={height} y={(height - SCENE_HEIGHT) * FACECAM_PORTRAIT_TOP_BIAS} />
      <Rect
        ref={lowerThird}
        layout
        direction={'row'}
        alignItems={'center'}
        gap={28}
        padding={[30, 44, 30, 32]}
        radius={16}
        fill={withAlpha(ctx.brand.ink, 0.88)}
        offset={[-1, 1]}
        position={[-SCENE_WIDTH / 2 + FACECAM_MARGIN, SCENE_HEIGHT / 2 - FACECAM_MARGIN]}
      >
        <Rect
          width={6}
          height={FACECAM_BAR_HEIGHT + (nameLines - 1) * TYPE.lowerThird.lineHeight}
          radius={3}
          fill={ctx.brand.primary}
        />
        <Rect direction={'column'} gap={16}>
          {name()}
          {logo ? image(logo, 360, 32) : null}
        </Rect>
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

const WHO_LOGO_COLUMN = 800
const WHO_DEAL_COLUMN = CONTENT_WIDTH - WHO_LOGO_COLUMN - 48
const WHO_HEADING_GAP = 20
const WHO_GRID_HEIGHT = BODY_HEIGHT - TYPE.eyebrow.lineHeight - WHO_HEADING_GAP
const WHO_TILE_GAP = 24
const WHO_TILE_WIDTH = (WHO_LOGO_COLUMN - WHO_TILE_GAP) / 2
const WHO_TILE_HEIGHT = Math.floor((WHO_GRID_HEIGHT - 2 * WHO_TILE_GAP) / 3)
const WHO_TILE_LOGO_HEIGHT = 84
const WHO_CARD_GAP = 14
const WHO_CARD_HEIGHT = Math.floor((WHO_GRID_HEIGHT - 2 * WHO_CARD_GAP) / 3)
const WHO_CARD_PADDING = 24

function whoWeAreBuyerTile(buyer: BuyerSlideItem, theme: Theme, ctx: SlideContext): Node {
  const logo = ctx.image(buyer.logoFile)
  const inner = WHO_TILE_WIDTH - 48
  return (
    <Rect
      width={WHO_TILE_WIDTH}
      height={WHO_TILE_HEIGHT}
      radius={14}
      fill={ctx.brand.white}
      stroke={theme.hairline}
      lineWidth={2}
      direction={'column'}
      alignItems={'center'}
      justifyContent={'center'}
      gap={12}
      padding={[16, 24]}
    >
      {logo ? (
        <Rect width={inner} height={WHO_TILE_LOGO_HEIGHT} alignItems={'center'} justifyContent={'center'} shrink={0}>
          {image(logo, inner - 40, WHO_TILE_LOGO_HEIGHT)}
        </Rect>
      ) : null}
      {logo
        ? text(buyer.name, TYPE.caption, theme.muted, inner, 'center')
        : text(buyer.name, TYPE.name, theme.text, inner, 'center')}
    </Rect>
  )
}

function whoWeAreDealCard(deal: DealCardItem, theme: Theme, ctx: SlideContext): Node {
  const inner = WHO_DEAL_COLUMN - 2 * WHO_CARD_PADDING
  return (
    <Rect
      width={WHO_DEAL_COLUMN}
      height={WHO_CARD_HEIGHT}
      radius={16}
      fill={theme.panel}
      direction={'column'}
      gap={8}
      padding={WHO_CARD_PADDING}
    >
      {text(`${deal.year} · ${countryName(deal.country, ctx.lang)}`, TYPE.eyebrow, theme.accent, inner)}
      {text(deal.text, TYPE.card, theme.text, inner)}
    </Rect>
  )
}

function whoWeAreColumn(width: number, heading: string, theme: Theme, content: Node): Node {
  return (
    <Rect width={width} height={BODY_HEIGHT} direction={'column'} gap={WHO_HEADING_GAP}>
      {text(heading, TYPE.eyebrow, theme.muted, width)}
      {content}
    </Rect>
  )
}

function whoWeAreSlide(slide: number, variables: Variables<'who-we-are'>, labels: Labels, ctx: SlideContext): SlideView {
  const theme = lightTheme(ctx.brand)
  const headline = fillPlaceholders(labels.headline ?? '', { buyerCount: new Intl.NumberFormat(ctx.lang).format(variables.buyerCount) })
  const logos = whoWeAreColumn(
    WHO_LOGO_COLUMN,
    labels['buyers-heading'] ?? '',
    theme,
    <Rect width={WHO_LOGO_COLUMN} height={WHO_GRID_HEIGHT} direction={'row'} wrap={'wrap'} gap={WHO_TILE_GAP} alignContent={'start'}>
      {variables.buyers.slice(0, 6).map((buyer) => whoWeAreBuyerTile(buyer, theme, ctx))}
    </Rect>,
  )
  const deals = whoWeAreColumn(
    WHO_DEAL_COLUMN,
    labels['deals-heading'] ?? '',
    theme,
    <Rect width={WHO_DEAL_COLUMN} height={WHO_GRID_HEIGHT} direction={'column'} gap={WHO_CARD_GAP}>
      {variables.deals.slice(0, 3).map((deal) => whoWeAreDealCard(deal, theme, ctx))}
    </Rect>,
  )
  const body = (
    <Rect width={CONTENT_WIDTH} height={BODY_HEIGHT} direction={'row'} gap={48}>
      {logos}
      {deals}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, slide, { headline, body })
  return { root: framed.root, animate: reveal([framed.heading, logos, deals]) }
}

const COMPANY_FRAME_WIDTH = 992
const COMPANY_FRAME_HEIGHT = 620
const COMPANY_BAR_HEIGHT = 56
const COMPANY_GAP = 48

function hostName(website: string | null): string {
  if (!website) return ''
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(website) ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/+$/, '')
  } catch {
    return website
  }
}

function browserFrame(
  screenshot: LoadedImage,
  website: string | null,
  frameWidth: number,
  frameHeight: number,
  theme: Theme,
  ctx: SlideContext,
): Node {
  const viewportHeight = frameHeight - COMPANY_BAR_HEIGHT
  const scale = Math.max(frameWidth / screenshot.width, viewportHeight / screenshot.height)
  const width = Math.round(screenshot.width * scale)
  const height = Math.round(screenshot.height * scale)
  return (
    <Rect
      width={frameWidth}
      height={frameHeight}
      radius={18}
      fill={ctx.brand.white}
      stroke={theme.hairline}
      lineWidth={2}
      clip
      direction={'column'}
      shadowColor={SHADOW}
      shadowBlur={60}
      shadowOffset={[0, 24]}
    >
      <Rect
        width={frameWidth}
        height={COMPANY_BAR_HEIGHT}
        fill={theme.panel}
        direction={'row'}
        alignItems={'center'}
        gap={10}
        padding={[0, 24]}
        shrink={0}
      >
        <Rect width={13} height={13} radius={7} fill={BROWSER_DOT} />
        <Rect width={13} height={13} radius={7} fill={BROWSER_DOT} />
        <Rect width={13} height={13} radius={7} fill={BROWSER_DOT} />
        <Rect
          grow={1}
          basis={0}
          minWidth={0}
          height={34}
          marginLeft={22}
          marginRight={96}
          radius={9}
          fill={ctx.brand.white}
          alignItems={'center'}
          padding={[0, 18]}
          clip
        >
          <Txt
            text={hostName(website)}
            fontFamily={TYPE.address.fontFamily}
            fontSize={TYPE.address.fontSize}
            lineHeight={TYPE.address.lineHeight}
            fontWeight={TYPE.address.fontWeight}
            fill={theme.muted}
          />
        </Rect>
      </Rect>
      <Rect width={frameWidth} height={viewportHeight} clip shrink={0}>
        <Img layout={false} src={screenshot.url} width={width} height={height} y={(height - viewportHeight) / 2} />
      </Rect>
    </Rect>
  )
}

function yourCompanySlide(slide: number, variables: Variables<'your-company'>, labels: Labels, ctx: SlideContext): SlideView {
  const theme = lightTheme(ctx.brand)
  const screenshot = ctx.image(variables.screenshotFile)
  const title = text(variables.company, TYPE.headline, theme.text, CONTENT_WIDTH, 'left', 'balance')
  const headlineLines = Math.max(2, ctx.lines(title, TYPE.headline))
  const bodyHeight = BODY_HEIGHT - EYEBROW_SPACE - (headlineLines - 2) * TYPE.headline.lineHeight
  const frameHeight = Math.min(COMPANY_FRAME_HEIGHT, bodyHeight)
  const frameWidth = Math.round((COMPANY_FRAME_WIDTH * frameHeight) / COMPANY_FRAME_HEIGHT)
  const linesWidth = screenshot ? CONTENT_WIDTH - frameWidth - COMPANY_GAP : 1100
  const lines = (
    <Rect width={linesWidth} direction={'column'} gap={40} paddingTop={6}>
      {variables.lines.slice(0, 3).map((line) => (
        <Rect direction={'row'} gap={24}>
          <Rect width={5} radius={3} fill={theme.accent} alignSelf={'stretch'} shrink={0} />
          {text(line, TYPE.text, theme.text, linesWidth - 29)}
        </Rect>
      ))}
    </Rect>
  )
  const frame = screenshot ? browserFrame(screenshot, variables.website, frameWidth, frameHeight, theme, ctx) : null
  const body = (
    <Rect width={CONTENT_WIDTH} height={bodyHeight} direction={'row'} gap={COMPANY_GAP}>
      {lines}
      {frame}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, slide, { eyebrow: labels.headline ?? '', headline: variables.company, headlineLines, body })
  return { root: framed.root, animate: reveal(frame ? [framed.heading, lines, frame] : [framed.heading, lines]) }
}

const STATEMENT_PADDING = 64
const STATEMENT_ICON = 120
const STATEMENT_GAP = 48

function statementSlide(slide: number, headline: string, statement: string, iconData: string, ctx: SlideContext): SlideView {
  const theme = lightTheme(ctx.brand)
  const panel = (
    <Rect
      width={CONTENT_WIDTH}
      radius={24}
      fill={theme.iconFill}
      direction={'row'}
      alignItems={'center'}
      gap={STATEMENT_GAP}
      padding={STATEMENT_PADDING}
    >
      {icon(iconData, STATEMENT_ICON, theme.accent, ctx.brand.white)}
      {text(statement, TYPE.lead, theme.text, CONTENT_WIDTH - 2 * STATEMENT_PADDING - STATEMENT_ICON - STATEMENT_GAP)}
    </Rect>
  )
  const body = (
    <Rect width={CONTENT_WIDTH} height={BODY_HEIGHT} alignItems={'start'}>
      {panel}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, slide, { headline, body })
  return { root: framed.root, animate: reveal([framed.heading, panel]) }
}

const FIGURES_PANEL_GAP = 48
const FIGURES_PANEL_WIDTH = (CONTENT_WIDTH - FIGURES_PANEL_GAP) / 2
const FIGURES_PANEL_PADDING = 56

function figurePanel(label: string, value: string, theme: Theme): Node {
  const inner = FIGURES_PANEL_WIDTH - 2 * FIGURES_PANEL_PADDING
  return (
    <Rect
      width={FIGURES_PANEL_WIDTH}
      height={420}
      radius={20}
      fill={theme.panel}
      direction={'column'}
      justifyContent={'space-between'}
      padding={[48, FIGURES_PANEL_PADDING]}
    >
      <Rect direction={'column'} gap={18}>
        <Rect width={56} height={6} radius={3} fill={theme.accent} />
        {text(label, TYPE.label, theme.muted, inner)}
      </Rect>
      {text(value, TYPE.figure, theme.text, inner)}
    </Rect>
  )
}

function yourFiguresSlide(slide: number, variables: Variables<'your-figures'>, labels: Labels, ctx: SlideContext): SlideView {
  const headline = labels.headline ?? ''
  if (variables.mode === 'ask') {
    return statementSlide(slide, headline, labels[variables.calculator ? 'ask-calculator' : 'ask-form'] ?? '', ICONS.form, ctx)
  }
  const theme = lightTheme(ctx.brand)
  const panels = (
    <Rect direction={'row'} gap={FIGURES_PANEL_GAP}>
      {figurePanel(labels.revenue ?? '', variables.revenueText, theme)}
      {figurePanel(labels.profit ?? '', variables.profitText, theme)}
    </Rect>
  )
  const fiscalYear = fillPlaceholders(labels['fiscal-year'] ?? '{year}', { year: String(variables.fiscalYear) })
  const meta = text([fiscalYear, labels.source].filter(Boolean).join(' · '), TYPE.text, theme.muted, CONTENT_WIDTH)
  const body = (
    <Rect width={CONTENT_WIDTH} height={BODY_HEIGHT} direction={'column'} gap={36}>
      {panels}
      {meta}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, slide, { headline, body })
  return { root: framed.root, animate: reveal([framed.heading, panels, meta]) }
}

const BUYERS_COLUMN_GAP = 48
const BUYERS_ROW_GAP = 28
const BUYERS_ITEM_WIDTH = (CONTENT_WIDTH - BUYERS_COLUMN_GAP) / 2
const BUYERS_ITEM_HEIGHT = Math.floor((BODY_HEIGHT - 2 * BUYERS_ROW_GAP) / 3)
const BUYERS_LOGO_WIDTH = 200
const BUYERS_LOGO_HEIGHT = 88
const BUYERS_TEXT_WIDTH = BUYERS_ITEM_WIDTH - BUYERS_LOGO_WIDTH - 36

function buyerItem(buyer: BuyerSlideItem, theme: Theme, ctx: SlideContext): Node {
  const logo = ctx.image(buyer.logoFile)
  return (
    <Rect width={BUYERS_ITEM_WIDTH} height={BUYERS_ITEM_HEIGHT} direction={'column'} gap={28}>
      <Rect width={BUYERS_ITEM_WIDTH} height={2} fill={theme.hairline} shrink={0} />
      <Rect direction={'row'} gap={36}>
        <Rect width={BUYERS_LOGO_WIDTH} height={BUYERS_LOGO_HEIGHT} alignItems={'center'} shrink={0}>
          {logo ? (
            image(logo, BUYERS_LOGO_WIDTH, BUYERS_LOGO_HEIGHT)
          ) : (
            <Rect
              width={BUYERS_LOGO_HEIGHT}
              height={BUYERS_LOGO_HEIGHT}
              radius={16}
              fill={theme.panel}
              alignItems={'center'}
              justifyContent={'center'}
            >
              {text(initials(buyer.name), TYPE.label, theme.muted, BUYERS_LOGO_HEIGHT, 'center')}
            </Rect>
          )}
        </Rect>
        <Rect direction={'column'} gap={8}>
          {text(buyer.name, TYPE.name, theme.text, BUYERS_TEXT_WIDTH)}
          {text(buyer.focus, TYPE.small, theme.muted, BUYERS_TEXT_WIDTH)}
        </Rect>
      </Rect>
    </Rect>
  )
}

function buyersSlide(slide: number, variables: Variables<'buyers'>, labels: Labels, ctx: SlideContext): SlideView {
  if (variables.buyers.length === 0) return statementSlide(slide, labels.headline ?? '', labels.empty ?? '', ICONS.calendar, ctx)
  const theme = lightTheme(ctx.brand)
  const items = variables.buyers.slice(0, 6).map((buyer) => buyerItem(buyer, theme, ctx))
  const body = (
    <Rect
      width={CONTENT_WIDTH}
      height={BODY_HEIGHT}
      direction={'row'}
      wrap={'wrap'}
      columnGap={BUYERS_COLUMN_GAP}
      rowGap={BUYERS_ROW_GAP}
      alignContent={'start'}
    >
      {items}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, slide, { headline: labels.headline ?? '', body })
  return { root: framed.root, animate: reveal([framed.heading, ...items], 4, 3) }
}

const POSSIBLE_PADDING_X = 56
const POSSIBLE_SIDE_WIDTH = 280
const POSSIBLE_GAP = 48
const POSSIBLE_TEXT_WIDTH = CONTENT_WIDTH - 2 * POSSIBLE_PADDING_X - POSSIBLE_SIDE_WIDTH - POSSIBLE_GAP

function possibleDealCard(deal: DealCardItem, theme: Theme, ctx: SlideContext): Node {
  return (
    <Rect width={CONTENT_WIDTH} radius={20} fill={theme.panel} direction={'row'} gap={POSSIBLE_GAP} padding={[48, POSSIBLE_PADDING_X]}>
      <Rect width={POSSIBLE_SIDE_WIDTH} direction={'column'} gap={8} shrink={0}>
        {text(String(deal.year), TYPE.year, theme.accent, POSSIBLE_SIDE_WIDTH)}
        {text(countryName(deal.country, ctx.lang), TYPE.label, theme.muted, POSSIBLE_SIDE_WIDTH)}
      </Rect>
      {text(deal.text, TYPE.body, theme.text, POSSIBLE_TEXT_WIDTH)}
    </Rect>
  )
}

function whatIsPossibleSlide(slide: number, variables: Variables<'what-is-possible'>, labels: Labels, ctx: SlideContext): SlideView {
  if (variables.deals.length === 0) return statementSlide(slide, labels.headline ?? '', labels.empty ?? '', ICONS.calendar, ctx)
  const theme = lightTheme(ctx.brand)
  const cards = variables.deals.slice(0, 2).map((deal) => possibleDealCard(deal, theme, ctx))
  const body = (
    <Rect width={CONTENT_WIDTH} height={BODY_HEIGHT} direction={'column'} gap={28}>
      {cards}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, slide, { headline: labels.headline ?? '', body })
  return { root: framed.root, animate: reveal([framed.heading, ...cards]) }
}

const PRIVACY_ICON_SIZE = 104
const PRIVACY_GAP = 40
const PRIVACY_POINTS = [
  { key: 'point-1', icon: ICONS.eyeOff },
  { key: 'point-2', icon: ICONS.check },
  { key: 'point-3', icon: ICONS.lock },
]

function privacySlide(slide: number, labels: Labels, ctx: SlideContext): SlideView {
  const theme = inkTheme(ctx.brand)
  const rows = PRIVACY_POINTS.flatMap((point) => {
    const value = labels[point.key]
    return value
      ? [
          <Rect direction={'row'} alignItems={'center'} gap={PRIVACY_GAP}>
            {icon(point.icon, PRIVACY_ICON_SIZE, theme.accent, theme.iconFill)}
            {text(value, TYPE.body, theme.text, CONTENT_WIDTH - PRIVACY_ICON_SIZE - PRIVACY_GAP)}
          </Rect>,
        ]
      : []
  })
  const body = (
    <Rect width={CONTENT_WIDTH} height={BODY_HEIGHT} direction={'column'} gap={48}>
      {rows}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, slide, { headline: labels.headline ?? '', body })
  return { root: framed.root, animate: reveal([framed.heading, ...rows]) }
}

const MEETING_CARD_WIDTH = 560
const MEETING_CARD_PADDING = 48
const MEETING_PHOTO = 240
const MEETING_ICON_SIZE = 104
const MEETING_GAP = 80

function bookMeetingSlide(slide: number, variables: Variables<'book-meeting'>, labels: Labels, ctx: SlideContext): SlideView {
  const theme = primaryTheme(ctx.brand)
  const cardLogo = ctx.logo(lightTheme(ctx.brand))
  const still = ctx.still
  const photoScale = still ? Math.max(MEETING_PHOTO / still.width, MEETING_PHOTO / still.height) : 1
  const photo = still ? (
    <Rect width={MEETING_PHOTO} height={MEETING_PHOTO} radius={MEETING_PHOTO / 2} clip shrink={0}>
      <Img layout={false} src={still.url} width={still.width * photoScale} height={still.height * photoScale} />
    </Rect>
  ) : (
    <Rect width={MEETING_PHOTO} height={MEETING_PHOTO} radius={MEETING_PHOTO / 2} fill={ctx.brand.surface} alignItems={'center'} justifyContent={'center'} shrink={0}>
      {text(initials(variables.analystName), TYPE.monogram, ctx.brand.primary, MEETING_PHOTO, 'center')}
    </Rect>
  )
  const lead = (
    <Rect width={CONTENT_WIDTH - MEETING_CARD_WIDTH - MEETING_GAP} direction={'column'} gap={44}>
      {icon(ICONS.calendar, MEETING_ICON_SIZE, ctx.brand.primary, theme.iconFill)}
      {text(labels.line ?? '', TYPE.body, theme.muted, CONTENT_WIDTH - MEETING_CARD_WIDTH - MEETING_GAP)}
    </Rect>
  )
  const card = (
    <Rect
      width={MEETING_CARD_WIDTH}
      radius={28}
      fill={ctx.brand.white}
      direction={'column'}
      alignItems={'center'}
      gap={28}
      padding={MEETING_CARD_PADDING}
    >
      {photo}
      {text(variables.analystName, TYPE.person, ctx.brand.ink, MEETING_CARD_WIDTH - 2 * MEETING_CARD_PADDING, 'center')}
      {cardLogo ? image(cardLogo, 300, 28) : null}
    </Rect>
  )
  const body = (
    <Rect width={CONTENT_WIDTH} height={BODY_HEIGHT} direction={'row'} alignItems={'start'} gap={MEETING_GAP}>
      {lead}
      {card}
    </Rect>
  )
  const framed = framedSlide(ctx, theme, slide, { headline: labels.headline ?? '', body })
  return { root: framed.root, animate: reveal([framed.heading, lead, card]) }
}

function buildSlide(segment: Segment, ctx: SlideContext): SlideView {
  if (segment.template === 'facecam') return facecamSlide(segment.variables, ctx)
  const { slide, labels, variables } = segment
  switch (variables.template) {
    case 'who-we-are':
      return whoWeAreSlide(slide, variables, labels, ctx)
    case 'your-company':
      return yourCompanySlide(slide, variables, labels, ctx)
    case 'your-figures':
      return yourFiguresSlide(slide, variables, labels, ctx)
    case 'buyers':
      return buyersSlide(slide, variables, labels, ctx)
    case 'what-is-possible':
      return whatIsPossibleSlide(slide, variables, labels, ctx)
    case 'privacy':
      return privacySlide(slide, labels, ctx)
    case 'book-meeting':
      return bookMeetingSlide(slide, variables, labels, ctx)
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
    [`600 60px "${HEADING_FONT}"`, `400 40px "${FONT}"`, `500 40px "${FONT}"`, `600 40px "${FONT}"`].map((font) =>
      document.fonts.load(font, FONT_GLYPHS),
    ),
  )
  const assets = (yield loadAssets(input, stillUrl ? [logoOnLight, logoOnDark, stillUrl] : [logoOnLight, logoOnDark])) as Assets

  const ctx: SlideContext = {
    brand,
    lang: timeline.language,
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
    const slide = buildSlide(segment, ctx)
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

    if (segment.durationS === null) throw new Error(`Slide ${segment.slide} has no duration`)
    const frames = segmentFrames(segment.durationS, timeline.fps)
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
