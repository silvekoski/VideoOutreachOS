import type { InterestLevel } from '@mergero/shared'
import { INTEREST_BARS } from '../lib/status'
import { cn } from '@/lib/utils'

export function InterestBadge({ level, label, className }: { level: InterestLevel; label: string; className?: string }) {
  const bars = INTEREST_BARS[level]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap', className)}>
      <svg viewBox="0 0 14 12" aria-hidden="true" focusable="false" className="h-3 w-3.5 shrink-0">
        {[0, 1, 2].map((index) => (
          <rect
            key={index}
            x={index * 5}
            y={8 - index * 4}
            width="3.5"
            height={4 + index * 4}
            rx="0.5"
            fill="currentColor"
            opacity={index < bars ? 1 : 0.25}
          />
        ))}
      </svg>
      {label}
    </span>
  )
}
