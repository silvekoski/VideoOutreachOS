import type { InterestLevel } from '@mergero/shared'
import { INTEREST_SCORE } from '../lib/status'
import { cn } from '@/lib/utils'

const CHIP_CLASSES: Record<InterestLevel, string> = {
  high: 'bg-emerald-700 text-white',
  medium: 'bg-amber-700 text-white',
  low: 'bg-muted-foreground text-background',
}

export function InterestBadge({ level, label, className }: { level: InterestLevel; label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm whitespace-nowrap', className)}>
      <span aria-hidden="true" className={cn('grid size-5 shrink-0 place-items-center rounded-md text-xs font-semibold', CHIP_CLASSES[level])}>
        {INTEREST_SCORE[level]}
      </span>
      {label}
    </span>
  )
}
