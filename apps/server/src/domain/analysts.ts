import path from 'node:path'
import { LANGUAGES, isTimeZone } from '@mergero/shared'
import type { AnalystDto, AnalystPatch, IntroUpload, Lang } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { toAnalystRow } from '../db/rows.ts'
import type { AnalystColumns, AnalystIntro, AnalystRow } from '../db/rows.ts'
import type { PipedriveClient } from '../providers/types.ts'
import { DomainError } from './errors.ts'

const DEFAULT_TIME_ZONE = 'Europe/Helsinki'

const PATCH_COLUMNS: Record<keyof AnalystPatch, keyof AnalystColumns> = {
  defaultExpiryDays: 'default_expiry_days',
  defaultSecondChannel: 'default_second_channel',
  briefLanguage: 'brief_language',
  timeZone: 'time_zone',
}

export function getAnalyst(db: Db, id: number): AnalystRow | null {
  const row = sql<AnalystColumns>(db, 'SELECT * FROM analysts WHERE id = ?').get(id)
  return row ? toAnalystRow(row) : null
}

export function requireAnalyst(db: Db, id: number): AnalystRow {
  const analyst = getAnalyst(db, id)
  if (!analyst) throw new DomainError(404, `Analyst ${id} does not exist`)
  return analyst
}

export function listAnalysts(db: Db): AnalystRow[] {
  return sql<AnalystColumns>(db, 'SELECT * FROM analysts ORDER BY name, id').all().map(toAnalystRow)
}

export async function syncAnalysts(
  db: Db,
  pipedrive: Pick<PipedriveClient, 'listUsers'>,
  options: { ensureIds?: readonly number[]; now?: Date } = {},
): Promise<AnalystRow[]> {
  const users = await pipedrive.listUsers()
  const at = nowIso(options.now)
  const ensure = new Set(options.ensureIds ?? [])
  transaction(db, () => {
    const zoneSql = `CASE WHEN analysts.time_zone_local = 1 OR @zone IS NULL THEN analysts.time_zone ELSE @zone END`
    const changedSql = `analysts.name IS NOT @name OR analysts.email IS NOT @email OR analysts.time_zone IS NOT ${zoneSql}`
    const insert = sql(
      db,
      `INSERT INTO analysts (id, name, email, time_zone, created_at, updated_at)
       VALUES (@id, @name, @email, COALESCE(@zone, '${DEFAULT_TIME_ZONE}'), @at, @at)
       ON CONFLICT (id) DO UPDATE SET name = @name, email = @email, time_zone = ${zoneSql}, updated_at = @at
       WHERE ${changedSql}`,
    )
    const update = sql(
      db,
      `UPDATE analysts SET name = @name, email = @email, time_zone = ${zoneSql}, updated_at = @at WHERE id = @id AND (${changedSql})`,
    )
    for (const user of users) {
      const zone = user.timeZone !== null && isTimeZone(user.timeZone) ? user.timeZone : null
      const row = { id: user.id, name: user.name, email: user.email, zone, at }
      if (user.active || ensure.has(user.id)) insert.run(row)
      else update.run(row)
    }
  })
  return listAnalysts(db)
}

