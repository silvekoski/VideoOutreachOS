import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, Ref } from 'react'
import type { FormSubmitBody, SaleTiming, StaffRange, VideoPageData } from '@mergero/shared'
import { PROFIT_RANGES, REVENUE_RANGES, fill, formatEur } from '@mergero/shared/i18n/base'
import type { PageStrings, Strings } from '@mergero/shared/i18n/base'
import { CircleAlert, CircleCheck, Send } from 'lucide-react'
import { isConflict, pageUrl, requestJson } from './api.ts'
import { useRecorder } from './recorder-context.ts'
import type { ValuationRange } from '@mergero/shared/valuation'
import { calculatorRange, isInvalidAmount, parseAmount, rangeText, toAmount } from './valuation.ts'
import type { AmountDraft, RangeOption } from './valuation.ts'

const CALCULATOR_SETTLE_MS = 1500
const MAX_TEXT = 2000
const EMPTY_AMOUNT: AmountDraft = { kind: 'range', range: '', exact: '' }

type SendStatus = 'idle' | 'sending' | 'sent' | 'alreadySent' | 'error'

const fieldClass =
  'mt-1.5 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-text shadow-xs disabled:bg-surface disabled:text-muted aria-invalid:border-danger'
const labelClass = 'block text-sm font-medium text-ink'
const legendClass = 'text-sm font-semibold text-ink'

