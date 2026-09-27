import { useId, useState } from 'react'
import type { CustomQuestion, Lang, ReviewDto, ReviewPatch } from '@mergero/shared'
import { LANGUAGES } from '@mergero/shared'
import { ChevronDown, Plus, Trash } from 'lucide-react'
import { useAutosave } from '@/hooks/use-autosave'
import type { SaveStatus } from '@/hooks/use-autosave'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePatchReview } from '../api'
import { languageName } from '../lib/brief'
import { createId, isValidExpiryDays } from '../lib/review'
import { PUBLISHED_STATUSES } from '../lib/status'
import { SaveStatusText } from './save-status'

const MUTATION_SAVE_STATUS = { idle: 'idle', pending: 'saving', success: 'saved', error: 'error' } as const satisfies Record<
  ReturnType<typeof usePatchReview>['status'],
  SaveStatus
>

function sameQuestions(a: CustomQuestion[], b: CustomQuestion[]): boolean {
  return a.length === b.length && a.every((question, index) => question.id === b[index]?.id && question.text === b[index]?.text)
}

function QuestionsEditor({
  questions,
  lang,
  save,
}: {
  questions: CustomQuestion[]
  lang: Lang
  save: (patch: ReviewPatch) => Promise<unknown>
}) {
  const baseId = useId()
  const autosave = useAutosave(
    questions,
    (next) =>
      save({
        customQuestions: next
          .map((question) => ({ id: question.id, text: question.text.trim() }))
          .filter((question) => question.text !== ''),
      }),
    { delayMs: 1500, equals: sameQuestions },
  )
  const draft = autosave.draft
  const update = (next: CustomQuestion[]) => autosave.change(next)

  return (
    <fieldset className="grid gap-2">
      <legend className="flex w-full items-center justify-between gap-2 text-sm font-medium">
        <span>Custom form questions</span>
        <SaveStatusText status={autosave.status} error={autosave.error} />
      </legend>
      <p className="text-xs text-muted-foreground">The form on the video page shows these questions. Write them in the page language.</p>
      {draft.length === 0 ? <p className="text-sm text-muted-foreground">No custom questions.</p> : null}
      <ol className="grid gap-2">
        {draft.map((question, index) => {
          const id = `${baseId}-${question.id}`
          return (
            <li key={question.id} className="flex items-end gap-2">
              <div className="grid flex-1 gap-1">
                <Label htmlFor={id} className="text-xs">{`Question ${index + 1}`}</Label>
                <Input
                  id={id}
                  lang={lang}
                  value={question.text}
                  onChange={(event) =>
                    update(draft.map((item) => (item.id === question.id ? { ...item, text: event.target.value } : item)))
                  }
                  onBlur={autosave.flush}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove question ${index + 1}`}
                onClick={() => {
                  update(draft.filter((item) => item.id !== question.id))
                  autosave.flush()
                }}
              >
                <Trash aria-hidden="true" />
              </Button>
            </li>
          )
        })}
      </ol>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => update([...draft, { id: createId(), text: '' }])}>
          <Plus aria-hidden="true" />
          Add a question
        </Button>
      </div>
    </fieldset>
  )
}

interface MoreSectionProps {
  review: ReviewDto
  save: (patch: ReviewPatch) => Promise<unknown>
}

export function MoreSection({ review, save }: MoreSectionProps) {
  const [expiry, setExpiry] = useState(String(review.expiryDays))
  const [savedExpiry, setSavedExpiry] = useState(review.expiryDays)
  const expiryPatch = usePatchReview(review.dealId)
  const languagePatch = usePatchReview(review.dealId)
  const expiryId = useId()
  const hintId = useId()
  const languageId = useId()
  const days = Number(expiry)
  const valid = isValidExpiryDays(days)
  const pageLanguage = (languagePatch.isPending ? languagePatch.variables.pageLanguage : undefined) ?? review.pageLanguage

  if (review.expiryDays !== savedExpiry) {
    setSavedExpiry(review.expiryDays)
    setExpiry(String(review.expiryDays))
  }

  return (
    <Collapsible className="rounded-xl border bg-card">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="group w-full justify-between rounded-xl px-4 py-5">
          <span className="font-medium">More: form questions, link expiry, page language</span>
          <ChevronDown aria-hidden="true" className="transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-5 border-t px-4 py-4">
        <p className="text-xs text-muted-foreground">These settings change the video page only. They make no new audio and no new render.</p>
        <QuestionsEditor questions={review.customQuestions} lang={review.pageLanguage} save={save} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={expiryId}>Link expiry in days</Label>
              <SaveStatusText status={MUTATION_SAVE_STATUS[expiryPatch.status]} error={expiryPatch.error?.message ?? null} />
            </div>
            <Input
              id={expiryId}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              value={expiry}
              aria-invalid={!valid}
              aria-describedby={hintId}
              onChange={(event) => setExpiry(event.target.value)}
              onBlur={() => {
                if (!valid || days === review.expiryDays) return
                expiryPatch.mutate({ expiryDays: days }, { onError: () => setExpiry(String(review.expiryDays)) })
              }}
            />
            <p id={hintId} className={valid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
              {`A whole number from 1 to 365. The tool counts the days from ${PUBLISHED_STATUSES.has(review.status) ? 'today' : 'the publication'}.`}
            </p>
          </div>
          <div className="grid content-start gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={languageId}>Page language</Label>
              <SaveStatusText status={MUTATION_SAVE_STATUS[languagePatch.status]} error={languagePatch.error?.message ?? null} />
            </div>
            <Select
              value={pageLanguage}
              onValueChange={(value) => {
                if (value !== review.pageLanguage) languagePatch.mutate({ pageLanguage: value as Lang })
              }}
            >
              <SelectTrigger id={languageId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {languageName(lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{`The video stays in ${languageName(review.timeline.language)}.`}</p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
