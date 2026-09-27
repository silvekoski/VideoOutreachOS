import { existsSync } from 'node:fs'
import path from 'node:path'
import type { AnalystIntro } from './db/rows.ts'
import { env } from './env.ts'
import { log } from './log.ts'
import { placeholderIntro } from './media/ffmpeg.ts'

export const DEV_VOICE_ID = 'dev-bypass'

const DEV_INTRO_FILE = 'dev/intro.mp4'
const DEV_INTRO_S = 3
const DEV_INTRO_COLOR = '0x111111'

export const DEV_INTRO: AnalystIntro & { file: string; durationS: number } = {
  file: DEV_INTRO_FILE,
  durationS: DEV_INTRO_S,
  recordedAt: '1970-01-01T00:00:00.000Z',
  transcript: null,
  status: 'ready',
}

export async function ensureDevIntro(): Promise<void> {
  const file = path.join(env.storageDir, DEV_INTRO_FILE)
  if (!existsSync(file)) await placeholderIntro(DEV_INTRO_S, DEV_INTRO_COLOR, file)
  log.warn('dev bypass on: analysts without an intro or a voice clone use a placeholder intro and the local fake voice')
}