export function AmountFieldset<V extends string>({
  name,
  legend,
  options,
  labels,
  value,
  locale,
  strings,
  onChange,
}: {
  name: string
  legend: string
  options: readonly (RangeOption & { value: V })[]
  labels: Record<V, string>
  value: AmountDraft
  locale: string
  strings: PageStrings
  onChange: (next: AmountDraft) => void
}) {
  const id = useId()
  const exact = value.exact.trim() === '' ? null : parseAmount(value.exact)
  const invalid = isInvalidAmount(value)
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend id={`${id}-legend`} className={legendClass}>
        {legend}
      </legend>
      <div
        role="radiogroup"
        aria-label={fill(strings.amountKind, { field: legend })}
        className="inline-flex rounded-lg bg-white p-1 ring-1 ring-line"
      >
        {(['range', 'exact'] as const).map((kind) => (
          <label key={kind} className="relative">
            <input
              type="radio"
              name={`${name}-kind`}
              value={kind}
              checked={value.kind === kind}
              data-field={`${name}-kind`}
              onChange={() => onChange({ ...value, kind })}
              className="peer sr-only"
            />
            <span className="block cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-disabled:cursor-default">
              {kind === 'range' ? strings.rangeChoice : strings.exactChoice}
            </span>
          </label>
        ))}
      </div>
      {value.kind === 'range' ? (
        <div>
          <label htmlFor={`${id}-range`} className="sr-only">
            {legend}
          </label>
          <select
            id={`${id}-range`}
            value={value.range}
            data-field={`${name}-range`}
            onChange={(event) => onChange({ ...value, range: event.target.value })}
            className={fieldClass}
          >
            <option value="">{strings.chooseRange}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {labels[option.value]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label id={`${id}-exact-label`} htmlFor={`${id}-exact`} className={labelClass}>
            {strings.exactValue}
          </label>
          <input
            id={`${id}-exact`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={24}
            value={value.exact}
            aria-labelledby={`${id}-legend ${id}-exact-label`}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-exact-error` : exact === null ? undefined : `${id}-exact-value`}
            data-field={`${name}-exact`}
            onChange={(event) => onChange({ ...value, exact: event.target.value.replace(/[^\d\s.,'’]/gu, '') })}
            className={fieldClass}
          />
          {exact !== null && (
            <p id={`${id}-exact-value`} className="mt-1 text-sm text-muted">
              {formatEur(exact, locale)}
            </p>
          )}
          <div aria-live="polite">
            {invalid && (
              <p id={`${id}-exact-error`} className="mt-1 flex items-start gap-1.5 text-sm font-medium text-danger">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {strings.exactInvalid}
              </p>
            )}
          </div>
        </div>
      )}
    </fieldset>
  )
}

export function FormStatus({
  status,
  page,
  ref,
}: {
  status: SendStatus
  page: PageStrings
  ref?: Ref<HTMLParagraphElement>
}) {
  const text = { idle: '', sending: page.sending, sent: page.sent, alreadySent: page.alreadySent, error: page.submitError }[status]
  return (
    <p
      ref={ref}
      tabIndex={-1}
      aria-live="polite"
      className={`mt-3 flex items-start gap-2 text-sm font-medium ${status === 'error' ? 'text-danger' : 'text-ink'}`}
    >
      {status === 'sent' && <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />}
      {(status === 'error' || status === 'alreadySent') && <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      {text}
    </p>
  )
}

function CalculatorPanel({
  strings,
  text,
  result,
}: {
  strings: PageStrings
  text: string | null
  result: ValuationRange | null
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-xl bg-white p-4 ring-1 ring-line">
      <h3 id={id} className="font-semibold text-ink">
        {strings.calculatorHeading}
      </h3>
      <p className="mt-1 text-sm text-muted">{strings.calculatorIntro}</p>
      <output aria-live="polite" className="mt-3 block">
        {result?.available && text !== null ? (
          <>
            <span className="block text-sm text-muted">{strings.calculatorResultLabel}</span>
            <span className="block text-2xl font-semibold tracking-tight text-ink">{text}</span>
          </>
        ) : (
          text !== null && <span className="block text-sm font-medium text-ink">{text}</span>
        )}
      </output>
    </section>
  )
}

export function CompanyForm({ data, strings }: { data: VideoPageData; strings: Strings }) {
  const page = strings.page
  const recorder = useRecorder()
  const headingId = useId()
  const statusRef = useRef<HTMLParagraphElement>(null)
  const lastCalculation = useRef<string | null>(null)
  const [revenue, setRevenue] = useState(EMPTY_AMOUNT)
  const [profit, setProfit] = useState(EMPTY_AMOUNT)
  const [staff, setStaff] = useState<StaffRange | ''>('')
  const [timing, setTiming] = useState<SaleTiming | ''>('')
  const [reason, setReason] = useState('')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<SendStatus>('idle')

  const profitAmount = toAmount(profit, PROFIT_RANGES)
  const calculation = calculatorRange(data, profitAmount)
  const calculatorText =
    data.calculator === null
      ? page.calculatorNoRange
      : calculation === null
        ? null
        : calculation.available
          ? rangeText(
              calculation,
              { result: page.calculatorResult, over: strings.format.over, under: strings.format.under },
              strings.locale,
            )
          : page.calculatorNeedsProfit
  const calculationKey = calculation === null ? null : `${calculation.available}:${calculation.low}:${calculation.high}`
  const calculationAvailable = calculation?.available ?? false

  useEffect(() => {
    if (calculationKey === null || calculationKey === lastCalculation.current) return
    const timer = window.setTimeout(() => {
      lastCalculation.current = calculationKey
      recorder.record('calculator_result', { data: { available: calculationAvailable } })
    }, CALCULATOR_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [calculationKey, calculationAvailable, recorder])

  useEffect(() => {
    if (status !== 'idle' && status !== 'sending') statusRef.current?.focus()
  }, [status])

  const body: FormSubmitBody = {
    revenue: toAmount(revenue, REVENUE_RANGES),
    profit: profitAmount,
    staff: staff === '' ? null : staff,
    timing: timing === '' ? null : timing,
    notInterestedReason: timing === 'not_interested' && reason.trim() !== '' ? reason.trim() : null,
    custom: data.customQuestions.flatMap((question) => {
      const answer = (custom[question.id] ?? '').trim()
      return answer === '' ? [] : [{ questionId: question.id, answer }]
    }),
    message: message.trim() === '' ? null : message.trim(),
  }
  const empty =
    body.revenue === null &&
    body.profit === null &&
    body.staff === null &&
    body.timing === null &&
    body.custom.length === 0 &&
    body.message === null
  const invalid = isInvalidAmount(revenue) || isInvalidAmount(profit)
  const blocked = empty || invalid || data.preview
  const locked = status === 'sending' || status === 'sent' || status === 'alreadySent'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (blocked || locked) return
    setStatus('sending')
    try {
      await requestJson(pageUrl(data.code, 'form', data.preview), { method: 'POST', body })
      setStatus('sent')
    } catch (error) {
      setStatus(isConflict(error) ? 'alreadySent' : 'error')
    }
  }

  return (
    <section aria-labelledby={headingId} data-region="form" className="rounded-2xl bg-surface p-5 sm:p-6">
      <h2 id={headingId} className="text-xl font-semibold tracking-tight text-ink">
        {page.formHeading}
      </h2>
      {data.formSent ? (
        <p role="status" className="mt-3 flex items-start gap-2 text-ink">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          {page.sent}
        </p>
      ) : (
        <form onSubmit={submit} data-private className="mt-2">
          <p className="text-sm text-muted">{page.formIntro}</p>
          <fieldset disabled={locked} className="mt-5 min-w-0 space-y-6">
            <AmountFieldset
              name="revenue"
              legend={page.revenue}
              options={REVENUE_RANGES}
              labels={page.revenueRanges}
              value={revenue}
              locale={strings.locale}
              strings={page}
              onChange={setRevenue}
            />
            <AmountFieldset
              name="profit"
              legend={page.profit}
              options={PROFIT_RANGES}
              labels={page.profitRanges}
              value={profit}
              locale={strings.locale}
              strings={page}
              onChange={setProfit}
            />
            {data.calculatorEnabled && <CalculatorPanel strings={page} text={calculatorText} result={calculation} />}
            <div>
              <label htmlFor={`${headingId}-staff`} className={labelClass}>
                {page.staff}
              </label>
              <select
                id={`${headingId}-staff`}
                value={staff}
                data-field="staff"
                onChange={(event) => setStaff(event.target.value as StaffRange | '')}
                className={fieldClass}
              >
                <option value="">{page.chooseRange}</option>
                {(Object.keys(strings.staff) as StaffRange[]).map((range) => (
                  <option key={range} value={range}>
                    {strings.staff[range]}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="min-w-0 space-y-2">
              <legend className={legendClass}>{page.timingQuestion}</legend>
              {(Object.keys(strings.timing) as SaleTiming[]).map((option) => (
                <label key={option} className="flex cursor-pointer items-center gap-3 text-sm text-text">
                  <input
                    type="radio"
                    name="timing"
                    value={option}
                    checked={timing === option}
                    data-field="timing"
                    onChange={() => setTiming(option)}
                    className="size-4 accent-brand"
                  />
                  {strings.timing[option]}
                </label>
              ))}
              {timing === 'not_interested' && (
                <div className="pt-2">
                  <label htmlFor={`${headingId}-reason`} className={labelClass}>
                    {page.notInterestedReason}
                  </label>
                  <textarea
                    id={`${headingId}-reason`}
                    rows={3}
                    maxLength={MAX_TEXT}
                    value={reason}
                    data-field="not-interested-reason"
                    onChange={(event) => setReason(event.target.value)}
                    className={fieldClass}
                  />
                </div>
              )}
            </fieldset>
            {data.customQuestions.length > 0 && (
              <fieldset className="min-w-0 space-y-4">
                <legend className={legendClass}>{page.customHeading}</legend>
                {data.customQuestions.map((question) => (
                  <div key={question.id}>
                    <label htmlFor={`${headingId}-custom-${question.id}`} className={labelClass}>
                      {question.text}
                    </label>
                    <textarea
                      id={`${headingId}-custom-${question.id}`}
                      rows={2}
                      maxLength={MAX_TEXT}
                      value={custom[question.id] ?? ''}
                      data-field={`custom-${question.id}`}
                      onChange={(event) => setCustom((current) => ({ ...current, [question.id]: event.target.value }))}
                      className={fieldClass}
                    />
                  </div>
                ))}
              </fieldset>
            )}
            <div>
              <label htmlFor={`${headingId}-message`} className={labelClass}>
                {page.message}
              </label>
              <textarea
                id={`${headingId}-message`}
                rows={3}
                maxLength={MAX_TEXT}
                value={message}
                data-field="message"
                onChange={(event) => setMessage(event.target.value)}
                className={fieldClass}
              />
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={blocked || locked}
            aria-describedby={data.preview ? `${headingId}-preview` : undefined}
            data-track="form-submit"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Send className="size-4" aria-hidden="true" />
            {status === 'sending' ? page.sending : page.submit}
          </button>
          {data.preview && (
            <p id={`${headingId}-preview`} className="mt-3 text-sm font-medium text-ink">
              {page.previewNote}
            </p>
          )}
          <p className="mt-3 text-sm text-muted">{page.privacyNote}</p>
          <FormStatus ref={statusRef} status={status} page={page} />
        </form>
      )}
    </section>
  )
}
