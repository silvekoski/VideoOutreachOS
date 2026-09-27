import type { ReviewDto, ReviewPatch } from '@mergero/shared'
import { Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BuyersFieldProps {
  buyers: ReviewDto['buyers']
  pending: boolean
  save: (patch: ReviewPatch) => void
}

export function BuyersField({ buyers, pending, save }: BuyersFieldProps) {
  const removed = new Set(buyers.filter((buyer) => buyer.removed).map((buyer) => buyer.id))
  const toggle = (id: string) => {
    const next = new Set(removed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    save({ removedBuyers: [...next] })
  }

  if (buyers.length === 0) return <p className="text-sm text-muted-foreground">MGX returned no buyers for this sector.</p>

  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{`Buyers from MGX (${buyers.length - removed.size} of ${buyers.length} shown)`}</p>
      <ul className="divide-y rounded-lg border">
        {buyers.map((buyer) => (
          <li key={buyer.id} className="flex items-center gap-3 px-3 py-2">
            {buyer.logoUrl ? (
              <img src={buyer.logoUrl} alt={`${buyer.name} logo`} className="size-8 shrink-0 rounded bg-white object-contain p-0.5" />
            ) : (
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded border text-xs">
                {buyer.name.slice(0, 1)}
              </span>
            )}
            <div className={cn('min-w-0 flex-1', buyer.removed && 'text-muted-foreground')}>
              <p className={cn('truncate text-sm font-medium', buyer.removed && 'line-through')}>
                {buyer.name}
                {buyer.removed ? <span className="ml-2 text-xs font-normal no-underline">(removed)</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{buyer.focus}</p>
            </div>
            <Button
              variant="outline"
              size="xs"
              aria-disabled={pending || undefined}
              onClick={() => {
                if (!pending) toggle(buyer.id)
              }}
              aria-label={`${buyer.removed ? 'Restore' : 'Remove'} ${buyer.name}`}
              className="aria-disabled:opacity-50"
            >
              {buyer.removed ? <Undo2 aria-hidden="true" /> : <X aria-hidden="true" />}
              {buyer.removed ? 'Restore' : 'Remove'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
