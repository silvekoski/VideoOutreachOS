import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { integratedLoudness, probeDurationS } from '../../src/media/ffmpeg.ts'
import { FakeSpeech } from '../../src/providers/speech-fake.ts'

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mergero-fake-speech-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('FakeSpeech', { timeout: 60_000 }, () => {
  const speech = new FakeSpeech()

  it('returns a playable MP3 for the text', async () => {
    const text = 'Hei Matti. Tämä video on tehty sinulle ja yrityksellesi Tampereella.'
    const mp3 = await speech.synthesize({ voiceId: 'fake-1', text, language: 'fi' })
    const file = path.join(dir, 'speech.mp3')
    await writeFile(file, mp3)
    const duration = await probeDurationS(file)
    expect(duration).toBeGreaterThan(1)
    expect(duration).toBeLessThan(20)
    if (process.platform === 'darwin') expect(await integratedLoudness(file)).not.toBeNull()
  })

  it('returns a stable fake voice id per name', async () => {
    const first = await speech.cloneVoice('Aino Analyst', Buffer.alloc(0), 'a.mp3')
    expect(first.voiceId).toMatch(/^fake-[0-9a-f]{10}$/)
    expect(await speech.cloneVoice('Aino Analyst', Buffer.alloc(0), 'b.mp3')).toEqual(first)
    expect((await speech.cloneVoice('Other', Buffer.alloc(0), 'a.mp3')).voiceId).not.toBe(first.voiceId)
  })
})
