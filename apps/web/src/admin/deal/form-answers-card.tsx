import type { FormAnswers, ValuationResult } from '@mergero/shared'
import { formatAmount } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import { formatZonedDateTime } from '../lib/format'
import { DealCard } from './deal-card'

const en = t('en')

function amountType(amount: FormAnswers['revenue']): string {
  if (!amount) return ''
  return amount.kind === 'exact' ? ' (exact)' : ' (range)'
}

function valuationText(valuation: ValuationResult | null): string {
  if (!valuation) return 'The owner did not use the calculator.'
  if (valuation.available) {
    const range = formatAmount({ kind: 'range', min: valuation.low, max: valuation.high }, 'en')
    const multiples =
      valuation.p25 !== null && valuation.p75 !== null
        ? `, profit multiples ${valuation.p25.toFixed(1)} to ${valuation.p75.toFixed(1)}`
        : ''
    return `${range}. From ${valuation.dealCount} closed deals in NACE ${valuation.nace2 ?? 'unknown'}${multiples}.`
  }
  return valuation.dealCount < 3
    ? 'No range: MGX has fewer than 3 closed deals with this NACE code. Mergero gives a range after the meeting.'
    : 'No range: the profit is 0 or less.'
}

export function FormAnswersCard({
  form,
  valuation,
  timeZone,
}: {
  form: FormAnswers
  valuation: ValuationResult | null
  timeZone: string
}) {
  const answers: [string, string | null][] = [
    ['Revenue', form.revenue ? `${formatAmount(form.revenue, 'en')}${amountType(form.revenue)}` : null],
    ['Operating profit', form.profit ? `${formatAmount(form.profit, 'en')}${amountType(form.profit)}` : null],
    ['Value range', valuationText(valuation)],
    ['Staff', form.staff ? en.staff[form.staff] : null],
    ['Sale timing', form.timing ? en.timing[form.timing] : null],
    ['Reason for no interest', form.notInterestedReason],
    ['Message', form.message],
  ]
  return (
    <DealCard id="form-answers" title="Form answers" description={`Sent ${formatZonedDateTime(form.submittedAt, timeZone)}`}>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[11rem_1fr]">
        {answers.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className={value ? 'whitespace-pre-wrap' : 'text-muted-foreground'}>{value ?? 'No answer'}</dd>
          </div>
        ))}
        {form.custom.map((item) => (
          <div key={item.questionId} className="contents">
            <dt className="text-muted-foreground">{item.question}</dt>
            <dd className="whitespace-pre-wrap">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </DealCard>
  )
}
