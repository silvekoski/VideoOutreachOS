import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Brand, SlideSegment, Timeline } from '@mergero/shared'
import { SLOT_LIMITS } from '@mergero/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeSampleMedia, renderTimeline, sampleTimeline } from '../render/index.ts'
import { SCENE_HEIGHT, SCENE_WIDTH, segmentFrames } from '../src/timing.ts'

const execFileAsync = promisify(execFile)
const sceneDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(sceneDir, '../..')
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe'

const DARK = 160
const SIDE = 100
const TOP = 100
const EYEBROW_BOTTOM = 132
const HEADLINE_TOP = 172
const HEADLINE_LINE = 80
const BODY_GAP = 48
const BODY_BOTTOM = 1000
const GERMAN_LINES = [
  'Präzisionsmaschinenbau Geschäftsführung Großhandelsunternehmen Käufergruppe Österreich',
  'Instandhaltungsdienstleistungen Unternehmensnachfolge Familienunternehmen übernimmt',
  'Fertigungstechnik Österreich Zürich übernimmt Familienunternehmen Käufergruppe Wien',
]

describe('scene source', () => {
  it('keeps the whole layout in one scene file next to the project entry and the timing numbers', async () => {
    expect((await readdir(path.join(sceneDir, 'src'))).sort()).toEqual(['project.ts', 'scene.tsx', 'timing.ts'])
  })
})

function countDark(pixels: Buffer, x0: number, x1: number, y0: number, y1: number): number {
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) if ((pixels[y * SCENE_WIDTH + x] ?? 255) < DARK) count++
  }
  return count
}

describe('slides 5 and 6 without buyers or deals', () => {
  let root = ''
  const frames: Buffer[] = []

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'mergero-empty-'))
    const storageDir = path.join(root, 'storage')
    const base = sampleTimeline(await makeSampleMedia(storageDir, ffmpegPath, { introS: 0.5, audioS: 0.6 }))
    let cursor = 0
    const segments = base.segments.flatMap((segment): SlideSegment[] => {
      if (segment.template === 'facecam' || segment.durationS === null) return []
      const variables = segment.variables
      const empty =
        variables.template === 'buyers'
          ? { ...variables, buyers: [] }
          : variables.template === 'what-is-possible'
            ? { ...variables, deals: [] }
            : null
      if (!empty) return []
      const startS = cursor
      cursor += segment.durationS
      return [{ ...segment, variables: empty, startS, endS: cursor }]
    })
    const timeline: Timeline = { ...base, segments }
    const { brand } = JSON.parse(await readFile(path.join(repoRoot, 'config', 'mergero.json'), 'utf8')) as { brand: Brand }
    const outFile = path.join(root, 'empty.mp4')
    await renderTimeline({ input: { timeline, storageDir, repoRoot, brand }, outFile, chromePath, ffmpegPath, ffprobePath })
    for (const segment of segments) {
      const atS = (segment.startS ?? 0) + (segmentFrames(segment.durationS ?? 0, timeline.fps) - 2) / timeline.fps
      const frame = await execFileAsync(
        ffmpegPath,
        ['-v', 'error', '-ss', atS.toFixed(3), '-i', outFile, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
        { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
      )
      frames.push(frame.stdout)
    }
  }, 120_000)

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('shows an eyebrow and a statement in place of an empty list', () => {
    expect(frames).toHaveLength(2)
    for (const pixels of frames) {
      expect(pixels.length).toBe(SCENE_WIDTH * SCENE_HEIGHT)
      expect(countDark(pixels, SIDE, SCENE_WIDTH - SIDE, TOP, EYEBROW_BOTTOM)).toBeGreaterThan(0)
      expect(countDark(pixels, SIDE, SCENE_WIDTH - SIDE, EYEBROW_BOTTOM + BODY_GAP, BODY_BOTTOM)).toBeGreaterThan(0)
    }
  })
})

describe('slide 3 with a company name at the slot limit', () => {
  let root = ''
  let pixels = Buffer.alloc(0)

  const darkPixels = (x0: number, x1: number, y0: number, y1: number): number => {
    let count = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if ((pixels[y * SCENE_WIDTH + x] ?? 255) < DARK) count++
    }
    return count
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'mergero-layout-'))
    const storageDir = path.join(root, 'storage')
    const base = sampleTimeline(await makeSampleMedia(storageDir, ffmpegPath, { introS: 0.5, audioS: 0.6 }))
    const company = base.segments.find((segment): segment is SlideSegment => segment.template === 'your-company')
    if (company?.variables.template !== 'your-company' || company.durationS === null) throw new Error('Sample timeline has no company slide')
    const segment: SlideSegment = {
      ...company,
      variables: { ...company.variables, company: 'W'.repeat(SLOT_LIMITS['your-company.company'] ?? 0), lines: GERMAN_LINES },
      startS: 0,
      endS: company.durationS,
    }
    const timeline: Timeline = { ...base, language: 'de', segments: [segment] }
    const { brand } = JSON.parse(await readFile(path.join(repoRoot, 'config', 'mergero.json'), 'utf8')) as { brand: Brand }
    const outFile = path.join(root, 'company.mp4')
    await renderTimeline({ input: { timeline, storageDir, repoRoot, brand }, outFile, chromePath, ffmpegPath, ffprobePath })
    const lastFrameS = (segmentFrames(company.durationS, timeline.fps) - 2) / timeline.fps
    const frame = await execFileAsync(
      ffmpegPath,
      ['-v', 'error', '-ss', lastFrameS.toFixed(3), '-i', outFile, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
    )
    pixels = frame.stdout
  }, 120_000)

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('renders a full frame', () => {
    expect(pixels.length).toBe(SCENE_WIDTH * SCENE_HEIGHT)
  })

  it('breaks the unspaced name inside the content width', () => {
    expect(darkPixels(0, SIDE - 8, 0, SCENE_HEIGHT)).toBe(0)
    expect(darkPixels(SCENE_WIDTH - SIDE + 8, SCENE_WIDTH, 0, SCENE_HEIGHT)).toBe(0)
  })

  it('gives the name five headline lines and moves the body below them', () => {
    const headlineBottom = HEADLINE_TOP + 5 * HEADLINE_LINE
    expect(darkPixels(SIDE, SCENE_WIDTH - SIDE, headlineBottom - HEADLINE_LINE + 8, headlineBottom - 8)).toBeGreaterThan(0)
    expect(darkPixels(SIDE, SCENE_WIDTH - SIDE, headlineBottom + 4, headlineBottom + BODY_GAP - 4)).toBe(0)
    expect(darkPixels(SIDE, SCENE_WIDTH - SIDE, headlineBottom + BODY_GAP, BODY_BOTTOM)).toBeGreaterThan(0)
    expect(darkPixels(0, SCENE_WIDTH, BODY_BOTTOM + 4, SCENE_HEIGHT)).toBe(0)
  })
})
