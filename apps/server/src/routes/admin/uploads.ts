import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { ApiError } from '@mergero/shared'
import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { DomainError } from '../../domain/errors.ts'

export type UploadKind = 'video' | 'audio' | 'pdf'

const MB = 1024 * 1024
const MULTIPART_OVERHEAD = MB
const SNIFF_BYTES = 16

const LIMITS: Record<UploadKind, number> = { video: 200 * MB, audio: 50 * MB, pdf: 20 * MB }
const MAX_JSON_BYTES = MB

const NAMES: Record<UploadKind, string> = { video: 'a video', audio: 'an audio file', pdf: 'a PDF file' }

const CONTAINERS: Record<UploadKind, readonly string[]> = {
  video: ['mp4', 'mov', 'webm'],
  audio: ['mp3', 'aac', 'wav', 'ogg', 'flac', 'mp4', 'webm'],
  pdf: ['pdf'],
}

function tooLarge(kind: UploadKind): string {
  return `The file is too large. The limit is ${LIMITS[kind] / MB} MB.`
}

export function uploadLimit(kind: UploadKind): MiddlewareHandler {
  return bodyLimit({
    maxSize: LIMITS[kind] + MULTIPART_OVERHEAD,
    onError: (c) => c.json<ApiError>({ error: tooLarge(kind) }, 413),
  })
}

const jsonLimit = bodyLimit({
  maxSize: MAX_JSON_BYTES,
  onError: (c) => c.json<ApiError>({ error: `The request body is too large. The limit is ${MAX_JSON_BYTES / MB} MB.` }, 413),
})

function isMultipart(c: Context): boolean {
  return /^multipart\/form-data\b/iu.test(c.req.header('Content-Type') ?? '')
}

export const jsonBodyLimit: MiddlewareHandler = (c, next) => (isMultipart(c) ? next() : jsonLimit(c, next))

export function containerOf(head: Uint8Array): string | null {
  const text = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to))
  const box = text(4, 8)
  if (box === 'ftyp') return 'mp4'
  if (['moov', 'mdat', 'wide', 'free'].includes(box)) return 'mov'
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm'
  if (text(0, 5) === '%PDF-') return 'pdf'
  if (text(0, 3) === 'ID3') return 'mp3'
  if (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0) return ((head[1] ?? 0) & 0x06) === 0 ? 'aac' : 'mp3'
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return 'wav'
  if (text(0, 4) === 'OggS') return 'ogg'
  if (text(0, 4) === 'fLaC') return 'flac'
  return null
}

export interface Upload {
  form: FormData
  file: File
  ext: string
}

export async function readUpload(c: Context, kind: UploadKind): Promise<Upload> {
  if (!isMultipart(c)) {
    throw new DomainError(400, 'Send the file as multipart/form-data in the field "file"')
  }
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    throw new DomainError(400, 'The multipart body could not be read')
  }
  const file = form.get('file')
  if (!(file instanceof File)) throw new DomainError(400, 'The request has no file in the field "file"')
  if (file.size === 0) throw new DomainError(400, 'The file is empty')
  if (file.size > LIMITS[kind]) throw new HTTPException(413, { message: tooLarge(kind) })
  const ext = containerOf(new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer()))
  if (ext === null || !CONTAINERS[kind].includes(ext)) throw new DomainError(400, `The file is not ${NAMES[kind]}`)
  return { form, file, ext }
}

export function formText(form: FormData, field: string, maxLength: number): string | null {
  const value = form.get(field)
  if (value === null) return null
  if (typeof value !== 'string') throw new DomainError(400, `The field "${field}" must be text`)
  const text = value.trim()
  if (text.length > maxLength) throw new DomainError(400, `The field "${field}" must be ${maxLength} characters or fewer`)
  return text === '' ? null : text
}

export async function saveUpload(file: File, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID().slice(0, 8)}.tmp`)
  try {
    await pipeline(Readable.fromWeb(file.stream() as NodeReadableStream<Uint8Array>), createWriteStream(tmp, { flags: 'wx' }))
    await rename(tmp, target)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}
