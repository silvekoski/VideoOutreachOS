import { useId, useState, type FormEvent } from 'react'
import type { ProspectDto } from '@mergero/shared'
import { Clapperboard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useGenerateVideos, useProspects } from '../api'
import { pluralize } from '../lib/format'
import { EmptyState, QueryState } from './query-state'

function ProspectOption({ prospect, checked, onChange }: { prospect: ProspectDto; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId()
  const owner = [prospect.ownerName, prospect.ownerRole].filter(Boolean).join(', ')
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <Label htmlFor={id} className="grid min-w-0 flex-1 gap-0.5 font-normal">
        <span className="truncate text-sm font-medium">{prospect.company}</span>
        <span className="truncate text-xs text-muted-foreground">{owner || 'No contact person in Pipedrive'}</span>
      </Label>
      <span className="font-mono text-xs text-muted-foreground">{prospect.country ?? 'No country'}</span>
    </li>
  )
}

export function GenerateVideosDialog({ analystId }: { analystId: number | null }) {
  const prospects = useProspects(analystId)
  const generate = useGenerateVideos()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const allId = useId()
  const list = prospects.data ?? []

  const toggle = (dealId: number, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(dealId)
      else next.delete(dealId)
      return next
    })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (selected.size === 0 || generate.isPending) return
    const names = new Map(list.map((prospect) => [prospect.dealId, prospect.company]))
    generate.mutate([...selected], {
      onSuccess: (results) => {
        const started = results.filter((result) => result.error === null).length
        if (started > 0) toast.success(`${pluralize(started, 'video', 'videos')} started. Each video shows in To do today when it is ready for review.`)
        for (const result of results) {
          if (result.error !== null) toast.error(`${names.get(result.dealId) ?? `Deal ${result.dealId}`}: ${result.error}`)
        }
        setOpen(false)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(new Set(list.map((prospect) => prospect.dealId)))
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={analystId === null}>
          <Clapperboard aria-hidden="true" />
          Generate videos
          {list.length > 0 ? (
            <span className="rounded-sm bg-primary-foreground/20 px-1.5 text-xs tabular-nums">{list.length}</span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Generate videos</DialogTitle>
            <DialogDescription>
              These open Pipedrive deals have no video yet. The tool reads each deal, makes the video, and puts it in To do today for your review.
            </DialogDescription>
          </DialogHeader>
          <QueryState query={prospects} label="the Pipedrive deals">
            {(data) =>
              data.length === 0 ? (
                <EmptyState>All your open Pipedrive deals have a video.</EmptyState>
              ) : (
                <div className="grid gap-2">
                  <div className="flex items-center gap-3 px-3">
                    <Checkbox
                      id={allId}
                      checked={selected.size === data.length ? true : selected.size === 0 ? false : 'indeterminate'}
                      onCheckedChange={(value) => setSelected(new Set(value === true ? data.map((prospect) => prospect.dealId) : []))}
                    />
                    <Label htmlFor={allId} className="text-xs text-muted-foreground">
                      {`Select all ${pluralize(data.length, 'deal', 'deals')}`}
                    </Label>
                  </div>
                  <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                    {data.map((prospect) => (
                      <ProspectOption
                        key={prospect.dealId}
                        prospect={prospect}
                        checked={selected.has(prospect.dealId)}
                        onChange={(checked) => toggle(prospect.dealId, checked)}
                      />
                    ))}
                  </ul>
                </div>
              )
            }
          </QueryState>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={selected.size === 0 || generate.isPending}>
              {generate.isPending ? 'Starting' : selected.size === 0 ? 'Generate videos' : `Generate ${pluralize(selected.size, 'video', 'videos')}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
