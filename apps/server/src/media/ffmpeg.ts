import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../env.ts'

const TIMEOUT_MS = 20 * 60_000
const STDERR_TAIL_LINES = 12
const LOUDNORM_TARGET = 'I=-16:TP=-1.5:LRA=11'
const SILENCE_LUFS = -70

export class FfmpegError extends Error {
  readonly stderrTail: string

  constructor(message: string, stderrTail: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'FfmpegError'
    this.stderrTail = stderrTail
  }
}

function tail(text: string): string {
  return text.trimEnd().split('\n').slice(-STDERR_TAIL_LINES).join('\n')
}

function exec(bin: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { maxBuffer: 64 * 1024 * 1024, timeout: TIMEOUT_MS, killSignal: 'SIGKILL' },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr })
          return
        }
        const lines = tail(stderr)
        const reason = error.killed ? 'timed out' : lines || error.message
        reject(new FfmpegError(`${path.basename(bin)} failed: ${reason}`, lines, error))
      },
    )
  })
}

function ffmpeg(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec(env.ffmpegPath, ['-hide_banner', '-nostdin', '-nostats', '-y', ...args])
}

function ffprobe(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec(env.ffprobePath, ['-v', 'error', ...args])
}

async function writeAtomic(output: string, produce: (tmp: string) => Promise<unknown>): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true })
  const ext = path.extname(output)
  const tmp = path.join(path.dirname(output), `.${path.basename(output, ext)}.${randomUUID().slice(0, 8)}.tmp${ext}`)
  try {
    await produce(tmp)
    const info = await stat(tmp).catch(() => null)
    if (!info || info.size === 0) throw new FfmpegError(`ffmpeg wrote no data for ${output}`, '')
    await rename(tmp, output)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

async function hasAudio(file: string): Promise<boolean> {
  const { stdout } = await ffprobe(['-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file])
  return stdout.trim() !== ''
}

interface LoudnormMeasure {
  input_i: string
  input_tp: string
  input_lra: string
  input_thresh: string
  target_offset: string
}

async function secondPassFilter(input: string): Promise<string | null> {
  const { stderr } = await ffmpeg([
    '-i', input, '-map', '0:a:0', '-af', `loudnorm=${LOUDNORM_TARGET}:print_format=json`, '-f', 'null', '-',
  ])
  let measure: LoudnormMeasure
  try {
    measure = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1)) as LoudnormMeasure
  } catch (error) {
    throw new FfmpegError(`loudnorm gave no measurement for ${input}`, tail(stderr), error)
  }
  const values = [measure.input_i, measure.input_tp, measure.input_lra, measure.input_thresh, measure.target_offset]
  if (!values.every((value) => Number.isFinite(Number(value))) || Number(measure.input_i) <= SILENCE_LUFS) return null
  return [
    `loudnorm=${LOUDNORM_TARGET}`,
    `measured_I=${measure.input_i}`,
    `measured_TP=${measure.input_tp}`,
    `measured_LRA=${measure.input_lra}`,
    `measured_thresh=${measure.input_thresh}`,
    `offset=${measure.target_offset}`,
    'linear=true',
  ].join(':')
}

export async function probeDurationS(file: string): Promise<number> {
  const { stdout } = await ffprobe(['-show_entries', 'format=format_name,duration', '-of', 'json', file])
  const format = (JSON.parse(stdout) as { format?: { format_name?: string; duration?: string } }).format ?? {}
  if ((format.format_name ?? '').split(',').includes('mp3')) {
    const { stdout: counted } = await ffprobe([
      '-select_streams', 'a:0', '-count_packets', '-show_entries', 'stream=nb_read_packets,sample_rate', '-of', 'json', file,
    ])
    const stream = (JSON.parse(counted) as { streams?: { nb_read_packets?: string; sample_rate?: string }[] }).streams?.[0]
    const packets = Number(stream?.nb_read_packets)
    const rate = Number(stream?.sample_rate)
    if (packets > 0 && rate > 0) return (packets * (rate >= 32_000 ? 1152 : 576)) / rate
  }
  const duration = Number(format.duration)
  if (!Number.isFinite(duration) || duration <= 0) throw new FfmpegError(`ffprobe found no duration in ${file}`, '')
  return duration
}

export async function loudnormToMp3(input: string, output: string): Promise<void> {
  const filter = await secondPassFilter(input)
  await writeAtomic(output, (tmp) =>
    ffmpeg([
      '-i', input, '-map', '0:a:0', ...(filter ? ['-af', filter] : []),
      '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', tmp,
    ]),
  )
}

export async function transcodeIntro(input: string, output: string): Promise<void> {
  const audio = await hasAudio(input)
  const filter = audio ? await secondPassFilter(input) : null
  const video = [
    'scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos',
    'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
    'setsar=1',
    'fps=30',
    'format=yuv420p',
  ].join(',')
  await writeAtomic(output, (tmp) =>
    ffmpeg([
      '-i', input,
      ...(audio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']),
      '-map', '0:v:0', '-map', audio ? '0:a:0' : '1:a:0',
      '-vf', video,
      ...(filter ? ['-af', filter] : []),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      ...(audio ? [] : ['-shortest']),
      '-movflags', '+faststart', tmp,
    ]),
  )
}

export async function placeholderIntro(seconds: number, color: string, output: string): Promise<void> {
  await writeAtomic(output, (tmp) =>
    ffmpeg([
      '-f', 'lavfi', '-i', `color=c=${color}:s=1920x1080:r=30:d=${seconds}`,
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
      '-t', String(seconds),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', tmp,
    ]),
  )
}

export async function transcodeVoiceSample(input: string, output: string): Promise<void> {
  await writeAtomic(output, (tmp) =>
    ffmpeg(['-i', input, '-map', '0:a:0', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', tmp]),
  )
}

export async function faststart(input: string, output: string): Promise<void> {
  await writeAtomic(output, (tmp) =>
    ffmpeg(['-i', input, '-map', '0:v', '-map', '0:a?', '-c', 'copy', '-movflags', '+faststart', tmp]),
  )
}

export async function make720(input: string, output: string): Promise<void> {
  await writeAtomic(output, (tmp) =>
    ffmpeg([
      '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', 'scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-profile:v', 'high', '-level:v', '4.0',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', tmp,
    ]),
  )
}

export async function posterFrame(input: string, atS: number, output: string): Promise<void> {
  const duration = await probeDurationS(input)
  const at = Math.min(Math.max(0, Number.isFinite(atS) ? atS : 0), Math.max(0, duration - 0.1))
  await writeAtomic(output, (tmp) =>
    ffmpeg(['-ss', at.toFixed(3), '-i', input, '-frames:v', '1', '-q:v', '2', '-update', '1', tmp]),
  )
}

export async function ogImage(png: string, output: string): Promise<void> {
  await writeAtomic(output, (tmp) =>
    ffmpeg([
      '-i', png,
      '-vf', 'scale=1200:630:force_original_aspect_ratio=increase:flags=lanczos,crop=1200:630:(iw-ow)/2:0,format=yuv420p',
      '-color_range', 'pc', '-frames:v', '1', '-q:v', '3', '-update', '1', tmp,
    ]),
  )
}

export async function squarePhoto(input: string, output: string, size: number): Promise<void> {
  await writeAtomic(output, (tmp) =>
    ffmpeg([
      '-i', input,
      '-vf', `crop=min(iw\\,ih):min(iw\\,ih),scale=${size}:${size}:flags=lanczos,format=yuvj420p`,
      '-frames:v', '1', '-q:v', '3', '-update', '1', tmp,
    ]),
  )
}

export async function integratedLoudness(file: string): Promise<number | null> {
  if (!(await hasAudio(file))) return null
  const { stderr } = await ffmpeg(['-i', file, '-map', '0:a:0', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'])
  const match = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(stderr.slice(stderr.lastIndexOf('Summary:')))
  if (!match) throw new FfmpegError(`ebur128 gave no integrated loudness for ${file}`, tail(stderr))
  const lufs = Number(match[1])
  return Number.isFinite(lufs) && lufs > SILENCE_LUFS ? lufs : null
}

export async function silenceMp3(seconds: number, output: string): Promise<void> {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new RangeError(`silence length must be positive, got ${seconds}`)
  await writeAtomic(output, (tmp) =>
    ffmpeg([
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', seconds.toFixed(3),
      '-c:a', 'libmp3lame', '-b:a', '192k', tmp,
    ]),
  )
}
