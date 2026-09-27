import type { CheckResult } from '@mergero/shared'
import type { z } from 'zod'
import { log } from '../log.ts'
import { ModelError } from '../providers/featherless.ts'
import type { ChatJsonRequest, LanguageModelClient } from '../providers/types.ts'
import { MODEL_MAX_TOKENS, rejectionNote } from './prompts.ts'

const ATTEMPTS = 2
const REJECTED_CODES = new Set(['no_json', 'truncated'])

export type ModelAnswer<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export interface ModelQuestion<T> {
  system: string
  input: unknown
  schemaName: string
  jsonSchema: Record<string, unknown>
  schema: z.ZodType<T>
  check: (value: T) => CheckResult
}

export async function askModel<T>(model: LanguageModelClient, question: ModelQuestion<T>, fields: Record<string, unknown> = {}): Promise<ModelAnswer<T>> {
  const request: ChatJsonRequest = {
    system: question.system,
    user: JSON.stringify(question.input),
    schemaName: question.schemaName,
    schema: question.jsonSchema,
    maxTokens: MODEL_MAX_TOKENS,
  }
  let errors: string[] = []
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const system = attempt === 1 ? question.system : `${question.system}\n\n${rejectionNote(errors)}`
    let output: unknown
    try {
      output = await model.completeJson({ ...request, system })
    } catch (error) {
      if (!(error instanceof ModelError && REJECTED_CODES.has(error.code ?? ''))) throw error
      output = undefined
      errors = [error.message]
    }
    if (output !== undefined) {
      const parsed = question.schema.safeParse(output)
      errors = parsed.success
        ? question.check(parsed.data).errors
        : parsed.error.issues.map((issue) => `${issue.path.join('.') || 'output'}: ${issue.message}`)
      if (parsed.success && errors.length === 0) return { ok: true, value: parsed.data }
    }
    log.warn('model output rejected', { schema: question.schemaName, attempt, errors, ...fields })
  }
  return { ok: false, errors }
}