export function updateAnalyst(db: Db, id: number, patch: AnalystPatch, now: Date = new Date()): AnalystRow {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as [keyof AnalystPatch, unknown][]
  return transaction(db, () => {
    requireAnalyst(db, id)
    if (entries.length > 0) {
      const sets = entries.map(([key]) => `${PATCH_COLUMNS[key]} = ?`)
      if (patch.timeZone !== undefined) sets.push('time_zone_local = 1')
      db.prepare(`UPDATE analysts SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(
        ...entries.map(([, value]) => value),
        nowIso(now),
        id,
      )
    }
    return requireAnalyst(db, id)
  })
}

function setColumns(db: Db, id: number, columns: Partial<Record<keyof AnalystColumns, unknown>>, now: Date): AnalystRow {
  const entries = Object.entries(columns)
  return transaction(db, () => {
    requireAnalyst(db, id)
    db.prepare(`UPDATE analysts SET ${entries.map(([column]) => `${column} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...entries.map(([, value]) => value),
      nowIso(now),
      id,
    )
    return requireAnalyst(db, id)
  })
}

function updateIntro(
  db: Db,
  id: number,
  lang: Lang,
  now: Date,
  change: (current: AnalystIntro | undefined) => AnalystIntro | null,
): AnalystRow | null {
  return transaction(db, () => {
    const analyst = requireAnalyst(db, id)
    const next = change(analyst.intros[lang])
    if (!next) return null
    return setColumns(db, id, { intros: JSON.stringify({ ...analyst.intros, [lang]: next }) }, now)
  })
}

export function introUpload(intro: AnalystIntro | undefined): Pick<AnalystIntro, 'recordedAt' | 'transcript' | 'status'> | undefined {
  return intro?.pending ?? intro
}

export function startIntro(
  db: Db,
  id: number,
  lang: Lang,
  input: { recordedAt: string; transcript: string | null },
  now: Date = new Date(),
): AnalystRow {
  return updateIntro(db, id, lang, now, (current) => {
    const upload: IntroUpload = { recordedAt: input.recordedAt, transcript: input.transcript, status: 'processing' }
    return current?.status === 'ready' ? { ...current, pending: upload } : { file: null, durationS: null, ...upload }
  }) as AnalystRow
}

export function completeIntro(
  db: Db,
  id: number,
  lang: Lang,
  recordedAt: string,
  result: { file: string; durationS: number },
  now: Date = new Date(),
): AnalystRow | null {
  return updateIntro(db, id, lang, now, (current) => {
    const upload = introUpload(current)
    return upload?.recordedAt === recordedAt ? { ...result, recordedAt, transcript: upload.transcript, status: 'ready' } : null
  })
}

export function failIntro(db: Db, id: number, lang: Lang, recordedAt: string, now: Date = new Date()): AnalystRow | null {
  return updateIntro(db, id, lang, now, (current) => {
    if (current?.pending?.recordedAt === recordedAt) return { ...current, pending: { ...current.pending, status: 'failed' } }
    return current?.recordedAt === recordedAt && current.status !== 'ready' ? { ...current, status: 'failed' } : null
  })
}

export function readyIntro(analyst: AnalystRow | null, lang: Lang): (AnalystIntro & { file: string; durationS: number }) | null {
  const intro = analyst?.intros[lang]
  return intro?.status === 'ready' && intro.file !== null && intro.durationS !== null
    ? { ...intro, file: intro.file, durationS: intro.durationS }
    : null
}

export function setVoiceSample(db: Db, id: number, file: string, now: Date = new Date()): AnalystRow {
  return setColumns(db, id, { voice_sample_file: file }, now)
}

export function markClonePending(db: Db, id: number, now: Date = new Date()): AnalystRow {
  return setColumns(db, id, { clone_status: 'pending' }, now)
}

export function setVoiceId(db: Db, id: number, voiceId: string | null, now: Date = new Date()): AnalystRow {
  return setColumns(db, id, { voice_id: voiceId, clone_status: voiceId === null ? 'none' : 'ready' }, now)
}

export function failVoiceClone(db: Db, id: number, now: Date = new Date()): AnalystRow {
  return setColumns(db, id, { clone_status: 'failed' }, now)
}

export function setConsent(db: Db, id: number, input: { date: string; file: string }, now: Date = new Date()): AnalystRow {
  return setColumns(db, id, { consent_date: input.date, consent_file: input.file }, now)
}

export function markAlertsSeen(db: Db, id: number, now: Date = new Date()): AnalystRow {
  return setColumns(db, id, { alerts_seen_at: nowIso(now) }, now)
}

export function toAnalystDto(row: AnalystRow, fileUrlBase = '/api/analysts'): AnalystDto {
  const fileUrl = (file: string | null, version: string) =>
    file === null
      ? null
      : `${fileUrlBase}/${row.id}/files/${encodeURIComponent(path.posix.basename(file))}?v=${encodeURIComponent(version)}`
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    timeZone: row.timeZone,
    intros: LANGUAGES.flatMap((language) => {
      const intro = row.intros[language]
      if (!intro) return []
      return [
        {
          language,
          status: intro.status,
          recordedAt: intro.recordedAt,
          durationS: intro.durationS,
          transcript: intro.transcript,
          url: fileUrl(intro.file, intro.recordedAt),
          ...(intro.pending ? { pending: intro.pending } : {}),
        },
      ]
    }),
    voice: {
      sampleUrl: fileUrl(row.voiceSampleFile, row.updatedAt),
      voiceId: row.voiceId,
      cloneStatus: row.cloneStatus,
      consentDate: row.consentDate,
      consentUrl: fileUrl(row.consentFile, row.updatedAt),
    },
    defaultExpiryDays: row.defaultExpiryDays,
    defaultSecondChannel: row.defaultSecondChannel,
    briefLanguage: row.briefLanguage,
  }
}
