import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const TOOL_TIMEOUT_MS = 60_000

export async function runTool(command: string, args: string[], timeoutMs = TOOL_TIMEOUT_MS): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, killSignal: 'SIGKILL' })
    return `${stdout}${stderr}`
  } catch (error) {
    const detail = error as { stderr?: string; message?: string }
    const stderr = detail.stderr?.trim().split('\n').slice(-5).join(' | ')
    throw new Error(`${command} failed: ${stderr || detail.message || 'unknown error'}`)
  }
}

export interface ProbeResult {
  durationS: number
  frames: number
  hasVideo: boolean
  hasAudio: boolean
}

interface FfprobeJson {
  format?: { duration?: string }
  streams?: { codec_type?: string; nb_frames?: string }[]
}

export async function probeFile(ffprobePath: string, file: string, fps: number): Promise<ProbeResult> {
  const output = await runTool(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,nb_frames',
    '-of', 'json',
    file,
  ])
  const json = JSON.parse(output) as FfprobeJson
  const durationS = Number(json.format?.duration)
  if (!Number.isFinite(durationS)) throw new Error(`ffprobe gave no duration for ${file}`)
  const streams = json.streams ?? []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const counted = Number(video?.nb_frames)
  return {
    durationS,
    frames: Number.isFinite(counted) && counted > 0 ? counted : Math.round(durationS * fps),
    hasVideo: video !== undefined,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
  }
}

export async function extractFrame(ffmpegPath: string, video: string, atS: number, outFile: string, filter: string): Promise<void> {
  await runTool(ffmpegPath, [
    '-v', 'error', '-y',
    '-ss', atS.toFixed(3),
    '-i', video,
    '-frames:v', '1',
    '-vf', filter,
    '-q:v', '3',
    outFile,
  ])
}
