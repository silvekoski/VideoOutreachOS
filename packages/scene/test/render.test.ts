import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Brand, RenderInput, Timeline } from '@mergero/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RenderInputError, makeSampleMedia, renderTimeline, sampleTimeline } from '../render/index.ts'
import { segmentFrames } from '../src/timing.ts'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg'
const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe'
const tools = { chromePath, ffmpegPath, ffprobePath }

function totalFrames(timeline: Timeline): number {
  return timeline.segments.reduce((sum, segment) => sum + segmentFrames(segment.durationS ?? 0, timeline.fps), 0)
}

async function processCommands(): Promise<string> {
  const { stdout } = await execFileAsync('ps', ['-A', '-o', 'command='], { maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

describe('renderTimeline', () => {
  let root = ''
  let input: RenderInput

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'mergero scene ä-'))
    const storageDir = path.join(root, 'storage')
    const media = await makeSampleMedia(storageDir, ffmpegPath, { introS: 1.5, audioS: 0.6 })
    const config = JSON.parse(await readFile(path.join(repoRoot, 'config', 'mergero.json'), 'utf8')) as { brand: Brand }
    input = { timeline: sampleTimeline(media), storageDir, repoRoot, brand: config.brand }
  }, 60_000)

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('names each missing file before it starts a render', async () => {
    const timeline = structuredClone(input.timeline)
    const slide = timeline.segments.find((segment) => segment.template === 'privacy')
    if (!slide || slide.template === 'facecam') throw new Error('Sample timeline has no privacy slide')
    slide.audio.file = 'sample/missing.mp3'
    const error: unknown = await renderTimeline({ ...tools, input: { ...input, timeline }, outFile: path.join(root, 'missing.mp4') }).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(RenderInputError)
    expect((error as Error).message).toContain(`${path.join(input.storageDir, 'sample', 'missing.mp3')} (slide 7 audio)`)
  })

  it('rejects a file outside the storage folder', async () => {
    const timeline = structuredClone(input.timeline)
    const facecam = timeline.segments[0]
    if (facecam?.template !== 'facecam') throw new Error('Sample timeline does not start with the facecam')
    facecam.variables.videoFile = '../outside.mp4'
    await expect(
      renderTimeline({ ...tools, input: { ...input, timeline }, outFile: path.join(root, 'outside.mp4') }),
    ).rejects.toThrow(RenderInputError)
  })

  it('kills the whole render process tree on timeout and removes its temp files', async () => {
    const tmp = path.join(root, 'timeout-tmp')
    await mkdir(tmp)
    const timeline = structuredClone(input.timeline)
    for (const segment of timeline.segments) segment.durationS = 30
    const previousTmp = process.env.TMPDIR
    process.env.TMPDIR = tmp
    let sawChrome = false
    const poll = setInterval(() => {
      processCommands().then(
        (commands) => {
          if (commands.split('\n').some((line) => line.includes(tmp) && /chrome/i.test(line))) sawChrome = true
        },
        () => undefined,
      )
    }, 200)
    try {
      await expect(
        renderTimeline({ ...tools, input: { ...input, timeline }, outFile: path.join(root, 'timeout.mp4'), timeoutMs: 6_000 }),
      ).rejects.toThrow(/timed out after 6000 ms/)
    } finally {
      clearInterval(poll)
      if (previousTmp === undefined) delete process.env.TMPDIR
      else process.env.TMPDIR = previousTmp
    }
    expect(sawChrome).toBe(true)
    let leftovers: string[] = []
    for (let attempt = 0; attempt < 20; attempt++) {
      leftovers = (await processCommands()).split('\n').filter((line) => line.includes(tmp))
      if (leftovers.length === 0) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(leftovers).toEqual([])
    expect(await readdir(tmp)).toEqual([])
  }, 60_000)

  it('renders a short timeline with frame-exact length, video and audible audio', async () => {
    const outFile = path.join(root, 'out', 'video.mp4')
    const progress: number[] = []
    const result = await renderTimeline({ ...tools, input, outFile, onProgress: (value) => progress.push(value) })
    const fps = input.timeline.fps
    const expectedS = totalFrames(input.timeline) / fps

    expect(result.file).toBe(outFile)
    expect(Math.abs(result.frames - totalFrames(input.timeline))).toBeLessThanOrEqual(1)
    expect(progress.at(-1)).toBe(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))

    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,codec_name,width,height,duration',
      '-of', 'json',
      outFile,
    ])
    const streams = (JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number; duration: string }[] }).streams
    const video = streams.find((stream) => stream.codec_type === 'video')
    const audio = streams.find((stream) => stream.codec_type === 'audio')
    expect(video).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080 })
    expect(audio?.codec_name).toBe('aac')
    expect(Math.abs(Number(video?.duration) - expectedS)).toBeLessThanOrEqual(1 / fps + 1e-6)

    const loudness = await execFileAsync(ffmpegPath, ['-hide_banner', '-nostats', '-i', outFile, '-af', 'ebur128', '-f', 'null', '-'])
    const integrated = /I:\s+(-?[\d.]+) LUFS\s*$/m.exec(loudness.stderr.split('Summary:').at(-1) ?? '')
    expect(Number(integrated?.[1])).toBeGreaterThan(-40)
  }, 120_000)
})
