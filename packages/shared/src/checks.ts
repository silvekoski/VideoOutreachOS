import { detectLanguage } from './languages.ts'
import { MIN_COMPANY_LINES, SLOT_LIMITS, textLength } from './slots.ts'
import { OUTREACH_LINK, OUTREACH_WORDS } from './types.ts'
import type { Lang, OutreachContext } from './types.ts'
import { countWords } from './words.ts'

export { countWords }

export interface CheckResult {
  ok: boolean
  errors: string[]
}

const GROUP_SEPARATORS = " .,'\u00A0\u202F\u2009\u2019"
const DIGIT_GROUP = new RegExp(`(?:\\d{1,3}(?:[${GROUP_SEPARATORS}]\\d{3}(?!\\d))+|\\d+)(?:[.,]\\d+)?`, 'gu')

function groupsOf(text: string, into: Set<string>): Set<string> {
  for (const match of text.matchAll(DIGIT_GROUP)) {
    into.add(match[0].replace(/\D/gu, '').replace(/^0+(?=\d)/u, ''))
  }
  return into
}

export function digitGroups(value: unknown): Set<string> {
  const groups = new Set<string>()
  const walk = (node: unknown): void => {
    if (typeof node === 'string') groupsOf(node, groups)
    else if (typeof node === 'number') {
      if (Number.isFinite(node)) groupsOf(String(node), groups)
    } else if (Array.isArray(node)) node.forEach(walk)
    else if (node !== null && typeof node === 'object') Object.values(node).forEach(walk)
  }
  walk(value)
  return groups
}

export function unknownNumbers(output: string, input: unknown): string[] {
  const known = digitGroups(input)
  return [...groupsOf(output, new Set())].filter((group) => !known.has(group))
}

function checkLanguage(text: string, lang: Lang, errors: string[]): void {
  const detected = detectLanguage(text)
  if (detected !== lang) errors.push(`language ${detected ?? 'unknown'}, expected ${lang}`)
}

function checkNumbers(text: string, input: unknown, errors: string[]): void {
  const unknown = unknownNumbers(text, input)
  if (unknown.length > 0) errors.push(`numbers not in the input: ${unknown.join(', ')}`)
}

function result(errors: string[]): CheckResult {
  return { ok: errors.length === 0, errors }
}

export function checkScript(script: string, lang: Lang, input: unknown): CheckResult {
  if (typeof script !== 'string' || script.trim() === '') return result(['script is empty'])
  const errors: string[] = []
  const words = countWords(script)
  if (words < 30 || words > 60) errors.push(`script has ${words} words, expected 30 to 60`)
  checkLanguage(script, lang, errors)
  checkNumbers(script, input, errors)
  return result(errors)
}

export function checkLines(lines: unknown, lang: Lang, input: unknown): CheckResult {
  if (!Array.isArray(lines) || lines.length < MIN_COMPANY_LINES || lines.length > 3) {
    return result([`expected an array of ${MIN_COMPANY_LINES} to 3 lines`])
  }
  const errors: string[] = []
  const max = SLOT_LIMITS['your-company.line'] ?? 90
  lines.forEach((line: unknown, index) => {
    if (typeof line !== 'string' || line.trim() === '') errors.push(`line ${index + 1} is empty`)
    else if (textLength(line) > max) errors.push(`line ${index + 1} has ${textLength(line)} of ${max} characters`)
  })
  if (errors.length > 0) return result(errors)
  const text = (lines as string[]).join(' ')
  checkLanguage(text, lang, errors)
  checkNumbers(text, input, errors)
  return result(errors)
}

export interface TranslationSource {
  id: string
  text: string
  max: number
}

export function checkTranslations(
  texts: readonly { id: string; text: string }[],
  lang: Lang,
  sources: readonly TranslationSource[],
): CheckResult {
  if (!Array.isArray(texts) || texts.length !== sources.length) return result([`expected ${sources.length} texts`])
  const errors: string[] = []
  const changed: string[] = []
  sources.forEach((source, index) => {
    const item = texts[index]
    if (item?.id !== source.id) {
      errors.push(`text ${index + 1} has the id ${String(item?.id)}, expected ${source.id}`)
      return
    }
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (text === '') {
      errors.push(`text ${source.id} is empty`)
      return
    }
    if (textLength(text) > source.max) errors.push(`text ${source.id} has ${textLength(text)} of ${source.max} characters`)
    const unknown = unknownNumbers(text, source.text)
    if (unknown.length > 0) errors.push(`text ${source.id} has numbers that are not in its source: ${unknown.join(', ')}`)
    if (text !== source.text.trim()) changed.push(text)
  })
  if (errors.length === 0 && changed.length > 0) checkLanguage(changed.join(' '), lang, errors)
  return result(errors)
}

export function checkBriefText(
  output: { summary: string; questions: string[] },
  lang: Lang,
  input: unknown,
): CheckResult {
  const errors: string[] = []
  const summary = typeof output?.summary === 'string' ? output.summary : ''
  const questions = Array.isArray(output?.questions) ? output.questions : []
  const words = countWords(summary)
  if (words < 1 || words > 60) errors.push(`summary has ${words} words, expected 1 to 60`)
  if (questions.length < 3 || questions.length > 5) errors.push(`${questions.length} questions, expected 3 to 5`)
  questions.forEach((question: unknown, index) => {
    if (typeof question !== 'string' || question.trim() === '') errors.push(`question ${index + 1} is empty`)
  })
  if (errors.length > 0) return result(errors)
  const text = [summary, ...questions].join(' ')
  checkLanguage(text, lang, errors)
  checkNumbers(text, input, errors)
  return result(errors)
}

const DASH_PAUSE = /[\u2013\u2014]| - /u

export function checkOutreach(output: { subject: string; message: string }, context: OutreachContext): CheckResult {
  const errors: string[] = []
  const subject = typeof output?.subject === 'string' ? output.subject.trim() : ''
  const message = typeof output?.message === 'string' ? output.message : ''
  const links = message.split(OUTREACH_LINK).length - 1
  if (links !== 1) errors.push(`message has ${links} ${OUTREACH_LINK} placeholders, expected 1`)
  if (/https?:|www\./iu.test(message)) errors.push(`message has a URL, use only the ${OUTREACH_LINK} placeholder`)
  const text = message.replaceAll(OUTREACH_LINK, ' ')
  const words = countWords(text)
  const { min, max } = OUTREACH_WORDS[context.channel]
  if (words < min || words > max) errors.push(`message has ${words} words, expected ${min} to ${max}`)
  if (context.channel === 'email' && (subject === '' || subject.length > 80)) errors.push(`subject has ${subject.length} characters, expected 1 to 80`)
  if (DASH_PAUSE.test(`${subject}\n${text}`.replaceAll(context.company, ' '))) {
    errors.push('text has a dash (\u2013, \u2014 or " - "), use a comma, a period or parentheses')
  }
  if (errors.length > 0) return result(errors)
  const all = `${subject} ${text}`
  checkLanguage(all, context.lang, errors)
  checkNumbers(all, context, errors)
  return result(errors)
}
