import { useId, useState } from 'react'
import type { AnalystDto, IntroUpload, Lang } from '@mergero/shared'
import { LANGUAGES, formatDurationS } from '@mergero/shared'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useUploadIntro } from '../api'
import { StateBadge } from '../components/state-badge'
import { languageName } from '../lib/brief'
import { introCaptionsUrl } from '../lib/captions'
import { formatDate } from '../lib/format'
import { INTRO_META } from '../lib/status'
import { MediaUploadDialog } from './media-upload-dialog'

const INTRO_MAX_S = 45

function pendingNote(upload: IntroUpload): string {
  const recorded = `The new recording of ${formatDate(upload.recordedAt)}`
  return upload.status === 'failed'
    ? `${recorded} could not be processed. The current intro stays in use. Record it again.`
    : `${recorded} is processing. The current intro stays in use until the new one is ready.`
}

export function IntroSection({ analyst }: { analyst: AnalystDto }) {
  const [editing, setEditing] = useState<Lang | null>(null)
  const [transcript, setTranscript] = useState('')
  const upload = useUploadIntro(analyst.id)
  const transcriptId = useId()
  const transcriptHintId = useId()
  const current = editing ? analyst.intros.find((intro) => intro.language === editing) : undefined
  const currentCaptions = current ? introCaptionsUrl(current) : null

  const start = (lang: Lang) => {
    const intro = analyst.intros.find((item) => item.language === lang)
    setTranscript(intro?.pending?.transcript ?? intro?.transcript ?? '')
    setEditing(lang)
  }

  return (
    <section aria-labelledby="intro-heading" className="grid gap-2">
      <h3 id="intro-heading" className="text-sm font-semibold">
        Face-cam intro per language
      </h3>
      <ul className="divide-y rounded-lg border">
        {LANGUAGES.map((lang) => {
          const intro = analyst.intros.find((item) => item.language === lang)
          return (
            <li key={lang} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-20 text-sm font-medium">{languageName(lang)}</span>
              <span aria-live="polite" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <StateBadge meta={INTRO_META[intro?.status ?? 'none']} />
                {intro ? (
                  <span className="text-xs text-muted-foreground">
                    {`${formatDate(intro.recordedAt)}${intro.durationS !== null ? `, ${formatDurationS(intro.durationS)}` : ''}`}
                  </span>
                ) : null}
                {intro?.pending ? (
                  <span className={cn('basis-full text-xs', intro.pending.status === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
                    {pendingNote(intro.pending)}
                  </span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => start(lang)}
                aria-label={`${intro ? 'Replace' : 'Record'} the ${languageName(lang)} intro`}
              >
                {intro ? 'Replace' : 'Record'}
              </Button>
            </li>
          )
        })}
      </ul>
      {editing ? (
        <MediaUploadDialog
          key={editing}
          kind="video"
          maxS={INTRO_MAX_S}
          title={`${languageName(editing)} intro`}
          description="Record a welcome of about 30 seconds that fits every prospect. A new intro applies to new videos only."
          fileLabel="Video file"
          fileName={`intro-${editing}`}
          submitLabel="Upload intro"
          pending={upload.isPending}
          canSubmit={transcript.trim() !== ''}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onSubmit={(file, close) =>
            upload.mutate(
              { lang: editing, file, transcript },
              {
                onSuccess: () => {
                  toast.success(`${languageName(editing)} intro uploaded. The tool processes it now.`)
                  close()
                },
              },
            )
          }
        >
          {current?.url && current.status === 'ready' ? (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Play the current intro</summary>
              <video
                src={current.url}
                controls
                playsInline
                aria-label="Current intro"
                className="mt-2 aspect-video w-full rounded-lg bg-black"
              >
                {currentCaptions ? (
                  <track kind="captions" src={currentCaptions} srcLang={current.language} label={languageName(current.language)} default />
                ) : null}
              </video>
            </details>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={transcriptId}>Transcript for the captions</Label>
            <Textarea
              id={transcriptId}
              lang={editing}
              rows={3}
              required
              aria-describedby={transcriptHintId}
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
            />
            <p id={transcriptHintId} className="text-xs text-muted-foreground">
              Required. Write the words that you say in the intro. The video page shows them as captions.
            </p>
          </div>
        </MediaUploadDialog>
      ) : null}
    </section>
  )
}
