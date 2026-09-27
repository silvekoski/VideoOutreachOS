import { useId } from 'react'
import type { Lang, ReviewPatch } from '@mergero/shared'
import { SLOT_LIMITS, textLength } from '@mergero/shared'
import { useAutosave } from '@/hooks/use-autosave'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { padLines, sameLines } from '../lib/review'
import { SaveStatusText } from './save-status'

interface LinesFieldProps {
  lines: string[]
  lang: Lang
  scrapeOk: boolean
  source: 'model' | 'analyst' | null
  save: (patch: ReviewPatch) => Promise<unknown>
}

const LIMIT = SLOT_LIMITS['your-company.line'] ?? 80

export function LinesField({ lines, lang, scrapeOk, source, save }: LinesFieldProps) {
  const baseId = useId()
  const autosave = useAutosave(padLines(lines), (next) => save({ lines: next.map((line) => line.trim()) }), {
    delayMs: 1500,
    equals: sameLines,
  })

  return (
    <fieldset className="grid gap-2">
      <legend className="flex w-full items-center justify-between gap-2 text-sm font-medium">
        <span>Three lines about the company</span>
        <SaveStatusText status={autosave.status} error={autosave.error} />
      </legend>
      <p className="text-xs text-muted-foreground">
        {!scrapeOk
          ? 'The website scrape failed or found too little text. Write the three lines.'
          : source === 'analyst'
            ? 'You wrote these lines.'
            : 'The model wrote these lines from the website.'}
      </p>
      {autosave.draft.map((line, index) => {
        const id = `${baseId}-${index}`
        const length = textLength(line)
        const tooLong = length > LIMIT
        return (
          <div key={index} className="grid gap-1">
            <Label htmlFor={id} className="text-xs">{`Line ${index + 1}`}</Label>
            <Input
              id={id}
              lang={lang}
              value={line}
              aria-invalid={tooLong || line.trim() === ''}
              aria-describedby={`${id}-count`}
              onChange={(event) =>
                autosave.change(autosave.draft.map((item, position) => (position === index ? event.target.value : item)))
              }
              onBlur={autosave.flush}
            />
            <p
              id={`${id}-count`}
              className={tooLong || line.trim() === '' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
            >
              {`${length} of ${LIMIT} characters${tooLong ? ': too long' : line.trim() === '' ? ': required' : ''}`}
            </p>
          </div>
        )
      })}
    </fieldset>
  )
}
