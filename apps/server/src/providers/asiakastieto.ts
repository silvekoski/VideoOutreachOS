import { z } from 'zod'
import { ProviderError, fetchFailure, isRetryableStatus } from './errors.ts'
import type { FinancialsClient, FinancialsRecord } from './types.ts'

const PROVIDER = 'asiakastieto'
const TIMEOUT_MS = 15_000

const recordSchema = z.object({
  businessId: z.string().optional(),
  revenue: z.number(),
  profit: z.number(),
  fiscalYear: z.number().int(),
})

export class AsiakastietoClient implements FinancialsClient {
  readonly #baseUrl: string

  constructor(baseUrl: string) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '')
  }

  async get(businessId: string): Promise<FinancialsRecord | null> {
    const id = businessId.trim()
    if (!id) return null
    const url = `${this.#baseUrl}/${encodeURIComponent(id)}`
    let res: Response
    try {
      res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      const failure = fetchFailure(error)
      throw new ProviderError(`Asiakastieto ${id}: ${failure.message}`, {
        provider: PROVIDER,
        code: failure.code,
        retryable: true,
        cause: error,
      })
    }
    if (res.status === 404) {
      await res.body?.cancel()
      return null
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 200)
      throw new ProviderError(`Asiakastieto ${id}: HTTP ${res.status}${detail ? `: ${detail}` : ''}`, {
        provider: PROVIDER,
        status: res.status,
        code: `http_${res.status}`,
        retryable: isRetryableStatus(res.status),
      })
    }
    const parsed = recordSchema.safeParse(await res.json().catch(() => null))
    if (!parsed.success) {
      throw new ProviderError(`Asiakastieto ${id}: unexpected response: ${z.prettifyError(parsed.error)}`, {
        provider: PROVIDER,
        code: 'bad_response',
        retryable: false,
      })
    }
    const { revenue, profit, fiscalYear } = parsed.data
    return { businessId: parsed.data.businessId ?? id, revenue, profit, fiscalYear }
  }
}
