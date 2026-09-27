import type { Stats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export interface StaticMount {
  prefix: string
  root: string
}

export function sendText(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers }).end(text)
}

async function statOrNull(file: string): Promise<Stats | null> {
  try {
    return await stat(file)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}

function safeSegments(rest: string): string[] | null {
  const segments = rest.split('/')
  if (segments.at(-1) === '') segments.pop()
  if (segments.length === 0) return null
  try {
    const decoded = segments.map((segment) => decodeURIComponent(segment))
    return decoded.every((segment) => segment !== '' && !segment.startsWith('.') && !/[/\\\0]/.test(segment))
      ? decoded
      : null
  } catch {
    return null
  }
}

export async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL, mount: StaticMount): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed', { allow: 'GET, HEAD' })
  const rest = url.pathname.slice(mount.prefix.length)
  const segments = safeSegments(rest)
  const root = path.resolve(mount.root)
  const file = segments === null ? null : path.join(root, ...segments)
  if (file === null || !file.startsWith(root + path.sep) || rest.endsWith('/')) return sendText(res, 404, 'Not found')
  if (!(await statOrNull(file))?.isFile()) return sendText(res, 404, 'Not found')

  const body = await readFile(file)
  res
    .writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(body.length),
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    })
    .end(body)
}
