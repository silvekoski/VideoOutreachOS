import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeatherlessClient, ModelError, firstJsonValue } from '../../src/providers/featherless.ts'
import type { ChatJsonRequest } from '../../src/providers/types.ts'

const request: ChatJsonRequest = {
  system: 'Write the script of slide 2.',
  user: '{"task":"slide-script","slide":2}',
  schemaName: 'slide-script',
  schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] },
  maxTokens: 4096,
}

function sse(events: unknown[], chunkSize = 7): Response {
  const text = [...events.map((event) => `data: ${JSON.stringify(event)}\n\n`), 'data: [DONE]\n\n'].join('')
  const bytes = new TextEncoder().encode(text)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req-1' } })
}

function deltas(parts: string[], extra: Record<string, unknown>[] = [], finishReason = 'stop'): unknown[] {
  return [
    ...extra,
    ...parts.map((content) => ({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })),
    { choices: [{ index: 0, delta: {}, finish_reason: finishReason }] },
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
  ]
}

function mockFetch(response: Response | (() => Promise<Response>)) {
  const fn = vi.fn(async (_url: string, _init: RequestInit) => (typeof response === 'function' ? response() : response))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const client = new FeatherlessClient('fl-key')

describe('FeatherlessClient', () => {
  it('sends the Kimi-K3 request and reads only the streamed content', async () => {
    const fetch = mockFetch(
      sse(
        deltas(['{"scr', 'ipt": "Hei Matti', '"}'], [
          { choices: [{ index: 0, delta: { reasoning_content: 'I think {"script": "wrong"}' }, finish_reason: null }] },
          { choices: [{ index: 0, delta: { reasoning: 'more thoughts' }, finish_reason: null }] },
        ]),
      ),
    )
    expect(await client.completeJson(request)).toEqual({ script: 'Hei Matti' })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.featherless.ai/v1/chat/completions')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer fl-key')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'moonshotai/Kimi-K3',
      max_tokens: 4096,
      temperature: 1,
      top_p: 0.95,
      chat_template_kwargs: { thinking_effort: 'low' },
      stream: true,
    })
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('Write the script of slide 2.')
    expect(body.messages[0].content).toContain('Return exactly one JSON value that matches this JSON Schema')
    expect(body.messages[0].content).toContain(JSON.stringify(request.schema))
    expect(body.messages[1]).toEqual({ role: 'user', content: request.user })
  })

  it('takes JSON out of a fenced block after prose', async () => {
    mockFetch(sse(deltas(['Here are the lines:\n```json\n{"lines": ["a", "b", "c"]}\n```\nDone.'])))
    expect(await client.completeJson(request)).toEqual({ lines: ['a', 'b', 'c'] })
  })

  it('strips leaked think text', async () => {
    mockFetch(sse(deltas(['<think>maybe {"script": "draft"} is good</think>\n{"script": "final"}'])))
    expect(await client.completeJson(request)).toEqual({ script: 'final' })
    mockFetch(sse(deltas(['reasoning without an open tag {broken</think>{"script": "after close"}'])))
    expect(await client.completeJson(request)).toEqual({ script: 'after close' })
    mockFetch(
      sse(deltas(['plan {"x": 1}<|close|>think<|sep|><|open|>response<|sep|>{"script": "xtml"}<|close|>response<|sep|>'])),
    )
    expect(await client.completeJson(request)).toEqual({ script: 'xtml' })
  })

  it('reads a plain JSON completion when the server does not stream', async () => {
    mockFetch(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"script": "plain"}' }, finish_reason: 'stop' }] }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(await client.completeJson(request)).toEqual({ script: 'plain' })
  })

  it('throws a non-retryable truncated error when the output stops at max_tokens', async () => {
    mockFetch(sse(deltas(['{"script": "cut'], [], 'length')))
    const error = await client.completeJson(request).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ModelError)
    expect(error).toMatchObject({ code: 'truncated', retryable: false, provider: 'featherless' })
  })

  it('throws no_json when the content has no JSON', async () => {
    mockFetch(sse(deltas(['I cannot help with that.'])))
    await expect(client.completeJson(request)).rejects.toMatchObject({ code: 'no_json', retryable: false })
  })

  it.each([
    [429, true],
    [503, true],
    [500, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
  ])('marks HTTP %i as retryable=%s', async (status, retryable) => {
    mockFetch(
      new Response(JSON.stringify({ error: { message: 'failure', type: 'invalid_request_error', code: 'some_code' } }), {
        status,
        headers: { 'content-type': 'application/json', 'request-id': 'req-9' },
      }),
    )
    const error = await client.completeJson(request).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ModelError)
    expect(error).toMatchObject({ status, retryable, code: 'some_code' })
    expect((error as Error).message).toContain('req-9')
  })

  it('marks network errors and stream errors as retryable', async () => {
    mockFetch(() => Promise.reject(new TypeError('fetch failed')))
    await expect(client.completeJson(request)).rejects.toMatchObject({ code: 'network', retryable: true })
    mockFetch(sse([{ error: { message: 'No valid Executor', code: 'no_executor' } }]))
    await expect(client.completeJson(request)).rejects.toMatchObject({ code: 'no_executor', retryable: true })
  })
})

describe('firstJsonValue', () => {
  it('prefers the last complete JSON span and survives braces inside strings', () => {
    expect(firstJsonValue('note [1] then {"text": "a } brace", "n": [1, 2]}')).toEqual({ text: 'a } brace', n: [1, 2] })
    expect(firstJsonValue('[1, 2]')).toEqual([1, 2])
    expect(firstJsonValue('no json here')).toBeUndefined()
  })
})
