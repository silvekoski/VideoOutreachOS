import { execFileSync, spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import type { RenderInput, Segment } from '@mergero/shared'
import { SCENE_FPS, SCENE_HEIGHT, SCENE_WIDTH, segmentFrames } from '../src/timing.ts'
import type { ChildJob, ChildMessage } from './job.ts'
import { extractFrame, probeFile } from './media.ts'

export interface RenderTimelineOptions {
  input: RenderInput
  outFile: string
  chromePath: string
  ffmpegPath: string
  ffprobePath: string
  timeoutMs?: number
  onProgress?: (progress: number) => void
}

export interface RenderResult {
  file: string
  frames: number
  durationS: number
}

export class RenderInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RenderInputError'
  }
}

interface FileRef {
  file: string
  use: string
}

const SCENE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHILD_SCRIPT = path.join(SCENE_DIR, 'render', 'child.ts')
const BASE_TIMEOUT_MS = 120_000
const TIMEOUT_MS_PER_VIDEO_S = 4_000
const LOG_TAIL_LINES = 30
const STILL_POSITION = 0.35
const STILL_SIZE = 480

function resolveInside(root: string, file: string, use: string): string {
  const resolved = path.resolve(root, file)
  const relative = path.relative(path.resolve(root), resolved)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new RenderInputError(`Render input path is outside ${root}: ${file} (${use})`)
  }
  return resolved
}

function segmentFiles(input: RenderInput, segment: Segment): FileRef[] {
  const inStorage = (file: string, use: string): FileRef => ({ file: resolveInside(input.storageDir, file, use), use })
  const label = `slide ${segment.slide}`
  if (segment.template === 'facecam') return [inStorage(segment.variables.videoFile, `${label} video`)]
  const refs: FileRef[] = segment.audio.file ? [inStorage(segment.audio.file, `${label} audio`)] : []
  const variables = segment.variables
  if (variables.template === 'your-company' && variables.screenshotFile) {
    refs.push(inStorage(variables.screenshotFile, `${label} screenshot`))
  }
  if (variables.template === 'who-we-are' || variables.template === 'buyers') {
    for (const buyer of variables.buyers) {
      if (buyer.logoFile) refs.push(inStorage(buyer.logoFile, `${label} logo of ${buyer.name}`))
    }
  }
  return refs
}

interface RenderPlan {
  files: FileRef[]
  frames: number
  facecam: { file: string; durationS: number } | null
}

function planRender(input: RenderInput): RenderPlan {
  const { timeline } = input
  if (timeline.fps !== SCENE_FPS) throw new RenderInputError(`Timeline fps is ${timeline.fps}, the scene renders at ${SCENE_FPS} fps`)
  if (timeline.width !== SCENE_WIDTH || timeline.height !== SCENE_HEIGHT) {
    throw new RenderInputError(`Timeline size is ${timeline.width} x ${timeline.height}, the scene renders at ${SCENE_WIDTH} x ${SCENE_HEIGHT}`)
  }
  if (timeline.segments.length === 0) throw new RenderInputError('Timeline has no segments')
  let frames = 0
  for (const segment of timeline.segments) {
    const durationS = segment.durationS
    if (durationS === null || !Number.isFinite(durationS) || durationS <= 0) {
      throw new RenderInputError(`Slide ${segment.slide} has no valid duration (${String(durationS)})`)
    }
    frames += segmentFrames(durationS, timeline.fps)
  }
  const facecam = timeline.segments.find((segment) => segment.template === 'facecam')
  const files = [
    { file: resolveInside(input.repoRoot, input.brand.logoOnDark, 'brand logo on dark'), use: 'brand logo on dark' },
    { file: resolveInside(input.repoRoot, input.brand.logoOnLight, 'brand logo on light'), use: 'brand logo on light' },
    ...timeline.segments.flatMap((segment) => segmentFiles(input, segment)),
  ]
  return {
    files,
    frames,
    facecam:
      facecam?.template === 'facecam'
        ? { file: resolveInside(input.storageDir, facecam.variables.videoFile, 'facecam'), durationS: facecam.durationS }
        : null,
  }
}

async function checkFiles(files: FileRef[]): Promise<void> {
  const missing: string[] = []
  for (const ref of files) {
    const info = await stat(ref.file).catch(() => null)
    if (!info?.isFile()) missing.push(`${ref.file} (${ref.use})`)
  }
  if (missing.length === 1) throw new RenderInputError(`Render input file is missing: ${missing[0]}`)
  if (missing.length > 1) throw new RenderInputError(`Render input files are missing: ${missing.join(', ')}`)
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function descendants(pid: number): number[] {
  let table = ''
  try {
    table = execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' })
  } catch {
    return []
  }
  const children = new Map<number, number[]>()
  for (const line of table.split('\n')) {
    const [child, parent] = line.trim().split(/\s+/).map(Number)
    if (child === undefined || parent === undefined || Number.isNaN(child) || Number.isNaN(parent)) continue
    children.set(parent, [...(children.get(parent) ?? []), child])
  }
  const found: number[] = []
  const queue = [pid]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of children.get(next) ?? []) {
      found.push(child)
      queue.push(child)
    }
  }
  return found
}

