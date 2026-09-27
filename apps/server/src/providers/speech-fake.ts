import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Lang } from '@mergero/shared'
import { log } from '../log.ts'
import { silenceMp3, transcodeVoiceSample } from '../media/ffmpeg.ts'
import type { SpeechClient, SpeechRequest } from './types.ts'

const run = promisify(execFile)
const SAY_TIMEOUT_MS = 120_000
const WORDS_PER_SECOND = 2.6

const VOICES: Record<Lang, { locales: string[]; preferred: string }> = {
  fi: { locales: ['fi_FI'], preferred: 'Satu' },
  sv: { locales: ['sv_SE'], preferred: 'Alva' },
  nb: { locales: ['nb_NO', 'no_NO'], preferred: 'Nora' },
  da: { locales: ['da_DK'], preferred: 'Sara' },
  de: { locales: ['de_DE'], preferred: 'Anna' },
  en: { locales: ['en_US'], preferred: 'Samantha' },
}

interface SayVoice {
  name: string
  locale: string
}

let sayVoices: Promise<SayVoice[]> | null = null

function listSayVoices(): Promise<SayVoice[]> {
  sayVoices ??= run('say', ['-v', '?'], { timeout: 10_000 })
    .then(({ stdout }) =>
      stdout.split('\n').flatMap((line) => {
        const match = /^(.+?)\s+([a-z]{2,3}_[A-Za-z0-9]+)\s+#/.exec(line)
        return match ? [{ name: match[1]!.trim(), locale: match[2]! }] : []
      }),
    )
    .catch(() => [])
  return sayVoices
}

async function voiceFor(lang: Lang): Promise<string | null> {
  const { locales, preferred } = VOICES[lang]
  const candidates = (await listSayVoices()).filter((voice) => locales.includes(voice.locale))
  const voice =
    candidates.find((item) => item.name === preferred || item.name.startsWith(`${preferred} (`)) ?? candidates[0]
  return voice?.name ?? null
}

export class FakeSpeech implements SpeechClient {
  readonly mode = 'fake' as const

  async synthesize(request: SpeechRequest): Promise<Buffer> {
    const dir = await mkdtemp(path.join(tmpdir(), 'mergero-speech-'))
    try {
      const mp3 = path.join(dir, 'speech.mp3')
      const voice = await voiceFor(request.language)
      if (voice) {
        try {
          const textFile = path.join(dir, 'text.txt')
          const aiff = path.join(dir, 'speech.aiff')
          await writeFile(textFile, request.text)
          await run('say', ['-v', voice, '-o', aiff, '-f', textFile], { timeout: SAY_TIMEOUT_MS })
          await transcodeVoiceSample(aiff, mp3)
          return await readFile(mp3)
        } catch (error) {
          log.warn('fake speech: say failed, using silence', { voice, error })
        }
      }
      const words = request.text.split(/\s+/).filter(Boolean).length
      await silenceMp3(Math.max(1, words / WORDS_PER_SECOND), mp3)
      return await readFile(mp3)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  async cloneVoice(name: string, _sample: Buffer, _fileName: string): Promise<{ voiceId: string }> {
    return { voiceId: `fake-${createHash('sha256').update(name).digest('hex').slice(0, 10)}` }
  }
}
