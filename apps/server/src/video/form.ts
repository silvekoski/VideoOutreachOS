import { t } from '@mergero/shared'
import type { FormAnswers, FormSubmitBody, FormSubmitResult } from '@mergero/shared'
import { nowIso, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import type { DealRow } from '../db/rows.ts'
import { requireDeal, updateDeal } from '../domain/deals.ts'
import { DomainError } from '../domain/errors.ts'
import { markLost, moveStage } from '../domain/stages.ts'
import { log } from '../log.ts'
import type { MgxClient } from '../providers/types.ts'
import { enqueue, jobKeys } from '../queue/index.ts'
import { dealValuation } from './valuation.ts'

const ALREADY_SENT = 'The form was already sent'
const submitting = new Set<number>()

export class MgxSubmitError extends Error {
  constructor(options?: ErrorOptions) {
    super('MGX did not accept the form', options)
    this.name = 'MgxSubmitError'
  }
}

function toAnswers(deal: DealRow, body: FormSubmitBody, now: Date): FormAnswers {
  const questions = new Map(deal.customQuestions.map((question) => [question.id, question.text]))
  const custom = new Map<string, FormAnswers['custom'][number]>()
  for (const { questionId, answer } of body.custom) {
    const question = questions.get(questionId)
    if (question !== undefined && answer !== '') custom.set(questionId, { questionId, question, answer })
  }
  const notInterested = body.timing === 'not_interested'
  return {
    revenue: body.revenue,
    profit: body.profit,
    staff: body.staff,
    timing: body.timing,
    notInterestedReason: notInterested && body.notInterestedReason ? body.notInterestedReason : null,
    custom: [...custom.values()],
    message: body.message || null,
    submittedAt: nowIso(now),
  }
}

function isEmpty(answers: FormAnswers): boolean {
  return (
    answers.revenue === null &&
    answers.profit === null &&
    answers.staff === null &&
    answers.timing === null &&
    answers.custom.length === 0 &&
    answers.message === null
  )
}

export async function submitForm(
  db: Db,
  mgx: Pick<MgxClient, 'submitForm'>,
  dealId: number,
  body: FormSubmitBody,
  now: Date = new Date(),
): Promise<FormSubmitResult> {
  const deal = requireDeal(db, dealId)
  if (deal.formSentAt !== null || submitting.has(dealId)) throw new DomainError(409, ALREADY_SENT)
  const answers = toAnswers(deal, body, now)
  if (isEmpty(answers)) throw new DomainError(400, 'The form has no answers')
  const valuation = dealValuation(deal, answers.profit)
  submitting.add(dealId)
  try {
    return await sendAndStore(db, mgx, dealId, answers, valuation, now)
  } finally {
    submitting.delete(dealId)
  }
}

async function sendAndStore(
  db: Db,
  mgx: Pick<MgxClient, 'submitForm'>,
  dealId: number,
  answers: FormAnswers,
  valuation: FormSubmitResult['valuation'],
  now: Date,
): Promise<FormSubmitResult> {
  let receiptId: string
  try {
    receiptId = (await mgx.submitForm({ dealId, values: { ...answers, valuation } })).receiptId
  } catch (error) {
    log.error('MGX did not accept the form, nothing is stored', { dealId, error })
    throw new MgxSubmitError({ cause: error })
  }
  transaction(db, () => {
    if (requireDeal(db, dealId).formSentAt !== null) {
      log.warn('a parallel form was stored first, MGX has one more receipt', { dealId, receiptId })
      throw new DomainError(409, ALREADY_SENT)
    }
    updateDeal(db, dealId, { form: answers, formSentAt: answers.submittedAt, valuation, mgxReceiptId: receiptId }, now)
    moveStage(db, dealId, 'form_sent', { data: { receiptId }, now })
    enqueue(db, 'pipedrive-write', jobKeys.pipedriveWrite(dealId, 'fields', receiptId), { dealId, op: 'fields' }, { now })
    if (answers.timing === 'not_interested') {
      markLost(db, dealId, answers.notInterestedReason ?? t('en').timing.not_interested, now)
    }
  })
  log.info('form stored', { dealId, receiptId, notInterested: answers.timing === 'not_interested' })
  return { ok: true, valuation }
}
