import type { SaveStatus } from '@/hooks/use-autosave'
import { cn } from '@/lib/utils'

const TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving',
  saved: 'Saved',
  error: 'Not saved',
}

export function SaveStatusText({ status, error, className }: { status: SaveStatus; error: string | null; className?: string }) {
  return (
    <span
      aria-live="polite"
      className={cn('text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground', className)}
    >
      {status === 'error' && error ? `${TEXT.error}: ${error}` : TEXT[status]}
    </span>
  )
}
