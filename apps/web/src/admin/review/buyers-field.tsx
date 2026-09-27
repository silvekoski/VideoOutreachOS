import { useState } from 'react'
import { MAX_SLIDE_BUYERS } from '@mergero/shared'
import type { ReviewDto, ReviewPatch } from '@mergero/shared'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { moveItem } from '../lib/buyers'

type Buyer = ReviewDto['buyers'][number]

interface BuyersFieldProps {
  buyers: ReviewDto['buyers']
  pending: boolean
  save: (patch: ReviewPatch) => void
}

export function BuyerLogo({ buyer }: { buyer: Pick<Buyer, 'name' | 'logoUrl'> }) {
  return buyer.logoUrl ? (
    <img src={buyer.logoUrl} alt={`${buyer.name} logo`} className="size-8 shrink-0 rounded bg-white object-contain p-0.5" />
  ) : (
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded border text-xs">
      {buyer.name.slice(0, 1)}
    </span>
  )
}

export function BuyersField({ buyers, pending, save }: BuyersFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = buyers.filter((buyer) => !buyer.removed)
  const available = buyers.filter((buyer) => buyer.removed)
  const full = selected.length >= MAX_SLIDE_BUYERS
  const commit = (ids: string[]) => {
    if (!pending) save({ buyerIds: ids })
  }
  const ids = selected.map((buyer) => buyer.id)

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{`Buyers on slide 5 (${selected.length} of ${MAX_SLIDE_BUYERS})`}</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="xs" disabled={full || available.length === 0 || pending}>
              <Plus aria-hidden="true" />
              Add buyer
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <Command>
              <CommandInput placeholder="Search MGX buyers" aria-label="Search MGX buyers" />
              <CommandList>
                <CommandEmpty>No buyer matches.</CommandEmpty>
                {available.map((buyer) => (
                  <CommandItem
                    key={buyer.id}
                    value={`${buyer.name} ${buyer.focus}`}
                    onSelect={() => {
                      commit([...ids, buyer.id])
                      setOpen(false)
                    }}
                  >
                    <BuyerLogo buyer={buyer} />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{buyer.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{buyer.focus}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {full ? <p className="text-xs text-muted-foreground">{`The slide shows at most ${MAX_SLIDE_BUYERS} buyers. Remove one to add another.`}</p> : null}
      {selected.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">No buyers on the slide. Add at least one buyer.</p>
      ) : (
        <ol className="divide-y rounded-lg border">
          {selected.map((buyer, index) => (
            <li key={buyer.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <BuyerLogo buyer={buyer} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{buyer.name}</p>
                <p className="truncate text-xs text-muted-foreground">{buyer.focus}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-disabled={pending || index === 0 || undefined}
                  aria-label={`Move ${buyer.name} up`}
                  className="aria-disabled:opacity-40"
                  onClick={() => {
                    if (index > 0) commit(moveItem(ids, index, index - 1))
                  }}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-disabled={pending || index === selected.length - 1 || undefined}
                  aria-label={`Move ${buyer.name} down`}
                  className="aria-disabled:opacity-40"
                  onClick={() => {
                    if (index < selected.length - 1) commit(moveItem(ids, index, index + 1))
                  }}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  aria-disabled={pending || undefined}
                  aria-label={`Remove ${buyer.name}`}
                  className="aria-disabled:opacity-50"
                  onClick={() => commit(ids.filter((id) => id !== buyer.id))}
                >
                  <X aria-hidden="true" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
