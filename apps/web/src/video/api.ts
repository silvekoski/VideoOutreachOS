import type { ApiError, BookConflictDetail } from '@mergero/shared'

export class HttpError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail?: unknown) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.detail = detail
  }
}

export function isConflict(error: unknown): boolean {
  return error instanceof HttpError && error.status === 409
}

export function bookedMeetingAt(error: unknown): string | null {
  if (!(error instanceof HttpError) || error.status !== 409) return null
  const detail = error.detail as Partial<BookConflictDetail> | null | undefined
  return typeof detail?.meetingAt === 'string' ? detail.meetingAt : null
}

export function pageUrl(code: string, path: string, preview = false): string {
  return `/v/${encodeURIComponent(code)}/${path}${preview ? '?preview=1' : ''}`
}

export async function requestJson<T>(
  url: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const hasBody = init.body !== undefined
  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: hasBody ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
    body: hasBody ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Partial<ApiError> | null
    throw new HttpError(response.status, body?.detail)
  }
  return (await response.json()) as T
}
