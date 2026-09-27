import { useId, useState } from 'react'
import type { Channel, DealDetailDto, OutreachDto } from '@mergero/shared'
import { Copy, ExternalLink, LoaderCircle, RefreshCw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { copyText } from '@/lib/clipboard'
import { useOutreach } from '../api'
import { QueryError } from '../components/query-state'
import { languageName } from '../lib/brief'
import { channelLabel } from '../lib/events'

interface SendTarget {
  href: string
  label: string
  recipient: string
  newTab: boolean
  copyFirst: boolean
}

function sendTarget(channel: Channel, deal: DealDetailDto, subject: string, message: string): SendTarget {
  const text = encodeURIComponent(message)
  const phone = deal.ownerPhone ?? ''
  switch (channel) {
    case 'email':
      return {
        href: `mailto:${deal.ownerEmail ?? ''}?subject=${encodeURIComponent(subject)}&body=${text}`,
        label: 'Open in email app',
        recipient: deal.ownerEmail ?? 'No email in Pipedrive',
        newTab: false,
        copyFirst: false,
      }
    case 'whatsapp':
      return {
        href: `https://wa.me/${phone.replace(/\D/gu, '').replace(/^00/u, '')}?text=${text}`,
        label: 'Open in WhatsApp',
        recipient: phone || 'No phone number in Pipedrive',
        newTab: true,
        copyFirst: false,
      }
    case 'sms':
      return {
        href: `sms:${phone.replace(/[^\d+]/gu, '')}?body=${text}`,
        label: 'Open in messages app',
        recipient: phone || 'No phone number in Pipedrive',
        newTab: false,
        copyFirst: false,
      }
    case 'linkedin':
      return {
        href: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${deal.ownerName} ${deal.company}`)}`,
        label: 'Copy and find on LinkedIn',
        recipient: deal.ownerName,
        newTab: true,
        copyFirst: true,
      }
  }
}

async function copyWithToast(text: string, what: string): Promise<void> {
  if (await copyText(text)) toast.success(`${what} copied.`)
  else toast.error('The browser blocked the clipboard. Select the text and copy it by hand.')
}

interface DraftFormProps {
  deal: DealDetailDto
  channel: Channel
  draft: OutreachDto
  onRewrite: () => void
}

function DraftForm({ deal, channel, draft, onRewrite }: DraftFormProps) {
  const [subject, setSubject] = useState(draft.subject ?? '')
  const [message, setMessage] = useState(draft.message)
  const subjectId = useId()
  const messageId = useId()
  const target = sendTarget(channel, deal, subject, message)

  return (
    <div className="grid gap-3">
      {draft.drafted === 'template' ? (
        <p className="text-xs text-muted-foreground">The model did not give a usable answer, so this draft comes from a template.</p>
      ) : null}
      <p className="text-sm">
        <span className="text-muted-foreground">To: </span>
        {target.recipient}
      </p>
      {channel === 'email' ? (
        <div className="grid gap-1.5">
          <Label htmlFor={subjectId}>Subject</Label>
          <Input id={subjectId} value={subject} onChange={(event) => setSubject(event.target.value)} />
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={messageId}>Message</Label>
        <Textarea id={messageId} value={message} onChange={(event) => setMessage(event.target.value)} className="max-h-80 min-h-40" />
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onRewrite}>
          <RefreshCw aria-hidden="true" />
          Write again
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyWithToast(message, 'Message')}>
            <Copy aria-hidden="true" />
            Copy message
          </Button>
          <Button asChild size="sm">
            <a
              href={target.href}
              target={target.newTab ? '_blank' : undefined}
              rel="noreferrer"
              onClick={target.copyFirst ? () => void copyWithToast(message, 'Message') : undefined}
            >
              {target.newTab ? <ExternalLink aria-hidden="true" /> : <Send aria-hidden="true" />}
              {target.label}
              {target.newTab ? <span className="sr-only"> (opens in a new tab)</span> : null}
            </a>
          </Button>
        </div>
      </DialogFooter>
    </div>
  )
}

interface OutreachDialogProps {
  deal: DealDetailDto
  channel: Channel
  link: string
  onClose: () => void
  onCloseAutoFocus: (event: Event) => void
}

export function OutreachDialog({ deal, channel, link, onClose, onCloseAutoFocus }: OutreachDialogProps) {
  const outreach = useOutreach(deal, channel)
  const label = channelLabel(channel)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{`Message for ${label}`}</DialogTitle>
          <DialogDescription>
            {`An AI draft in ${languageName(deal.pageLanguage)} with the personal ${label} link. Read and edit it before you send it.`}
          </DialogDescription>
        </DialogHeader>
        {outreach.isFetching ? (
          <div role="status" className="grid gap-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              {`AI writes the ${label} message. This takes a few seconds.`}
            </p>
            {channel === 'email' ? <Skeleton className="h-9 w-full border border-input" /> : null}
            <Skeleton className="h-40 w-full border border-input" />
          </div>
        ) : outreach.isError ? (
          <QueryError error={outreach.error} label="the message" onRetry={() => void outreach.refetch()} />
        ) : outreach.data ? (
          <DraftForm key={outreach.dataUpdatedAt} deal={deal} channel={channel} draft={outreach.data} onRewrite={() => void outreach.refetch()} />
        ) : null}
        <div className="flex min-w-0 items-center gap-2 border-t pt-3 text-sm">
          <span className="shrink-0 text-muted-foreground">Link only:</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyWithToast(link, `Link for ${label}`)}>
            <Copy aria-hidden="true" />
            Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
