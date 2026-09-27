import { useId, useState, type FormEvent } from 'react'
import { CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSetExpiry } from '../api'
import { formatDate } from '../lib/format'
import { isValidExpiryDays } from '../lib/review'

interface ExpiryDialogProps {
  dealId: number
  expiryDays: number
  expiresAt: string | null
  timeZone: string
}

export function ExpiryDialog({ dealId, expiryDays, expiresAt, timeZone }: ExpiryDialogProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(String(expiryDays))
  const setExpiry = useSetExpiry(dealId)
  const inputId = useId()
  const hintId = useId()
  const days = Number(value)
  const valid = isValidExpiryDays(days)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid || setExpiry.isPending) return
    setExpiry.mutate(days, {
      onSuccess: (deal) => {
        toast.success(deal.expiresAt ? `The link now expires on ${formatDate(deal.expiresAt, timeZone)}.` : `Expiry set to ${days} days.`)
        setOpen(false)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(String(expiryDays))
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarClock aria-hidden="true" />
          Change expiry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Change the link expiry</DialogTitle>
            <DialogDescription>
              {expiresAt
                ? `The link expires on ${formatDate(expiresAt, timeZone)}. The tool counts the days from today.`
                : 'The link is not published yet. The expiry starts at publication.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>Days</Label>
            <Input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              required
              value={value}
              aria-invalid={!valid}
              aria-describedby={hintId}
              onChange={(event) => setValue(event.target.value)}
            />
            <p id={hintId} className={valid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
              A whole number from 1 to 365.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid} aria-disabled={setExpiry.isPending || undefined} className="aria-disabled:opacity-50">
              {setExpiry.isPending ? 'Saving' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
