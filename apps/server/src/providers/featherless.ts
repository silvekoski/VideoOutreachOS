import { log } from '../log.ts'
import { ProviderError, fetchFailure, type ProviderErrorInit } from './errors.ts'
import type { ChatJsonRequest, LanguageModelClient } from './types.ts'

const ENDPOINT = 'https://api.featherless.ai/v1/chat/completions'
const MODEL = 'moonshotai/Kimi-K3'
const TIMEOUT_MS = 600_000
const PROVIDER = 'featherless'

export class ModelError extends ProviderError {
  constructor(message: string, init: Omit<ProviderErrorInit, 'provider'> & { provider?: string }) {
    super(message, { ...init, provider: init.provider ?? PROVIDER })
  }
}

interface StreamResult {
  content: string
  finishReason: string | null
  usage: unknown
}

export class FeatherlessClient implements LanguageModelClient {
  readonly mode = 'real' as const
  readonly #apiKey: string

  constructor(apiKey: string) {
    this.#apiKey = apiKey
  }

  async completeJson(request: ChatJsonRequest): Promise<unknown> {
    const body = {
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `${request.system}\n\nReturn exactly one JSON value that matches this JSON Schema. Output raw JSON only: no markdown code fences, no prose before or after.\nJSON Schema:\n${JSON.stringify(request.schema)}`,
        },
        { role: 'user', content: request.user },
      ],
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 1,
      top_p: 0.95,
      chat_template_kwargs: { thinking_effort: 'low' },
      stream: true,
      stream_options: { include_usage: true },
    }
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'x-title': 'Mergero video tool',
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (error) {
      throw transportError(error)
    }
    const requestId = res.headers.get('request-id')
    if (!res.ok) throw await httpError(res, requestId)

    let result: StreamResult
    try {
      result = (res.headers.get('content-type') ?? '').includes('application/json')
        ? completionResult(await res.json())
        : await readStream(res)
    } catch (error) {
      throw error instanceof ModelError ? error : transportError(error)
    }
    log.info('featherless completion', {
      schema: request.schemaName,
      requestId,
      finishReason: result.finishReason,
      usage: result.usage,
    })

    const value = firstJsonValue(result.content)
    if (value !== undefined) return value
    const truncated = result.finishReason === 'length'
    throw new ModelError(
      truncated
        ? `Kimi-K3 output for ${request.schemaName} stopped at max_tokens (${request.maxTokens}) before the JSON was complete`
        : `Kimi-K3 output for ${request.schemaName} contains no JSON value`,
      { code: truncated ? 'truncated' : 'no_json', retryable: false },
    )
  }
}

function transportError(error: unknown): ModelError {
  const failure = fetchFailure(error)
  return new ModelError(`Featherless ${failure.message}`, { code: failure.code, retryable: true, cause: error })
}

async function httpError(res: Response, requestId: string | null): Promise<ModelError> {
  const text = await res.text().catch(() => '')
  let code: string | null = null
  let message = text.slice(0, 500) || res.statusText
  try {
    const json = JSON.parse(text) as { error?: { message?: string; code?: string } | string; message?: string }
    if (typeof json.error === 'object' && json.error) {
      code = json.error.code ?? null
      message = json.error.message ?? message
    } else if (typeof json.error === 'string') message = json.error
    else if (json.message) message = json.message
  } catch {
    // the body is not JSON
  }
  const retryable = res.status === 429 || res.status >= 500
  return new ModelError(
    `Featherless HTTP ${res.status}${code ? ` ${code}` : ''}: ${message}${requestId ? ` (request ${requestId})` : ''}`,
    { status: res.status, code: code ?? `http_${res.status}`, retryable },
  )
}

interface CompletionChunk {
  choices?: { delta?: { content?: unknown }; message?: { content?: unknown }; finish_reason?: string | null }[]
  usage?: unknown
  error?: { message?: string; code?: string } | string
}

function completionResult(json: unknown): StreamResult {
  const chunk = json as CompletionChunk
  const choice = chunk.choices?.[0]
  return {
    content: typeof choice?.message?.content === 'string' ? choice.message.content : '',
    finishReason: choice?.finish_reason ?? null,
    usage: chunk.usage ?? null,
  }
}

async function readStream(res: Response): Promise<StreamResult> {
  if (!res.body) throw new ModelError('Featherless returned an empty body', { code: 'empty', retryable: true })
  const result: StreamResult = { content: '', finishReason: null, usage: null }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  let done = false

  const dispatch = () => {
    const payload = data.join('\n')
    data = []
    if (!payload) return
    if (payload === '[DONE]') {
      done = true
      return
    }
    let chunk: CompletionChunk
    try {
      chunk = JSON.parse(payload) as CompletionChunk
    } catch {
      log.warn('featherless sent a stream event that is not JSON', { payload: payload.slice(0, 200) })
      return
    }
    if (chunk.error) {
      const error = typeof chunk.error === 'string' ? { message: chunk.error } : chunk.error
      throw new ModelError(`Featherless stream error${error.code ? ` ${error.code}` : ''}: ${error.message ?? 'unknown'}`, {
        code: error.code ?? 'stream_error',
        retryable: true,
      })
    }
    const choice = chunk.choices?.[0]
    if (typeof choice?.delta?.content === 'string') result.content += choice.delta.content
    if (choice?.finish_reason) result.finishReason = choice.finish_reason
    if (chunk.usage) result.usage = chunk.usage
  }
  const line = (text: string) => {
    if (text === '') dispatch()
    else if (text.startsWith('data:')) data.push(text.slice(5).replace(/^ /, ''))
  }

  try {
    while (!done) {
      const { value, done: ended } = await reader.read()
      if (ended) break
      buffer += decoder.decode(value, { stream: true })
      let index: number
      while (!done && (index = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, index).replace(/\r$/, ''))
        buffer = buffer.slice(index + 1)
      }
    }
    if (!done) {
      buffer += decoder.decode()
      for (const rest of buffer.split('\n')) line(rest.replace(/\r$/, ''))
      dispatch()
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return result
}

const XTML_RESPONSE = /<\|open\|>response<\|sep\|>([\s\S]*?)(?:<\|close\|>response<\|sep\|>|$)/g
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/gi
const FENCE = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g

export function stripReasoning(content: string): string {
  let text = content
  const sections = [...text.matchAll(XTML_RESPONSE)]
  if (sections.length > 0) text = sections[sections.length - 1]![1] ?? ''
  text = text.replace(THINK_BLOCK, '')
  const lastClose = text.toLowerCase().lastIndexOf('</think>')
  if (lastClose !== -1) text = text.slice(lastClose + '</think>'.length)
  return text.replace(/<\|[a-z_]+\|>/g, '').trim()
}

function matchingEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return i
      if (depth < 0) return -1
    }
  }
  return -1
}

function balancedJsonSpans(text: string): string[] {
  const spans: { start: number; end: number }[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{' && text[i] !== '[') continue
    const end = matchingEnd(text, i)
    if (end !== -1) spans.push({ start: i, end })
  }
  spans.sort((a, b) => b.end - a.end || a.start - b.start)
  return spans.map(({ start, end }) => text.slice(start, end + 1))
}

export function firstJsonValue(content: string): unknown {
  const cleaned = stripReasoning(content)
  const fenced = [...cleaned.matchAll(FENCE)].map((match) => (match[1] ?? '').trim()).reverse()
  for (const candidate of [cleaned, ...fenced, ...balancedJsonSpans(cleaned)]) {
    if (!candidate) continue
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // try the next candidate
    }
  }
  return undefined
}
