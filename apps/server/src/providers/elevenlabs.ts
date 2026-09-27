import path from 'node:path'
import { z } from 'zod'
import { ProviderError, fetchFailure, isRetryableStatus } from './errors.ts'
import type { SpeechClient, SpeechRequest } from './types.ts'

const BASE_URL = 'https://api.elevenlabs.io'
const TTS_TIMEOUT_MS = 120_000
const CLONE_TIMEOUT_MS = 180_000
const PROVIDER = 'elevenlabs'

const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
}

const cloneSchema = z.object({ voice_id: z.string().min(1), requires_verification: z.boolean() })

export class ElevenLabsClient implements SpeechClient {
  readonly mode = 'real' as const
  readonly #apiKey: string
  readonly #model: string

  constructor(apiKey: string, model: string) {
    this.#apiKey = apiKey
    this.#model = model
  }

  async synthesize(request: SpeechRequest): Promise<Buffer> {
    const body: Record<string, unknown> = { text: request.text, model_id: this.#model }
    if (!this.#model.startsWith('eleven_multilingual_v2')) {
      body.language_code = request.language === 'nb' ? 'no' : request.language
    }
    const res = await this.#send(
      `/v1/text-to-speech/${encodeURIComponent(request.voiceId)}?output_format=mp3_44100_128`,
      { method: 'POST', headers: { 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify(body) },
      TTS_TIMEOUT_MS,
    )
    const audio = Buffer.from(await res.arrayBuffer())
    if (audio.length === 0) {
      throw new ProviderError('ElevenLabs returned an empty audio file', { provider: PROVIDER, code: 'empty_audio', retryable: true })
    }
    return audio
  }

  async cloneVoice(name: string, sample: Buffer, fileName: string): Promise<{ voiceId: string }> {
    const form = new FormData()
    form.append('name', name)
    form.append(
      'files',
      new Blob([new Uint8Array(sample)], { type: AUDIO_TYPES[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream' }),
      fileName,
    )
    form.append('remove_background_noise', 'false')
    form.append('description', `Voice of ${name} for Mergero video outreach. The written consent is stored in the Mergero tool.`)
    const res = await this.#send('/v1/voices/add', { method: 'POST', body: form }, CLONE_TIMEOUT_MS)
    const parsed = cloneSchema.safeParse(await res.json().catch(() => null))
    if (!parsed.success) {
      throw new ProviderError(`ElevenLabs voice clone returned an unexpected response: ${z.prettifyError(parsed.error)}`, {
        provider: PROVIDER,
        code: 'bad_response',
        retryable: false,
      })
    }
    if (parsed.data.requires_verification) {
      throw new ProviderError(
        `ElevenLabs made voice ${parsed.data.voice_id} for ${name}, but the voice needs a verification before it can speak. Verify it in the ElevenLabs dashboard, then upload the sample again.`,
        { provider: PROVIDER, code: 'requires_verification', retryable: false },
      )
    }
    return { voiceId: parsed.data.voice_id }
  }

  async #send(pathAndQuery: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    let res: Response
    try {
      res = await fetch(`${BASE_URL}${pathAndQuery}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), 'xi-api-key': this.#apiKey },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (error) {
      const failure = fetchFailure(error)
      throw new ProviderError(`ElevenLabs ${failure.message}`, { provider: PROVIDER, code: failure.code, retryable: true, cause: error })
    }
    if (res.ok) return res
    const { code, message } = errorDetail(await res.text().catch(() => ''))
    throw new ProviderError(`ElevenLabs HTTP ${res.status}${code ? ` ${code}` : ''}: ${message || res.statusText}`, {
      provider: PROVIDER,
      status: res.status,
      code: code ?? `http_${res.status}`,
      retryable: isRetryableStatus(res.status),
    })
  }
}

function errorDetail(text: string): { code: string | null; message: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { code: null, message: text.slice(0, 300) }
  }
  const detail = (json as { detail?: unknown }).detail
  if (typeof detail === 'string') return { code: null, message: detail }
  if (Array.isArray(detail)) {
    const issues = detail.map((issue: { loc?: unknown[]; msg?: string }) => `${(issue.loc ?? []).join('.')}: ${issue.msg ?? ''}`)
    return { code: 'validation_error', message: issues.join('; ') }
  }
  if (detail && typeof detail === 'object') {
    const record = detail as { code?: string; status?: string; message?: string }
    return { code: record.code ?? record.status ?? null, message: record.message ?? '' }
  }
  return { code: null, message: text.slice(0, 300) }
}
