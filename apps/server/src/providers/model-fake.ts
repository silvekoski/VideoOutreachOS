import {
  fallbackBriefText,
  fallbackLines,
  fallbackOutreach,
  fallbackScript,
  isLang,
  type Lang,
  type MeetingBrief,
  type OutreachContext,
  type ScriptContext,
} from '@mergero/shared'
import { z } from 'zod'
import { ModelError } from './featherless.ts'
import type { ChatJsonRequest, LanguageModelClient } from './types.ts'

const lang = z.custom<Lang>(isLang, 'unsupported language')
const record = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)

const requestSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('slide-script'),
    slide: z.literal([2, 3, 4, 5, 6, 7, 8]),
    context: z.custom<ScriptContext>((value) => record(value) && isLang((value as { lang?: unknown }).lang), 'context.lang is missing'),
  }),
  z.object({ task: z.literal('company-lines'), lang, company: z.string(), text: z.string() }),
  z.object({
    task: z.literal('translate-texts'),
    lang,
    texts: z.array(z.object({ id: z.string(), text: z.string(), max: z.number() })),
  }),
  z.object({
    task: z.literal('brief-text'),
    lang,
    brief: z.custom<Omit<MeetingBrief, 'questions'>>(record, 'brief must be an object'),
  }),
  z.object({
    task: z.literal('outreach'),
    context: z.custom<OutreachContext>((value) => record(value) && isLang((value as { lang?: unknown }).lang), 'context.lang is missing'),
  }),
])

export class FakeModel implements LanguageModelClient {
  readonly mode = 'fake' as const

  async completeJson(request: ChatJsonRequest): Promise<unknown> {
    let json: unknown
    try {
      json = JSON.parse(request.user)
    } catch {
      throw invalid(request.schemaName, 'request.user is not JSON')
    }
    const parsed = requestSchema.safeParse(json)
    if (!parsed.success) throw invalid(request.schemaName, z.prettifyError(parsed.error))
    const input = parsed.data
    switch (input.task) {
      case 'slide-script':
        return { script: fallbackScript(input.slide, input.context) }
      case 'company-lines':
        return { lines: fallbackLines(input.text, input.lang, input.company) }
      case 'translate-texts':
        return { texts: input.texts.map(({ id, text }) => ({ id, text })) }
      case 'brief-text':
        return fallbackBriefText({ lang: input.lang, brief: input.brief })
      case 'outreach':
        return fallbackOutreach(input.context)
    }
  }
}

function invalid(schemaName: string, detail: string): ModelError {
  return new ModelError(`Fake model cannot answer ${schemaName}: ${detail}`, {
    provider: 'fake-model',
    code: 'bad_request',
    retryable: false,
  })
}
