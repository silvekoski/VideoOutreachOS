import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { errorMessage } from '../api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface QueryStateProps<T> {
  query: UseQueryResult<T>
  label: string
  children: (data: T) => ReactNode
}

export function QueryState<T>({ query, label, children }: QueryStateProps<T>) {
  if (query.isPending) {
    return (
      <div role="status" className="grid gap-2">
        <span className="sr-only">{`Loading ${label}`}</span>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (query.isError) return <QueryError error={query.error} label={label} onRetry={() => void query.refetch()} />
  return <>{children(query.data)}</>
}

export function QueryError({ error, label, onRetry }: { error: unknown; label: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" role="alert">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{`Could not load ${label}`}</AlertTitle>
      <AlertDescription>
        <p>{errorMessage(error)}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{children}</p>
}
