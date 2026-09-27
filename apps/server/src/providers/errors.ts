import type { ScrapeFailure } from '@mergero/shared'

export interface ProviderErrorInit {
  provider: string
  retryable: boolean
  status?: number | null
  code?: string | null
  cause?: unknown
}

export class ProviderError extends Error {
  readonly provider: string
  readonly retryable: boolean
  readonly status: number | null
  readonly code: string | null

  constructor(message: string, init: ProviderErrorInit) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = new.target.name
    this.provider = init.provider
    this.retryable = init.retryable
    this.status = init.status ?? null
    this.code = init.code ?? null
  }
}

export class ScrapeError extends ProviderError {
  readonly reason: ScrapeFailure

  constructor(message: string, init: ProviderErrorInit & { reason: ScrapeFailure }) {
    super(message, init)
    this.reason = init.reason
  }
}

export function fetchFailure(error: unknown): { code: 'timeout' | 'network'; message: string } {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { code: 'timeout', message: 'request timed out' }
  }
  const text = error instanceof Error ? error.message : String(error)
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : ''
  return { code: 'network', message: `network error: ${text}${cause}` }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}
