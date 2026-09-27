import path from 'node:path'
import type { Lang } from '@mergero/shared'
import { z } from 'zod'
import { ProviderError, fetchFailure, isRetryableStatus } from './errors.ts'
import type { SpeechClient, SpeechRequest } from './types.ts'

const BASE_URL = 'https://api.elevenlabs.io'
const TTS_TIMEOUT_MS = 120_000
const CLONE_TIMEOUT_MS = 180_000
const PROVIDER = 'elevenlabs'
const VOICE_TTL_MS = 3_600_000
const TRAINED_MODELS = ['eleven_multilingual_v2', 'eleven_flash_v2_5']
const MISSING_LANGUAGES: Partial<Record<string, readonly Lang[]>> = { eleven_multilingual_v2: ['nb'] }

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
const voiceSchema = z.object({
  category: z.string().nullish(),
  fine_tuning: z.object({ state: z.record(z.string(), z.string()).nullish() }).nullish(),
})

type Voice = z.infer<typeof voiceSchema>

const speaks = (model: string, language: Lang) => !MISSING_LANGUAGES[model]?.includes(language)

export class ElevenLabsClient implements SpeechClient {
  readonly mode = 'real' as const
  readonly #apiKey: string
  readonly #model: string
  readonly #voices = new Map<string, { at: number; voice: Promise<Voice> }>()

  constructor(apiKey: string, model: string) {
    this.#apiKey = apiKey
    this.#model = model
  }

  async synthesize(request: SpeechRequest): Promise<Buffer> {
    const model = await this.#modelFor(request.voiceId, request.language)
    const body: Record<string, unknown> = { text: request.text, model_id: model }
    if (!model.startsWith('eleven_multilingual_v2')) {
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

  async #modelFor(voiceId: string, language: Lang): Promise<string> {
    const { category, fine_tuning } = await this.#voice(voiceId)
    if (category !== 'professional') return this.#model
    const trained = (model: string) => fine_tuning?.state?.[model] === 'fine_tuned' && speaks(model, language)
    if (trained(this.#model)) return this.#model
    return TRAINED_MODELS.find(trained) ?? this.#model
  }

  #voice(voiceId: string): Promise<Voice> {
    const cached = this.#voices.get(voiceId)
    if (cached && Date.now() - cached.at < VOICE_TTL_MS) return cached.voice
    const voice = this.#send(`/v1/voices/${encodeURIComponent(voiceId)}`, { method: 'GET' }, TTS_TIMEOUT_MS).then(async (res) => {
      const parsed = voiceSchema.safeParse(await res.json().catch(() => null))
      if (parsed.success) return parsed.data
      throw new ProviderError(`ElevenLabs voice ${voiceId} returned an unexpected response: ${z.prettifyError(parsed.error)}`, {
        provider: PROVIDER,
        code: 'bad_response',
        retryable: false,
      })
    })
    voice.catch(() => this.#voices.delete(voiceId))
    this.#voices.set(voiceId, { at: Date.now(), voice })
    return voice
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
