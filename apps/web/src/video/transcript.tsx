import { useId, useState } from 'react'
import type { Lang, VideoPageData } from '@mergero/shared'
import type { PageStrings } from '@mergero/shared/i18n/base'
import { ChevronDown } from 'lucide-react'

export function Transcript({
  transcript,
  lang,
  strings,
}: {
  transcript: VideoPageData['transcript']
  lang: Lang
  strings: PageStrings
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  if (transcript.length === 0) return null
  return (
    <section aria-labelledby={id} data-region="transcript">
      <h2 id={id} className="sr-only">
        {strings.transcriptHeading}
      </h2>
      <details onToggle={(event) => setOpen(event.currentTarget.open)} className="group rounded-xl border border-line">
        <summary
          data-track="transcript"
          className="flex list-none items-center justify-between gap-3 rounded-xl px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden"
        >
          {open ? strings.hideTranscript : strings.showTranscript}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="space-y-4 border-t border-line px-4 py-4">
          {transcript.map((part) => (
            <div key={part.slide}>
              <h3 className="text-sm font-semibold text-ink">{strings.slideNames[part.slide]}</h3>
              {part.text && (
                <p lang={lang} className="mt-1 text-sm leading-relaxed text-text">
                  {part.text}
                </p>
              )}
              {part.screen.length > 0 && (
                <>
                  <p id={`${id}-screen-${part.slide}`} className="mt-2 text-xs font-semibold text-muted">
                    {strings.onScreen}
                  </p>
                  <ul
                    lang={lang}
                    aria-labelledby={`${id}-screen-${part.slide}`}
                    className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-text"
                  >
                    {part.screen.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}
