import { randomUUID } from 'node:crypto'
import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { LANGUAGES, analystPatchSchema, isLang, voiceIdBodySchema } from '@mergero/shared'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { nowIso, transaction } from '../../db/index.ts'
import type { Db } from '../../db/index.ts'
import type { AnalystRow } from '../../db/rows.ts'
import {
  listAnalysts,
  markAlertsSeen,
  markClonePending,
  requireAnalyst,
  setConsent,
  setVoiceId,
  setVoiceSample,
  startIntro,
  syncAnalysts,
  toAnalystDto,
  updateAnalyst,
} from '../../domain/analysts.ts'
import { DomainError } from '../../domain/errors.ts'
import { alertsFor } from '../../domain/events.ts'
import { advanceAnalystDeals } from '../../domain/pipeline.ts'
import { log } from '../../log.ts'
import { FfmpegError, transcodeVoiceSample } from '../../media/ffmpeg.ts'
import { insideDir, paths } from '../../paths.ts'
import { enqueue, jobKeys } from '../../queue/index.ts'
import { isIsoDate, localDate } from '../../views/dates.ts'
import { adminContext } from './context.ts'
import { parseId, parseInput, readJson, sendExistingFile } from './http.ts'
import { formText, readUpload, saveUpload, uploadLimit } from './uploads.ts'

const MAX_TRANSCRIPT = 5000
const ALERT_DAYS = 14
const DAY_MS = 86_400_000
const ANALYST_FILE = new RegExp(`^(?:intro-(?:${LANGUAGES.join('|')})\\.mp4|voice-sample\\.mp3|consent\\.pdf)$`, 'u')

const analystQuery = z.object({ analyst: z.string() })
const alertsSeenBody = z.object({ analyst: z.int().positive() })

const voiceFile = (id: number) => `analysts/${id}/voice-sample.mp3`
const consentFile = (id: number) => `analysts/${id}/consent.pdf`

export const analystRoutes = new Hono()

function analystId(c: Context): number {
  return parseId(c.req.param('id'), 'analyst ID')
}

export function analystFromQuery(c: Context, db: Db): AnalystRow {
  const { analyst } = parseInput(analystQuery, c.req.query(), 'query')
  return requireAnalyst(db, parseId(analyst, 'analyst ID'))
}

function rejectedInput(error: unknown): error is FfmpegError {
  if (!(error instanceof FfmpegError)) return false
  const cause = error.cause as { code?: unknown; killed?: boolean } | undefined
  return cause === undefined || (typeof cause.code === 'number' && cause.killed !== true)
}

async function sampleTime(id: number): Promise<string | null> {
  const info = await stat(paths.voiceSample(id)).catch(() => null)
  return info?.isFile() ? info.mtime.toISOString() : null
}

function queueClone(db: Db, row: AnalystRow, sampleAt: string, now: Date): AnalystRow {
  const job = enqueue(db, 'audio', jobKeys.audioClone(row.id, sampleAt), { kind: 'clone', analystId: row.id }, { now })
  return job ? markClonePending(db, row.id, now) : row
}

function consentDate(value: string | null, timeZone: string, now: Date): string {
  if (value === null || !isIsoDate(value)) throw new DomainError(400, 'The consent date must be a date in the format YYYY-MM-DD')
  if (value > localDate(now, timeZone)) throw new DomainError(400, 'The consent date must not be in the future')
  return value
}

analystRoutes.get('/analysts', async (c) => {
  const context = adminContext()
  const rows = listAnalysts(context.db)
  const analysts = rows.length > 0 ? rows : await syncAnalysts(context.db, context.providers.pipedrive, { now: context.now })
  return c.json(analysts.map((row) => toAnalystDto(row)))
})

analystRoutes.patch('/analysts/:id', async (c) => {
  const { db, now } = adminContext()
  const id = analystId(c)
  const patch = await readJson(c, analystPatchSchema)
  return c.json(toAnalystDto(updateAnalyst(db, id, patch, now)))
})

