import { useId, useRef, useState, type FormEvent } from 'react'
import type { AnalystDto } from '@mergero/shared'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSetVoiceId, useUploadConsent, useUploadVoice } from '../api'
import { StateBadge } from '../components/state-badge'
import { ISO_DAY, localDay } from '../lib/format'
import { CLONE_META } from '../lib/status'
import { MediaUploadDialog } from './media-upload-dialog'

const VOICE_MAX_S = 180
const VOICE_ID = /^[A-Za-z0-9_-]{1,64}$/u

function VoiceIdForm({ analystId, current }: { analystId: number; current: string | null }) {
  const [value, setValue] = useState(current ?? '')
  const setVoiceId = useSetVoiceId(analystId)
  const inputId = useId()
  const hintId = useId()
  const trimmed = value.trim()
  const valid = trimmed === '' || VOICE_ID.test(trimmed)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = trimmed === '' ? null : trimmed
    if (setVoiceId.isPending || !valid || next === current) return
    setVoiceId.mutate(next, {
      onSuccess: () => toast.success(next === null ? 'Voice ID removed.' : 'Voice ID saved. New audio uses this voice.'),
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>ElevenLabs voice ID</Label>
        <Input
          id={inputId}
          value={value}
          maxLength={64}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!valid}
          aria-describedby={hintId}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <Button type="submit" size="sm" aria-disabled={setVoiceId.isPending || undefined} className="aria-disabled:opacity-50">
        {setVoiceId.isPending ? 'Saving' : 'Save voice ID'}
      </Button>
      <p id={hintId} className={valid ? 'text-xs text-muted-foreground sm:col-span-2' : 'text-xs text-destructive sm:col-span-2'}>
        {valid
          ? 'Use a voice from your ElevenLabs account. A new voice sample replaces this ID. Leave the field empty to remove the ID.'
          : 'Enter letters, digits, hyphens or underscores only.'}
      </p>
    </form>
  )
}

export function VoiceSection({ analyst }: { analyst: AnalystDto }) {
  const [recording, setRecording] = useState(false)
  const [consentFile, setConsentFile] = useState<File | null>(null)
  const [consentDate, setConsentDate] = useState(() => localDay(new Date()))
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadVoice = useUploadVoice(analyst.id)
  const uploadConsent = useUploadConsent(analyst.id)
  const fileId = useId()
  const dateId = useId()
  const { voice } = analyst
  const dateValid = ISO_DAY.test(consentDate)

  const submitConsent = (event: FormEvent) => {
    event.preventDefault()
    if (uploadConsent.isPending || !consentFile || !dateValid) return
    uploadConsent.mutate(
      { file: consentFile, date: consentDate },
      {
        onSuccess: (updated) => {
          toast.success(updated.voice.cloneStatus === 'pending' ? 'Consent saved. The clone starts now.' : 'Consent saved.')
          setConsentFile(null)
          if (fileRef.current) fileRef.current.value = ''
        },
      },
    )
  }

  return (
    <section aria-labelledby="voice-heading" className="grid gap-3">
      <h3 id="voice-heading" className="text-sm font-semibold">
        Voice clone
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-live="polite">
          <StateBadge meta={CLONE_META[voice.cloneStatus]} />
        </span>
        <Button type="button" variant="outline" size="xs" onClick={() => setRecording(true)}>
          {voice.sampleUrl ? 'Replace the voice sample' : 'Record the voice sample'}
        </Button>
      </div>
      {voice.sampleUrl ? <audio src={voice.sampleUrl} controls aria-label="Current voice sample" className="w-full" /> : null}
      <VoiceIdForm key={voice.voiceId ?? ''} analystId={analyst.id} current={voice.voiceId} />
      <p className="text-sm">
        {voice.consentDate ? (
          <>
            {`Written consent given on ${voice.consentDate}. `}
            {voice.consentUrl ? (
              <a href={voice.consentUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Open the consent PDF<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">No written consent yet. The clone needs your written consent.</span>
        )}
      </p>
      <form onSubmit={submitConsent} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={fileId}>Signed consent (PDF)</Label>
          <Input
            ref={fileRef}
            id={fileId}
            type="file"
            accept="application/pdf"
            required
            onChange={(event) => setConsentFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={dateId}>Consent date</Label>
          <Input
            id={dateId}
            type="date"
            required
            value={consentDate}
            aria-invalid={!dateValid}
            onChange={(event) => setConsentDate(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" aria-disabled={uploadConsent.isPending || undefined} className="aria-disabled:opacity-50">
          {uploadConsent.isPending ? 'Saving' : 'Save consent'}
        </Button>
      </form>
      <MediaUploadDialog
        kind="audio"
        maxS={VOICE_MAX_S}
        title="Voice sample"
        description="Read a text in your normal voice for one to three minutes in a quiet room. A new sample applies to new videos only."
        fileLabel="Audio file"
        fileName="voice-sample"
        submitLabel="Upload voice sample"
        pending={uploadVoice.isPending}
        open={recording}
        onOpenChange={setRecording}
        onSubmit={(file, close) =>
          uploadVoice.mutate(file, {
            onSuccess: (updated) => {
              toast.success(
                updated.voice.consentDate === null
                  ? 'Voice sample uploaded. The clone starts after you save the written consent.'
                  : 'Voice sample uploaded. The clone starts now.',
              )
              close()
            },
          })
        }
      />
    </section>
  )
}
