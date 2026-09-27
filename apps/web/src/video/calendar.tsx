import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { BookBody, BookResult, SlotDto, VideoPageData } from '@mergero/shared'
import { fill } from '@mergero/shared/i18n/base'
import type { PageStrings } from '@mergero/shared/i18n/base'
import { CalendarDays, CircleAlert, CircleCheck } from 'lucide-react'
import { HttpError, bookedMeetingAt, isConflict, pageUrl, requestJson } from './api.ts'
import { isEmail } from './email.ts'
import { formatMeeting, groupSlotsByDay, viewerTimeZone } from './slots.ts'
import type { SlotDay } from './slots.ts'

type Status = 'idle' | 'booking' | 'taken' | 'error'

interface CalendarProps {
  data: VideoPageData
  strings: PageStrings
  locale: string
}

export function Calendar({ data, strings, locale }: CalendarProps) {
  const id = useId()
  const confirmationRef = useRef<HTMLParagraphElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const focusNotice = useRef(false)
  const [days, setDays] = useState<SlotDay[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [start, setStart] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [emailRejected, setEmailRejected] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [meetingAt, setMeetingAt] = useState(data.meetingAt)
  const [bookedElsewhere, setBookedElsewhere] = useState(false)

  useEffect(() => {
    if (meetingAt !== null) return
    const controller = new AbortController()
    requestJson<SlotDto[]>(pageUrl(data.code, 'slots'), { signal: controller.signal })
      .then((slots) => {
        setDays(groupSlotsByDay(slots, locale))
        setLoadFailed(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true)
      })
    return () => controller.abort()
  }, [data.code, locale, meetingAt, reload])

  useEffect(() => {
    if (meetingAt !== null && focusNotice.current) confirmationRef.current?.focus()
  }, [meetingAt])

  const address = email.trim()
  const emailInvalid =
    (emailTouched && address !== '' && !isEmail(address)) || (emailRejected !== null && emailRejected === address)

  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (start === null || status === 'booking' || data.preview) return
    if (address !== '' && !isEmail(address)) {
      setEmailTouched(true)
      emailRef.current?.focus()
      return
    }
    setStatus('booking')
    const body: BookBody = { start, email: address === '' ? null : address }
    try {
      const result = await requestJson<BookResult>(pageUrl(data.code, 'book', data.preview), { method: 'POST', body })
      focusNotice.current = true
      setMeetingAt(result.meetingAt)
    } catch (error) {
      const existing = bookedMeetingAt(error)
      if (existing !== null) {
        focusNotice.current = true
        setBookedElsewhere(true)
        setMeetingAt(existing)
      } else if (isConflict(error)) {
        setStatus('taken')
        setStart(null)
        setReload((count) => count + 1)
      } else if (error instanceof HttpError && error.status === 400 && address !== '') {
        setStatus('idle')
        setEmailRejected(address)
        emailRef.current?.focus()
      } else {
        setStatus('error')
      }
    }
  }

  const activeDay = days?.find((day) => day.key === dayKey) ?? days?.[0] ?? null
  const statusText =
    status === 'booking'
      ? strings.booking
      : status === 'taken'
        ? strings.slotTaken
        : status === 'error'
          ? strings.bookError
          : ''

  return (
    <section
      aria-labelledby={id}
      data-region="calendar"
      className="rounded-2xl border border-line bg-white p-5 motion-safe:animate-reveal sm:p-6"
    >
      <h2 id={id} className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink">
        <CalendarDays className="size-5 text-brand" aria-hidden="true" />
        {strings.calendarHeading}
      </h2>
      <p className="mt-2 text-muted">{strings.calendarLine}</p>
      {meetingAt !== null ? (
        <p
          ref={confirmationRef}
          role="status"
          tabIndex={-1}
          className="mt-4 flex items-start gap-2 rounded-lg bg-surface p-4 font-medium text-ink"
        >
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          {fill(bookedElsewhere ? strings.alreadyBooked : strings.booked, {
            date: formatMeeting(meetingAt, locale),
            analyst: data.analystName,
          })}
        </p>
      ) : loadFailed || days?.length === 0 ? (
        <p className="mt-4 text-ink">{strings.noSlots}</p>
      ) : (
        <form onSubmit={book} className="mt-4" aria-busy={days === null}>
          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold text-ink">{strings.chooseTime}</legend>
            <p className="mt-0.5 text-sm text-muted">{fill(strings.timeZone, { zone: viewerTimeZone() })}</p>
            {days === null || activeDay === null ? (
              <div aria-hidden="true" className="mt-3 h-28 rounded-lg bg-surface motion-safe:animate-pulse" />
            ) : (
              <>
                <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-2">
                  {days.map((day) => (
                    <button
                      key={day.key}
                      type="button"
                      aria-pressed={day.key === activeDay.key}
                      data-track="slot-day"
                      onClick={() => {
                        setDayKey(day.key)
                        setStart(null)
                      }}
                      className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-medium whitespace-nowrap text-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
                    >
                      {day.short}
                    </button>
                  ))}
                </div>
                <fieldset className="mt-2 min-w-0">
                  <legend className="sr-only">{activeDay.label}</legend>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {activeDay.slots.map((slot) => (
                      <label key={slot.start} data-track="slot-time" className="relative">
                        <input
                          type="radio"
                          name={`${id}-slot`}
                          value={slot.start}
                          checked={start === slot.start}
                          onChange={() => {
                            setStart(slot.start)
                            if (status === 'taken' || status === 'error') setStatus('idle')
                          }}
                          className="peer sr-only"
                        />
                        <span className="block cursor-pointer rounded-lg border border-line py-2 text-center text-sm font-medium text-ink tabular-nums peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                          {slot.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
          </fieldset>
          <label htmlFor={`${id}-email`} className="mt-5 block text-sm font-medium text-ink">
            {strings.email}
          </label>
          <input
            ref={emailRef}
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={email}
            aria-invalid={emailInvalid || undefined}
            aria-describedby={emailInvalid ? `${id}-email-error` : undefined}
            data-field="booking-email"
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmailTouched(true)}
            className="mt-1.5 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-text aria-invalid:border-danger"
          />
          <div aria-live="polite">
            {emailInvalid && (
              <p id={`${id}-email-error`} className="mt-1 flex items-start gap-1.5 text-sm font-medium text-danger">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {strings.emailInvalid}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={start === null || status === 'booking' || data.preview}
            aria-describedby={data.preview ? `${id}-preview` : undefined}
            data-track="book"
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {status === 'booking' ? strings.booking : strings.book}
          </button>
          {data.preview && (
            <p id={`${id}-preview`} className="mt-3 text-sm font-medium text-ink">
              {strings.previewNote}
            </p>
          )}
          <p
            aria-live="polite"
            className={`mt-3 flex items-start gap-2 text-sm font-medium ${status === 'taken' || status === 'error' ? 'text-danger' : 'text-ink'}`}
          >
            {(status === 'taken' || status === 'error') && (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            {statusText}
          </p>
        </form>
      )}
    </section>
  )
}
