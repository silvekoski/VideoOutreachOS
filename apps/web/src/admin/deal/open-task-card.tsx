import type { DealDetailDto, DealTaskDto } from '@mergero/shared'
import { Check, Copy, Mail, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTaskDone } from '../api'
import { channelLabel } from '../lib/events'
import { formatZonedDateTime } from '../lib/format'
import { copyChannelLink } from './copy-channel-link'
import { DealCard } from './deal-card'

export function OpenTaskCard({ deal, task }: { deal: DealDetailDto; task: DealTaskDto }) {
  const done = useTaskDone()
  const title = task.type === 'call' ? 'Call the owner' : `Send the link on ${channelLabel(task.channel)}`
  const channel = task.channel
  return (
    <DealCard
      id={`open-task-${task.id}`}
      title={`Open task: ${title}`}
      description={`Created ${formatZonedDateTime(task.createdAt, deal.analyst.timeZone)}`}
      action={
        <Button
          size="sm"
          disabled={done.isPending}
          onClick={() => done.mutate(task.id, { onSuccess: () => toast.success('Task done.') })}
        >
          <Check aria-hidden="true" />
          {done.isPending ? 'Saving' : 'Mark done'}
        </Button>
      }
    >
      <div className="grid gap-2 text-sm">
        <p>
          {task.type === 'call'
            ? `The owner did not open the link in two days. Call ${deal.ownerName}.`
            : `${deal.ownerName} opened the link but did not book a meeting. Send the link on a second channel.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {task.ownerPhone ? (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${task.ownerPhone.replace(/[^\d+]/g, '')}`}>
                <Phone aria-hidden="true" />
                {task.ownerPhone}
              </a>
            </Button>
          ) : (
            <span className="text-muted-foreground">No phone number in Pipedrive.</span>
          )}
          {task.ownerEmail ? (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${task.ownerEmail}`}>
                <Mail aria-hidden="true" />
                {task.ownerEmail}
              </a>
            </Button>
          ) : (
            <span className="text-muted-foreground">No email address in Pipedrive.</span>
          )}
          {task.type === 'second_channel' && channel && deal.links && !deal.expired ? (
            <Button variant="outline" size="sm" onClick={() => void (deal.links && copyChannelLink(deal.links, channel))}>
              <Copy aria-hidden="true" />
              {`Copy the ${channelLabel(channel)} link`}
            </Button>
          ) : null}
        </div>
      </div>
    </DealCard>
  )
}
