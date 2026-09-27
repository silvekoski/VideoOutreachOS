import { useRef, useState } from 'react'
import type { Channel, DealDetailDto } from '@mergero/shared'
import { CHANNELS } from '@mergero/shared'
import { ChevronDown, Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { ChannelIcon } from '@/components/channel-icon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { copyText } from '@/lib/clipboard'
import { channelLabel } from '../lib/events'
import { OutreachDialog } from './outreach-dialog'

export function ShareLinkMenu({ deal }: { deal: DealDetailDto }) {
  const [channel, setChannel] = useState<Channel | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const links = deal.expired ? null : deal.links
  const link = deal.expired ? null : deal.link
  if (!links || !link) {
    return (
      <>
        <Button variant="outline" size="sm" disabled title="The link exists after approval">
          <Share2 aria-hidden="true" />
          Share link
        </Button>
        <Button variant="outline" size="sm" disabled title="The link exists after approval">
          <Copy aria-hidden="true" />
          Copy link
        </Button>
      </>
    )
  }

  const copyLink = async () => {
    if (await copyText(link)) toast.success('Link copied.')
    else toast.error('The browser blocked the clipboard. Copy the link by hand.', { description: link })
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant="outline" size="sm">
            <Share2 aria-hidden="true" />
            Share link
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel>Write a message for</DropdownMenuLabel>
          {CHANNELS.map((item) => (
            <DropdownMenuItem key={item} onSelect={() => setChannel(item)}>
              <ChannelIcon channel={item} />
              {channelLabel(item)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" title={link} onClick={() => void copyLink()}>
        <Copy aria-hidden="true" />
        Copy link
      </Button>
      {channel ? (
        <OutreachDialog
          deal={deal}
          channel={channel}
          link={links[channel]}
          onClose={() => setChannel(null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            trigger.current?.focus()
          }}
        />
      ) : null}
    </>
  )
}