analystRoutes.post('/analysts/:id/intros/:lang', uploadLimit('video'), async (c) => {
  const { db, now } = adminContext()
  const id = analystId(c)
  const lang = c.req.param('lang')
  if (!isLang(lang)) throw new DomainError(400, `The language must be one of ${LANGUAGES.join(', ')}`)
  requireAnalyst(db, id)
  const upload = await readUpload(c, 'video')
  const transcript = formText(upload.form, 'transcript', MAX_TRANSCRIPT)
  if (transcript === null) {
    throw new DomainError(400, 'The transcript is required. Write the text that you say in the intro, for the captions of the video.')
  }
  const recordedAt = nowIso(now)
  const uploadFile = `cache/uploads/intro-${id}-${lang}-${randomUUID()}.${upload.ext}`
  const target = path.join(paths.root, ...uploadFile.split('/'))
  await saveUpload(upload.file, target)
  try {
    const analyst = transaction(db, () => {
      const row = startIntro(db, id, lang, { recordedAt, transcript }, now)
      enqueue(db, 'audio', jobKeys.audioIntro(id, lang, recordedAt), { kind: 'intro', analystId: id, lang, uploadFile, recordedAt }, { now })
      return row
    })
    log.info('intro uploaded', { analystId: id, lang, uploadFile, bytes: upload.file.size })
    return c.json(toAnalystDto(analyst))
  } catch (error) {
    await rm(target, { force: true })
    throw error
  }
})

analystRoutes.post('/analysts/:id/voice', uploadLimit('audio'), async (c) => {
  const { db, now } = adminContext()
  const id = analystId(c)
  requireAnalyst(db, id)
  const upload = await readUpload(c, 'audio')
  const raw = path.join(paths.uploadsDir, `voice-${id}-${randomUUID()}.${upload.ext}`)
  await saveUpload(upload.file, raw)
  try {
    await transcodeVoiceSample(raw, paths.voiceSample(id))
  } catch (error) {
    if (!rejectedInput(error)) throw error
    log.warn('voice sample could not be transcoded', { analystId: id, error: error.message, stderr: error.stderrTail })
    throw new DomainError(400, 'The audio file could not be read. Record the voice sample again or choose another file.')
  } finally {
    await rm(raw, { force: true })
  }
  const sampleAt = (await sampleTime(id)) ?? nowIso(now)
  const analyst = transaction(db, () => {
    const row = setVoiceSample(db, id, voiceFile(id), now)
    return row.consentFile !== null ? queueClone(db, row, sampleAt, now) : row
  })
  return c.json(toAnalystDto(analyst))
})

analystRoutes.put('/analysts/:id/voice-id', async (c) => {
  const { db, now } = adminContext()
  const id = analystId(c)
  const { voiceId } = await readJson(c, voiceIdBodySchema)
  const analyst = setVoiceId(db, id, voiceId, now)
  advanceAnalystDeals(db, id, now)
  return c.json(toAnalystDto(analyst))
})

analystRoutes.post('/analysts/:id/consent', uploadLimit('pdf'), async (c) => {
  const { db, now } = adminContext()
  const id = analystId(c)
  const current = requireAnalyst(db, id)
  const upload = await readUpload(c, 'pdf')
  const date = consentDate(formText(upload.form, 'date', 32), current.timeZone, now)
  await saveUpload(upload.file, paths.consent(id))
  const sampleAt = await sampleTime(id)
  const analyst = transaction(db, () => {
    const row = setConsent(db, id, { date, file: consentFile(id) }, now)
    const clone = row.voiceSampleFile !== null && row.cloneStatus !== 'ready' && sampleAt !== null
    return clone ? queueClone(db, row, sampleAt, now) : row
  })
  return c.json(toAnalystDto(analyst))
})

analystRoutes.get('/analysts/:id/files/:file', async (c) => {
  const { db } = adminContext()
  const id = analystId(c)
  requireAnalyst(db, id)
  const name = c.req.param('file')
  const file = ANALYST_FILE.test(name) ? insideDir(paths.analystDir(id), name) : null
  if (!file) throw new DomainError(404, 'The file does not exist')
  return sendExistingFile(c, file, { cacheControl: 'private, no-cache' })
})

analystRoutes.get('/alerts', (c) => {
  const { db, now } = adminContext()
  const analyst = analystFromQuery(c, db)
  return c.json(alertsFor(db, analyst.id, new Date(now.getTime() - ALERT_DAYS * DAY_MS)))
})

analystRoutes.post('/alerts/seen', async (c) => {
  const { db, now } = adminContext()
  const { analyst } = await readJson(c, alertsSeenBody)
  markAlertsSeen(db, analyst, now)
  return c.body(null, 204)
})
