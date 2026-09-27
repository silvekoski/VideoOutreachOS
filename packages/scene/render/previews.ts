import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Brand, BuyerSlideItem, DealCardItem, ScriptSlideNumber, Segment, SlideSegment, Timeline } from '@mergero/shared'
import { slideLabels } from '@mergero/shared/i18n'
import { SCENE_FPS, SCENE_HEIGHT, SCENE_WIDTH, segmentFrames } from '../src/timing.ts'
import { extractFrame, runTool } from './media.ts'
import { renderTimeline } from './render-timeline.ts'

export interface SampleMedia {
  intro: string
  introDurationS: number
  screenshot: string
  logos: string[]
  audio: { file: string; durationS: number }[]
}

export interface SampleMediaOptions {
  introS: number
  audioS: number
}

export interface TemplatePreviewOptions {
  outDir: string
  chromePath: string
  ffmpegPath: string
  ffprobePath: string
  brand: Brand
  repoRoot: string
}

const PAUSE_S = 0.4
const PREVIEW_WIDTH = 1280
const PREVIEW_MEDIA: SampleMediaOptions = { introS: 3, audioS: 2.1 }
const TONES_HZ = [262, 294, 330, 349, 392, 440, 494]

const SAMPLE_LOGOS = [
  { top: 'NORDIC GROWTH', bottom: 'PARTNERS', color: '#0F766E', mark: '<circle cx="64" cy="80" r="44"/>' },
  { top: 'BALTIC', bottom: 'INDUSTRIAL GROUP', color: '#B45309', mark: '<rect x="33" y="49" width="62" height="62" transform="rotate(45 64 80)"/>' },
  { top: 'Alpine', bottom: 'Holding AG', color: '#1D4ED8', mark: '<path d="M16 120 L56 40 L78 84 L90 64 L112 120 Z"/>' },
  { top: 'fjord', bottom: 'capital', color: '#0E7490', mark: '<rect x="20" y="44" width="88" height="18" rx="9"/><rect x="20" y="71" width="88" height="18" rx="9"/><rect x="20" y="98" width="60" height="18" rx="9"/>' },
  { top: 'HELVETIA', bottom: 'MACHINERY', color: '#B91C1C', mark: '<circle cx="64" cy="80" r="44"/><circle cx="64" cy="80" r="20" fill="#ffffff"/>' },
  { top: 'Lakeside', bottom: 'Equity', color: '#4338CA', mark: '<path d="M20 84 A44 44 0 0 1 108 84 Z"/><rect x="20" y="96" width="88" height="14" rx="7"/>' },
]

const SAMPLE_BUYERS: Omit<BuyerSlideItem, 'logoFile'>[] = [
  { id: 'b1', name: 'Nordic Growth Partners', focus: 'Industrial service and maintenance companies with stable margins', website: null },
  { id: 'b2', name: 'Baltic Industrial Group', focus: 'Metal and machining workshops with 20 to 200 staff', website: null },
  { id: 'b3', name: 'Alpine Holding AG', focus: 'Family-owned manufacturers in the DACH region and the Nordics', website: null },
  { id: 'b4', name: 'Fjord Capital', focus: 'Profitable B2B service companies with recurring revenue', website: null },
  { id: 'b5', name: 'Helvetia Machinery', focus: 'Machine builders and suppliers of automation systems', website: null },
  { id: 'b6', name: 'Lakeside Equity', focus: 'Owner-managed companies that look for a successor', website: null },
]

const SAMPLE_DEALS: DealCardItem[] = [
  { id: 'd1', year: 2025, country: 'FI', text: 'Family-owned metal workshop with 45 staff sold to a Swedish industrial group.' },
  { id: 'd2', year: 2024, country: 'DE', text: 'Regional HVAC service company joined a building services platform in the DACH region.' },
  { id: 'd3', year: 2024, country: 'SE', text: 'Software reseller with 30 staff sold to a Nordic IT services buyer.' },
]

const SECTOR_DEALS: DealCardItem[] = [
  { id: 'd4', year: 2025, country: 'FI', text: 'A Finnish machining company with 40 staff found a strategic buyer in eight months and kept its brand.', profitMultiple: 6.4 },
  { id: 'd5', year: 2023, country: 'NO', text: 'A Norwegian subcontractor for the process industry was sold to an owner-led industrial group.', profitMultiple: 5.1 },
]

function logoSvg(logo: (typeof SAMPLE_LOGOS)[number]): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160">',
    `<g fill="${logo.color}">${logo.mark}</g>`,
    '<g font-family="Helvetica, Arial, sans-serif" fill="#1B2330">',
    `<text x="136" y="78" font-size="38" font-weight="700">${logo.top}</text>`,
    `<text x="136" y="116" font-size="26" font-weight="400" fill="#4B5563">${logo.bottom}</text>`,
    '</g>',
    '</svg>',
    '',
  ].join('\n')
}