function kill(target: number): void {
  try {
    process.kill(target, 'SIGKILL')
  } catch {
    // The process or group is already gone.
  }
}

function killTree(pid: number): void {
  const tree = descendants(pid)
  kill(-pid)
  kill(pid)
  for (const child of tree) {
    kill(-child)
    kill(child)
  }
}

function runChild(job: string, tmpDir: string, timeoutMs: number, onProgress?: (progress: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD_SCRIPT, job], {
      cwd: SCENE_DIR,
      detached: true,
      env: { ...process.env, DISABLE_TELEMETRY: 'true', TMPDIR: tmpDir },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    const tail: string[] = []
    let result: Exclude<ChildMessage, { type: 'progress' }> | null = null
    let settled = false
    const settle = (error: Error | null, file?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(file ?? '')
    }
    const logTail = () => (tail.length > 0 ? `\n${tail.join('\n')}` : '')
    for (const stream of [child.stdout, child.stderr]) {
      if (!stream) continue
      createInterface({ input: stream }).on('line', (line) => {
        if (!line.trim()) return
        tail.push(line)
        if (tail.length > LOG_TAIL_LINES) tail.shift()
      })
    }
    child.on('message', (message: ChildMessage) => {
      if (message.type === 'progress') onProgress?.(message.progress)
      else result = message
    })
    const timer = setTimeout(() => {
      if (child.pid !== undefined) killTree(child.pid)
      settle(new Error(`Render timed out after ${timeoutMs} ms${logTail()}`))
    }, timeoutMs)
    child.on('error', (error) => settle(new Error(`Render process failed to start: ${error.message}`)))
    child.on('close', (code, signal) => {
      if (child.pid !== undefined) kill(-child.pid)
      if (result?.type === 'done') settle(null, result.file)
      else if (result?.type === 'error') settle(new Error(`Render failed: ${result.message}${logTail()}`))
      else settle(new Error(`Render process exited with ${signal ?? `code ${String(code)}`}${logTail()}`))
    })
  })
}

async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    const partial = `${to}.partial-${process.pid}`
    await copyFile(from, partial)
    await rename(partial, to)
  }
}

export async function renderTimeline(options: RenderTimelineOptions): Promise<RenderResult> {
  const { input } = options
  const plan = planRender(input)
  const chrome = path.isAbsolute(options.chromePath) ? [{ file: options.chromePath, use: 'Chrome' }] : []
  await checkFiles([...plan.files, ...chrome])
  const expectedS = plan.frames / input.timeline.fps
  const timeoutMs = options.timeoutMs ?? BASE_TIMEOUT_MS + Math.ceil(expectedS * TIMEOUT_MS_PER_VIDEO_S)
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mergero-render-'))
  try {
    const tmpDir = path.join(tempRoot, 'tmp')
    const outDir = path.join(tempRoot, 'out')
    await mkdir(tmpDir)
    await mkdir(outDir)

    let still: string | null = null
    if (plan.facecam) {
      const file = path.join(tempRoot, 'analyst.jpg')
      const crop = `crop='min(iw,ih)':'min(iw,ih)':'(iw-min(iw,ih))/2':'(ih-min(iw,ih))*0.2',scale=${STILL_SIZE}:${STILL_SIZE}`
      still = await extractFrame(options.ffmpegPath, plan.facecam.file, plan.facecam.durationS * STILL_POSITION, file, crop).then(
        () => file,
        () => null,
      )
    }

    const job: ChildJob = {
      input,
      still,
      outDir,
      outName: 'render.mp4',
      chromePath: options.chromePath,
      ffmpegPath: options.ffmpegPath,
      ffprobePath: options.ffprobePath,
      port: await freePort(),
      fsAllow: [...new Set([SCENE_DIR, path.resolve(input.repoRoot), path.resolve(input.storageDir), tempRoot])],
    }
    const jobFile = path.join(tempRoot, 'job.json')
    await writeFile(jobFile, JSON.stringify(job))

    const rendered = await runChild(jobFile, tmpDir, timeoutMs, options.onProgress)
    const probe = await probeFile(options.ffprobePath, rendered, input.timeline.fps)
    if (!probe.hasVideo || !probe.hasAudio) {
      throw new Error(`Render output lacks a ${probe.hasVideo ? 'audio' : 'video'} stream`)
    }
    if (Math.abs(probe.frames - plan.frames) > 1) {
      throw new Error(`Render output has ${probe.frames} frames, expected ${plan.frames}`)
    }
    const file = path.resolve(options.outFile)
    await moveFile(rendered, file)
    options.onProgress?.(1)
    return { file, frames: probe.frames, durationS: probe.durationS }
  } finally {
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
