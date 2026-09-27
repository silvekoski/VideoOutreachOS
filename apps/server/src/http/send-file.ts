import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { Context } from 'hono'

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.vtt': 'text/vtt; charset=utf-8',
  '.json': 'application/json',
}

export interface SendFileOptions {
  cacheControl: string
  contentType?: string
  downloadName?: string | null
}

export interface ByteRange {
  start: number
  end: number
}

export function parseRange(header: string, size: number): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim())
  if (!match) return null
  const [, first = '', last = ''] = match
  if (first === '' && last === '') return null
  if (first === '') {
    const length = Number(last)
    return length === 0 || size === 0 ? 'unsatisfiable' : { start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(first)
  if (last !== '' && Number(last) < start) return null
  if (start >= size) return 'unsatisfiable'
  return { start, end: last === '' ? size - 1 : Math.min(Number(last), size - 1) }
}

function fileBody(file: string, range?: ByteRange): ReadableStream<Uint8Array> {
  return Readable.toWeb(createReadStream(file, range)) as ReadableStream<Uint8Array>
}

export async function sendFile(c: Context, file: string, options: SendFileOptions): Promise<Response | null> {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return null
  const size = info.size
  c.header('Accept-Ranges', 'bytes')
  c.header('Cache-Control', options.cacheControl)
  c.header('Last-Modified', info.mtime.toUTCString())
  const header = c.req.header('Range')
  const range = header === undefined ? null : parseRange(header, size)
  if (range === 'unsatisfiable') {
    c.header('Content-Range', `bytes */${size}`)
    return c.body(null, 416)
  }
  const head = c.req.method === 'HEAD'
  c.header('Content-Type', options.contentType ?? CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  c.header('X-Content-Type-Options', 'nosniff')
  if (options.downloadName) {
    c.header('Content-Disposition', `attachment; filename="${options.downloadName.replace(/[^\w.-]/gu, '_')}"`)
  }
  if (range) {
    c.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
    c.header('Content-Length', String(range.end - range.start + 1))
    return head ? c.body(null, 206) : c.body(fileBody(file, range), 206)
  }
  c.header('Content-Length', String(size))
  return head || size === 0 ? c.body(null, 200) : c.body(fileBody(file), 200)
}
