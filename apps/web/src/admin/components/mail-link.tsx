import { Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MailLink({ email, className }: { email: string; className?: string }) {
  return (
    <a href={`mailto:${email}`} className={cn('inline-flex items-center gap-1 break-all underline underline-offset-2', className)}>
      <Mail aria-hidden="true" className="size-3.5 shrink-0" />
      {email}
    </a>
  )
}
