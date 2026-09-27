import type { DealStatus } from '@mergero/shared'
import { STATUS_META, type StateMeta, type Tone } from '../lib/status'
import { ShapeIcon } from './shape-icon'
import { cn } from '@/lib/utils'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'border-border text-muted-foreground',
  attention: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  danger: 'border-destructive/40 text-destructive',
  progress: 'border-sky-500/40 text-sky-700 dark:text-sky-300',
  success: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
}

export function StateBadge({ meta, className, label }: { meta: StateMeta; className?: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border px-1.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      <ShapeIcon shape={meta.shape} />
      {label ?? meta.label}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: DealStatus; className?: string }) {
  return <StateBadge meta={STATUS_META[status]} className={className} />
}
