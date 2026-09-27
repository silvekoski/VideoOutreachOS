import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RecordingChunk } from '@mergero/shared'
import { transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { requireDeal } from '../domain/deals.ts'
import { DomainError } from '../domain/errors.ts'
import { upsertSession } from './ingest.ts'

export const MAX_RECORDING_BYTES = 50 * 1024 * 1024
const CHUNK_FILE = /^(\d+)-(\d+)\.json$/u

interface ChunkFile {
  file: string
  first: number
  part: number
  bytes: number
}

async function chunkFiles(dir: string): Promise<ChunkFile[]> {
  const names = await readdir(dir).catch(() => [])
  const chunks = await Promise.all(
    names.map(async (name) => {
      const match = CHUNK_FILE.exec(name)
      if (!match) return null
      const file = path.join(dir, name)
      const { size } = await stat(file)
      return { file, first: Number(match[1]), part: Number(match[2]), bytes: size }
    }),
  )
  return chunks.filter((chunk) => chunk !== null).sort((a, b) => a.first - b.first || a.part - b.part)
}

function recordingDir(storageDir: string, dealId: number, sessionId: string): string {
  return path.join(storageDir, 'deals', String(dealId), 'recordings', sessionId)
}

export async function saveRecordingChunk(
  db: Db,
  storageDir: string,
  dealId: number,
  chunk: RecordingChunk,
  now: Date,
): Promise<void> {
  transaction(db, () => {
    const deal = requireDeal(db, dealId)
    if (deal.publishedVersion === null) throw new DomainError(409, 'The video link is not published')
    upsertSession(db, deal, chunk, now)
  })
  const dir = recordingDir(storageDir, dealId, chunk.sessionId)
  const file = path.join(dir, `${chunk.events[0]?.timestamp ?? 0}-${chunk.part}.json`)
  const existing = await chunkFiles(dir)
  if (existing.some((item) => item.file === file)) return
  const body = JSON.stringify(chunk.events)
  const used = existing.reduce((sum, item) => sum + item.bytes, 0)
  if (used + Buffer.byteLength(body) > MAX_RECORDING_BYTES) throw new DomainError(413, 'The session recording is too large')
  await mkdir(dir, { recursive: true })
  await writeFile(`${file}.tmp`, body)
  await rename(`${file}.tmp`, file)
}

export async function readRecording(storageDir: string, dealId: number, sessionId: string): Promise<string> {
  const chunks = await chunkFiles(recordingDir(storageDir, dealId, sessionId))
  const bodies = await Promise.all(chunks.map((chunk) => readFile(chunk.file, 'utf8')))
  return `[${bodies
    .map((body) => body.slice(1, -1))
    .filter((body) => body !== '')
    .join(',')}]`
}
