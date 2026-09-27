import { useEffect, useState } from 'react'
import { fill } from '@mergero/shared/i18n/base'
import type { PageStrings } from '@mergero/shared/i18n/base'
import { Check, Share2 } from 'lucide-react'
import { useRecorder } from './recorder-context.ts'
import { shareUrl } from './urls.ts'

const COPIED_VISIBLE_MS = 4000

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      area.remove()
    }
  }
}

export function ForwardButton({ strings, company }: { strings: PageStrings; company: string }) {
  const recorder = useRecorder()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function forward() {
    const url = shareUrl(window.location.href)
    const canShare = typeof navigator.share === 'function'
    recorder.record('forward', { data: { method: canShare ? 'share' : 'copy' } })
    if (canShare) {
      try {
        await navigator.share({
          title: fill(strings.shareTitle, { company }),
          text: fill(strings.shareText, { company }),
          url,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    setCopied(await copyText(url))
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        data-track="forward"
        onClick={() => void forward()}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 font-semibold text-ink hover:border-ink"
      >
        <Share2 className="size-4" aria-hidden="true" />
        {strings.forward}
      </button>
      <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
        {copied && <Check className="size-4 text-brand" aria-hidden="true" />}
        {copied ? strings.linkCopied : ''}
      </span>
    </div>
  )
}
