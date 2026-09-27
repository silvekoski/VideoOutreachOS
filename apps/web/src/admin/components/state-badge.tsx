import type { ReactNode } from 'react'
import type { DealStatus } from '@mergero/shared'
import { STATUS_META, type StateMeta, type Tone } from '../lib/status'
import { ShapeIcon } from './shape-icon'
import { cn } from '@/lib/utils'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  attention: 'text-amber-700 dark:text-amber-300',
  danger: 'text-destructive',
  progress: 'text-sky-700 dark:text-sky-300',
  success: 'text-emerald-700 dark:text-emerald-300',
}

const TONE_BORDER: Record<Tone, string> = {
  neutral: 'border-border',
  attention: 'border-amber-500/40',
  danger: 'border-destructive/40',
  progress: 'border-sky-500/40',
  success: 'border-emerald-500/40',
}

export function StateBadge({ meta, className, label }: { meta: StateMeta; className?: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border px-1.5 text-xs font-medium whitespace-nowrap',
        TONE_BORDER[meta.tone],
        TONE_TEXT[meta.tone],
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

export function ToneText({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  return <span className={cn(TONE_TEXT[tone], className)}>{children}</span>
}

export function StatusText({ status }: { status: DealStatus }) {
  const meta = STATUS_META[status]
  return (
    <ToneText tone={meta.tone} className="inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap">
      <ShapeIcon shape={meta.shape} />
      {meta.label}
    </ToneText>
  )
}
