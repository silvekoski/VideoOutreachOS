import { useId, useRef, useState } from 'react'
import type { Lang, ReviewPatch, ScriptSlideNumber } from '@mergero/shared'
import { countWords } from '@mergero/shared'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAutosave } from '@/hooks/use-autosave'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '../api'
import { SaveStatusText } from './save-status'

const MIN_WORDS = 30
const MAX_WORDS = 60

interface ScriptFieldProps {
  slide: ScriptSlideNumber
  script: string
  lang: Lang
  needsCheck: boolean
  save: (patch: ReviewPatch) => Promise<unknown>
}

export function ScriptField({ slide, script, lang, needsCheck, save }: ScriptFieldProps) {
  const id = useId()
  const hintId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [confirming, setConfirming] = useState(false)
  const autosave = useAutosave(script, (text) => save({ scripts: { [slide]: text } }), { delayMs: 1500 })
  const words = countWords(autosave.draft)
  const outside = words < MIN_WORDS || words > MAX_WORDS
  const note = words < MIN_WORDS ? 'too short' : words > MAX_WORDS ? 'too long' : 'fits'

  const confirm = () => {
    if (confirming) return
    setConfirming(true)
    save({ scripts: { [slide]: autosave.draft } }).then(
      () => {
        setConfirming(false)
        toast.success(`The script of slide ${slide} is confirmed.`)
        textareaRef.current?.focus()
      },
      (error: unknown) => {
        setConfirming(false)
        toast.error(errorMessage(error))
      },
    )
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{`Script, slide ${slide}`}</Label>
        <SaveStatusText status={autosave.status} error={autosave.error} />
      </div>
      <Textarea
        ref={textareaRef}
        id={id}
        lang={lang}
        rows={4}
        value={autosave.draft}
        aria-invalid={outside}
        aria-describedby={hintId}
        onChange={(event) => autosave.change(event.target.value)}
        onBlur={autosave.flush}
      />
      <p id={hintId} className={outside ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {`${words} words (${MIN_WORDS} to ${MAX_WORDS}): ${note}. An edit makes new audio for this slide.`}
      </p>
      {needsCheck ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-disabled={confirming || undefined}
          onClick={confirm}
          className="justify-self-start aria-disabled:opacity-50"
        >
          <Check aria-hidden="true" />
          {confirming ? 'Saving' : 'Script is correct'}
        </Button>
      ) : null}
    </div>
  )
}
