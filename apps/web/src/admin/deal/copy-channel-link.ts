import type { Channel } from '@mergero/shared'
import { toast } from 'sonner'
import { copyText } from '@/lib/clipboard'
import { channelLabel } from '../lib/events'

export async function copyChannelLink(links: Record<Channel, string>, channel: Channel): Promise<void> {
  const ok = await copyText(links[channel])
  if (ok) toast.success(`Link for ${channelLabel(channel)} copied.`)
  else toast.error('The browser blocked the clipboard. Copy the link by hand.', { description: links[channel] })
}