function faceFilter(): string {
  const alpha = 'max(clip(170.5-hypot(X-960,Y-440),0,1),clip((1-hypot((X-960)/420,(Y-1080)/400))*400+0.5,0,1))'
  const channel = (top: number, figure: number) => `(${top}-18*Y/1080)*(1-${alpha})+${figure}*${alpha}`
  return `format=rgb24,geq=r='${channel(58, 124)}':g='${channel(64, 132)}':b='${channel(76, 146)}'`
}

function siteFilter(): string {
  const text = (value: string, x: number, y: number, size: number, color: string) =>
    `drawtext=text='${value}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}`
  const box = (x: number, y: number, w: number, h: number, color: string) =>
    `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=fill`
  return [
    'format=rgb24',
    box(0, 75, 1440, 1, '0xE5E7EB'),
    box(64, 24, 28, 28, '0x1F6FEB'),
    text('Example Industrial', 106, 26, 26, '0x1B2330'),
    text('Services', 760, 30, 18, '0x4B5563'),
    text('Industries', 870, 30, 18, '0x4B5563'),
    text('About us', 990, 30, 18, '0x4B5563'),
    text('Careers', 1100, 30, 18, '0x4B5563'),
    box(1230, 18, 146, 40, '0x1F6FEB'),
    text('Contact us', 1256, 29, 18, '0xFFFFFF'),
    box(0, 76, 1440, 520, '0x1B2B38'),
    text('Precision parts for', 80, 196, 60, '0xFFFFFF'),
    text('Nordic industry', 80, 268, 60, '0xFFFFFF'),
    text('Machining, welding and assembly since 1987.', 80, 370, 24, '0xC7D0D9'),
    box(80, 440, 230, 56, '0xF08A24'),
    text('Request a quote', 104, 457, 21, '0xFFFFFF'),
    box(800, 136, 560, 400, '0x2C4A5E'),
    box(860, 196, 200, 280, '0x3D6680'),
    box(1100, 256, 200, 220, '0x4F7F9C'),
    ...['CNC machining', 'Welding', 'Final assembly'].flatMap((title, index) => {
      const x = 80 + index * 440
      return [
        box(x, 648, 48, 48, '0xE8F0FE'),
        text(title, x, 716, 26, '0x1B2330'),
        text('Short series and large volumes', x, 758, 18, '0x6B7280'),
        text('for machine builders.', x, 784, 18, '0x6B7280'),
      ]
    }),
  ].join(',')
}

