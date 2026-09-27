import type { SessionChannel } from '@mergero/shared'
import { BriefcaseBusiness, Link, Mail, MessageSquareText } from 'lucide-react'
import { siWhatsapp } from 'simple-icons'
import { cn } from '@/lib/utils'

export function ChannelIcon({ channel, className }: { channel: SessionChannel; className?: string }) {
  const size = cn('size-4 shrink-0', className)
  switch (channel) {
    case 'email':
      return <Mail aria-hidden="true" className={size} />
    case 'sms':
      return <MessageSquareText aria-hidden="true" className={size} />
    case 'linkedin':
      return <BriefcaseBusiness aria-hidden="true" className={size} />
    case 'whatsapp':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className={size} fill="currentColor">
          <path d={siWhatsapp.path} />
        </svg>
      )
    case 'direct':
      return <Link aria-hidden="true" className={size} />
  }
}
