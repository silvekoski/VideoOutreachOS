import type { Channel } from '@mergero/shared'
import { CHANNELS } from '@mergero/shared'
import { ChevronDown, Copy } from 'lucide-react'
import { ChannelIcon } from '@/components/channel-icon'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { channelLabel } from '../lib/events'
import { copyChannelLink } from './copy-channel-link'

export function CopyLinkMenu({ links }: { links: Record<Channel, string> | null }) {
  if (!links) {
    return (
      <Button variant="outline" size="sm" disabled title="The link exists after approval">
        <Copy aria-hidden="true" />
        Copy link
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Copy aria-hidden="true" />
          Copy link
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Link for the channel</DropdownMenuLabel>
        {CHANNELS.map((channel) => (
          <DropdownMenuItem key={channel} onSelect={() => void copyChannelLink(links, channel)}>
            <ChannelIcon channel={channel} />
            {channelLabel(channel)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
