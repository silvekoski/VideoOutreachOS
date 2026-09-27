import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElevenLabsClient } from '../../src/providers/elevenlabs.ts'
import { ProviderError } from '../../src/providers/errors.ts'

function mockFetch(response: () => Response) {
  const fn = vi.fn(async (_url: string, _init: RequestInit) => response())
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x44, 0x00, 0x01])

describe('ElevenLabsClient', () => {
  it('sends text to speech with eleven_v3, the language code and the MP3 format', async () => {
    const fetch = mockFetch(() => new Response(mp3, { headers: { 'content-type': 'audio/mpeg' } }))
    const audio = await new ElevenLabsClient('xi-key', 'eleven_v3').synthesize({ voiceId: 'voice 1', text: 'Hei Nora.', language: 'nb' })
    expect(Buffer.isBuffer(audio)).toBe(true)
    expect([...audio]).toEqual([...mp3])
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%201?output_format=mp3_44100_128')
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('xi-api-key')).toBe('xi-key')
    expect(headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ text: 'Hei Nora.', model_id: 'eleven_v3', language_code: 'no' })
  })

  it('leaves out language_code for eleven_multilingual_v2', async () => {
    const fetch = mockFetch(() => new Response(mp3))
    await new ElevenLabsClient('xi-key', 'eleven_multilingual_v2').synthesize({ voiceId: 'v', text: 'Hej.', language: 'da' })
    expect(JSON.parse(String(fetch.mock.calls[0]![1].body))).toEqual({ text: 'Hej.', model_id: 'eleven_multilingual_v2' })
  })

  it('clones a voice with a multipart upload', async () => {
    const fetch = mockFetch(() => Response.json({ voice_id: 'cloned-1', requires_verification: false }))
    const result = await new ElevenLabsClient('xi-key', 'eleven_v3').cloneVoice('Aino Analyst', Buffer.from(mp3), 'voice-sample.mp3')
    expect(result).toEqual({ voiceId: 'cloned-1' })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.elevenlabs.io/v1/voices/add')
    expect(new Headers(init.headers).get('xi-api-key')).toBe('xi-key')
    expect(new Headers(init.headers).has('content-type')).toBe(false)
    const form = init.body as FormData
    expect(form.get('name')).toBe('Aino Analyst')
    expect(form.get('remove_background_noise')).toBe('false')
    expect(String(form.get('description'))).toContain('Aino Analyst')
    const file = form.get('files') as File
    expect(file.name).toBe('voice-sample.mp3')
    expect(file.type).toBe('audio/mpeg')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(mp3)
  })

  it('refuses a clone that needs a verification', async () => {
    mockFetch(() => Response.json({ voice_id: 'cloned-2', requires_verification: true }))
    const error = await new ElevenLabsClient('k', 'eleven_v3').cloneVoice('Aino', Buffer.from(mp3), 'a.mp3').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ code: 'requires_verification', retryable: false })
    expect((error as Error).message).toContain('cloned-2')
  })

  it.each([
    [429, { detail: { type: 'rate_limit_error', code: 'concurrent_limit_exceeded', message: 'Too many' } }, true, 'concurrent_limit_exceeded'],
    [503, { detail: { code: 'service_unavailable', message: 'Busy' } }, true, 'service_unavailable'],
    [401, { detail: { type: 'authentication_error', code: 'unauthorized', message: 'Invalid API key' } }, false, 'unauthorized'],
    [422, { detail: [{ type: 'missing', loc: ['body', 'text'], msg: 'Field required' }] }, false, 'validation_error'],
  ])('maps HTTP %i to retryable=%s', async (status, body, retryable, code) => {
    mockFetch(() => Response.json(body, { status }))
    const error = await new ElevenLabsClient('k', 'eleven_v3')
      .synthesize({ voiceId: 'v', text: 'x', language: 'fi' })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ status, retryable, code, provider: 'elevenlabs' })
  })

  it('marks a network error as retryable', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')))
    await expect(
      new ElevenLabsClient('k', 'eleven_v3').synthesize({ voiceId: 'v', text: 'x', language: 'de' }),
    ).rejects.toMatchObject({ code: 'network', retryable: true })
  })
})
