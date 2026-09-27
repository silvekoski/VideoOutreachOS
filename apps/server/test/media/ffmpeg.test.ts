import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '../../src/env.ts'
import {
  FfmpegError,
  faststart,
  integratedLoudness,
  loudnormToMp3,
  make720,
  ogImage,
  posterFrame,
  probeDurationS,
  silenceMp3,
  transcodeIntro,
  transcodeVoiceSample,
} from '../../src/media/ffmpeg.ts'

const run = promisify(execFile)
let dir: string

const file = (name: string) => path.join(dir, name)

async function make(args: string[]): Promise<void> {
  await run(env.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args])
}

interface ProbeStream {
  codec_type: string
  codec_name: string
  profile?: string
  width?: number
  height?: number
  pix_fmt?: string
  r_frame_rate?: string
  sample_rate?: string
  channels?: number
}

async function probe(target: string): Promise<{ streams: ProbeStream[]; format: { format_name: string } }> {
  const { stdout } = await run(env.ffprobePath, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', target])
  return JSON.parse(stdout)
}

async function topLevelAtoms(target: string): Promise<string[]> {
  const data = await readFile(target)
  const atoms: string[] = []
  for (let offset = 0; offset + 8 <= data.length; ) {
    let size = data.readUInt32BE(offset)
    atoms.push(data.toString('latin1', offset + 4, offset + 8))
    if (size === 1) size = Number(data.readBigUInt64BE(offset + 8))
    if (size === 0) break
    offset += size
  }
  return atoms
}

function stream(info: { streams: ProbeStream[] }, type: 'video' | 'audio'): ProbeStream {
  const found = info.streams.find((item) => item.codec_type === type)
  if (!found) throw new Error(`no ${type} stream`)
  return found
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mergero-ffmpeg-test-'))
  await make(['-f', 'lavfi', '-i', 'anoisesrc=d=6:c=pink:a=0.02', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', file('quiet.mp3')])
  await make([
    '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=25:duration=6',
    '-f', 'lavfi', '-i', 'anoisesrc=d=6:c=pink:a=0.03',
    '-c:v', 'libvpx', '-b:v', '600k', '-c:a', 'libopus', '-shortest', file('recording.webm'),
  ])
  await make([
    '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file('plain.mp4'),
  ])
  await make(['-f', 'lavfi', '-i', 'testsrc2=size=1440x900', '-frames:v', '1', file('shot.png')])
}, 60_000)

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('ffmpeg helpers', { timeout: 120_000 }, () => {
  it('makes silence of the given length and reports it as silent', async () => {
    await silenceMp3(2.5, file('silence.mp3'))
    expect(await probeDurationS(file('silence.mp3'))).toBeCloseTo(2.5, 1)
    expect(await integratedLoudness(file('silence.mp3'))).toBeNull()
  })

  it('normalizes quiet speech-like audio to -16 LUFS as MP3 44.1 kHz', async () => {
    await loudnormToMp3(file('quiet.mp3'), file('normalized.mp3'))
    const lufs = await integratedLoudness(file('normalized.mp3'))
    expect(lufs).not.toBeNull()
    expect(Math.abs((lufs ?? 0) + 16)).toBeLessThanOrEqual(1)
    const audio = stream(await probe(file('normalized.mp3')), 'audio')
    expect(audio.codec_name).toBe('mp3')
    expect(audio.sample_rate).toBe('44100')
    expect(await probeDurationS(file('normalized.mp3'))).toBeCloseTo(6, 0)
  })

  it('encodes silent input without loudnorm', async () => {
    await loudnormToMp3(file('silence.mp3'), file('silence-normalized.mp3'))
    expect(await integratedLoudness(file('silence-normalized.mp3'))).toBeNull()
    expect(await probeDurationS(file('silence-normalized.mp3'))).toBeCloseTo(2.5, 1)
  })

  it('transcodes a MediaRecorder WebM to the 1080p intro format', async () => {
    await transcodeIntro(file('recording.webm'), file('intro.mp4'))
    const info = await probe(file('intro.mp4'))
    const video = stream(info, 'video')
    expect(video).toMatchObject({ codec_name: 'h264', profile: 'High', width: 1920, height: 1080, pix_fmt: 'yuv420p' })
    expect(video.r_frame_rate).toBe('30/1')
    expect(stream(info, 'audio')).toMatchObject({ codec_name: 'aac', sample_rate: '48000', channels: 2 })
    const atoms = await topLevelAtoms(file('intro.mp4'))
    expect(atoms.indexOf('moov')).toBeLessThan(atoms.indexOf('mdat'))
    const lufs = await integratedLoudness(file('intro.mp4'))
    expect(Math.abs((lufs ?? 0) + 16)).toBeLessThanOrEqual(1)
    expect(await probeDurationS(file('intro.mp4'))).toBeCloseTo(6, 0)
  })

  it('makes a 720p faststart copy', async () => {
    await make720(file('intro.mp4'), file('intro-720.mp4'))
    const info = await probe(file('intro-720.mp4'))
    expect(stream(info, 'video')).toMatchObject({ codec_name: 'h264', width: 1280, height: 720, pix_fmt: 'yuv420p' })
    expect(stream(info, 'audio')).toMatchObject({ codec_name: 'aac', sample_rate: '48000' })
    const atoms = await topLevelAtoms(file('intro-720.mp4'))
    expect(atoms.indexOf('moov')).toBeLessThan(atoms.indexOf('mdat'))
  })

  it('moves the moov atom to the front', async () => {
    const before = await topLevelAtoms(file('plain.mp4'))
    expect(before.indexOf('moov')).toBeGreaterThan(before.indexOf('mdat'))
    await faststart(file('plain.mp4'), file('plain-fast.mp4'))
    const after = await topLevelAtoms(file('plain-fast.mp4'))
    expect(after.indexOf('moov')).toBeLessThan(after.indexOf('mdat'))
    expect((await probe(file('plain-fast.mp4'))).streams).toHaveLength(2)
  })

  it('writes a poster frame and clamps the time to the duration', async () => {
    await posterFrame(file('intro.mp4'), 999, file('poster.jpg'))
    expect(stream(await probe(file('poster.jpg')), 'video')).toMatchObject({ codec_name: 'mjpeg', width: 1920, height: 1080 })
  })

  it('crops a screenshot to a 1200 x 630 JPEG', async () => {
    await ogImage(file('shot.png'), file('og-image.jpg'))
    expect(stream(await probe(file('og-image.jpg')), 'video')).toMatchObject({ codec_name: 'mjpeg', width: 1200, height: 630 })
  })

  it('converts a voice sample to MP3 44.1 kHz', async () => {
    await transcodeVoiceSample(file('recording.webm'), file('voice-sample.mp3'))
    const info = await probe(file('voice-sample.mp3'))
    expect(info.streams).toHaveLength(1)
    expect(stream(info, 'audio')).toMatchObject({ codec_name: 'mp3', sample_rate: '44100' })
  })

  it('reports no loudness for a file without audio', async () => {
    expect(await integratedLoudness(file('shot.png'))).toBeNull()
  })

  it('throws FfmpegError with the stderr tail and leaves no temp file', async () => {
    await writeFile(file('not-media.mp3'), 'plain text, not audio')
    const measured = await loudnormToMp3(file('not-media.mp3'), file('broken.mp3')).catch((caught: unknown) => caught)
    expect(measured).toBeInstanceOf(FfmpegError)
    expect((measured as FfmpegError).stderrTail).toMatch(/invalid data/i)
    const converted = await transcodeVoiceSample(file('not-media.mp3'), file('broken.mp3')).catch((caught: unknown) => caught)
    expect(converted).toBeInstanceOf(FfmpegError)
    expect((converted as FfmpegError).message).toMatch(/^ffmpeg failed: /)
    const leftovers = await readdir(dir)
    expect(leftovers.filter((name) => name.includes('.tmp') || name === 'broken.mp3')).toEqual([])
  })
})
