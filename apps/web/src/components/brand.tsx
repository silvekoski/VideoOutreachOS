import logo from '@/assets/velho-logo.svg?raw'
import { cn } from '@/lib/utils'

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 text-foreground', className)}>
      <span role="img" aria-label="Velho" className="block h-5 shrink-0 [&>svg]:h-full [&>svg]:w-auto" dangerouslySetInnerHTML={{ __html: logo }} />
      <span className="whitespace-nowrap rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Video outreach</span>
    </span>
  )
}