export async function makeSampleMedia(storageDir: string, ffmpegPath: string, options: SampleMediaOptions): Promise<SampleMedia> {
  const dir = path.join(storageDir, 'sample')
  await mkdir(dir, { recursive: true })
  const facePng = path.join(dir, 'face.png')
  await runTool(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=1', '-vf', faceFilter(), '-frames:v', '1', facePng])
  await runTool(ffmpegPath, [
    '-v', 'error', '-y',
    '-loop', '1', '-framerate', String(SCENE_FPS), '-i', facePng,
    '-f', 'lavfi', '-i', 'sine=frequency=196:sample_rate=48000',
    '-t', String(options.introS),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    path.join(dir, 'intro.mp4'),
  ])
  await runTool(ffmpegPath, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1440x900:d=1', '-vf', siteFilter(), '-frames:v', '1', path.join(dir, 'screenshot.png')])
  await Promise.all(SAMPLE_LOGOS.map((logo, index) => writeFile(path.join(dir, `logo-${index + 1}.svg`), logoSvg(logo))))
  await Promise.all(
    TONES_HZ.map((tone, index) =>
      runTool(ffmpegPath, [
        '-v', 'error', '-y',
        '-f', 'lavfi', '-i', `sine=frequency=${tone}:sample_rate=44100:duration=${options.audioS}`,
        '-af', `volume=2,afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, options.audioS - 0.1)}:d=0.1`,
        '-c:a', 'libmp3lame', '-b:a', '128k',
        path.join(dir, `slide-${index + 2}.mp3`),
      ]),
    ),
  )
  return {
    intro: 'sample/intro.mp4',
    introDurationS: options.introS,
    screenshot: 'sample/screenshot.png',
    logos: SAMPLE_LOGOS.map((_, index) => `sample/logo-${index + 1}.svg`),
    audio: TONES_HZ.map((_, index) => ({ file: `sample/slide-${index + 2}.mp3`, durationS: options.audioS })),
  }
}

type SlideContent = Pick<SlideSegment, 'template' | 'variables'>

function slideContents(media: SampleMedia): SlideContent[] {
  const buyers = SAMPLE_BUYERS.map((buyer, index) => ({ ...buyer, logoFile: media.logos[index] ?? null }))
  return [
    {
      template: 'who-we-are',
      variables: { template: 'who-we-are', buyers: [...buyers.slice(3), ...buyers.slice(0, 3)], deals: SAMPLE_DEALS, buyerCount: 2200 },
    },
    {
      template: 'your-company',
      variables: {
        template: 'your-company',
        company: 'Example Industrial Oy',
        website: 'https://www.example-industrial.fi/',
        lines: [
          'Example Industrial makes precision machined parts for Nordic machine builders.',
          'Its 45 specialists handle CNC machining, welding and final assembly in Tampere.',
          'Customers include energy, marine and mining companies across Europe.',
        ],
        linesSource: 'model',
        screenshotFile: media.screenshot,
      },
    },
    {
      template: 'your-figures',
      variables: { template: 'your-figures', mode: 'figures', revenue: 4_200_000, profit: 610_000, revenueText: '€4.2M', profitText: '€610K', fiscalYear: 2025 },
    },
    { template: 'buyers', variables: { template: 'buyers', buyers } },
    { template: 'what-is-possible', variables: { template: 'what-is-possible', deals: SECTOR_DEALS, summary: { dealCount: 14, p25: 4.8, p75: 7.2 } } },
    { template: 'privacy', variables: { template: 'privacy' } },
    { template: 'book-meeting', variables: { template: 'book-meeting', analystName: 'Laura Mäkelä', company: 'Example Industrial Oy' } },
  ]
}

export function sampleTimeline(media: SampleMedia): Timeline {
  const intro = segmentFrames(media.introDurationS, SCENE_FPS) / SCENE_FPS
  let cursor = 0
  const timed = <T extends Segment>(segment: T, durationS: number): T => {
    const startS = cursor
    cursor += durationS
    return { ...segment, durationS, startS, endS: cursor }
  }
  const facecam = timed(
    {
      slide: 1,
      template: 'facecam',
      variables: { template: 'facecam', videoFile: media.intro, analystName: 'Laura Mäkelä', transcript: null },
      labels: slideLabels('en', 'facecam'),
      durationS: intro,
      startS: null,
      endS: null,
    },
    intro,
  )
  const slides = slideContents(media).map((content, index) => {
    const audio = media.audio[index]
    if (!audio) throw new Error(`Sample media has no audio for slide ${index + 2}`)
    const durationS = segmentFrames(audio.durationS + PAUSE_S, SCENE_FPS) / SCENE_FPS
    const segment: SlideSegment = {
      ...content,
      labels: slideLabels('en', content.template),
      slide: (index + 2) as ScriptSlideNumber,
      script: 'Sample script.',
      scriptSource: 'fallback',
      audio: { file: audio.file, durationS: audio.durationS, status: 'ok', error: null },
      durationS,
      startS: null,
      endS: null,
    }
    return timed(segment, durationS)
  })
  return {
    dealId: 0,
    version: 1,
    language: 'en',
    fps: SCENE_FPS,
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    pauseS: PAUSE_S,
    segments: [facecam, ...slides],
  }
}

export async function renderTemplatePreviews(options: TemplatePreviewOptions): Promise<string[]> {
  const storageDir = await mkdtemp(path.join(os.tmpdir(), 'mergero-previews-'))
  try {
    const timeline = sampleTimeline(await makeSampleMedia(storageDir, options.ffmpegPath, PREVIEW_MEDIA))
    const video = path.join(storageDir, 'preview.mp4')
    await renderTimeline({
      input: { timeline, storageDir, repoRoot: options.repoRoot, brand: options.brand },
      outFile: video,
      chromePath: options.chromePath,
      ffmpegPath: options.ffmpegPath,
      ffprobePath: options.ffprobePath,
    })
    await mkdir(options.outDir, { recursive: true })
    const files: string[] = []
    let startFrame = 0
    for (const segment of timeline.segments) {
      const frames = segmentFrames(segment.durationS ?? 0, timeline.fps)
      const file = path.join(options.outDir, `slide-${segment.slide}.jpg`)
      const partial = path.join(options.outDir, `.slide-${segment.slide}.partial.jpg`)
      await extractFrame(options.ffmpegPath, video, (startFrame + Math.floor(frames / 2)) / timeline.fps, partial, `scale=${PREVIEW_WIDTH}:-2`)
      await rename(partial, file)
      files.push(file)
      startFrame += frames
    }
    return files
  } finally {
    await rm(storageDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
