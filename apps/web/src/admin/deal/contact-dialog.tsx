import { useId, useState, type FormEvent } from 'react'
import type { ContactPatch, DealDetailDto } from '@mergero/shared'
import { isClosedStatus } from '@mergero/shared'
import { UserPen } from 'lucide-react'
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
import { useUpdateContact } from '../api'

type Field = keyof Required<ContactPatch>

const FIELDS: { key: Field; label: string; type?: string; required?: boolean }[] = [
  { key: 'company', label: 'Company name', required: true },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'businessId', label: 'Business ID' },
  { key: 'nace', label: 'NACE code' },
  { key: 'ownerName', label: 'Contact name', required: true },
  { key: 'ownerRole', label: 'Role' },
  { key: 'ownerEmail', label: 'Email', type: 'email' },
  { key: 'ownerPhone', label: 'Phone', type: 'tel' },
]

function valuesOf(deal: DealDetailDto): Record<Field, string> {
  return {
    company: deal.company,
    website: deal.website ?? '',
    businessId: deal.businessId ?? '',
    nace: deal.nace ?? '',
    ownerName: deal.ownerName,
    ownerRole: deal.ownerRole ?? '',
    ownerEmail: deal.ownerEmail ?? '',
    ownerPhone: deal.ownerPhone ?? '',
  }
}

export function ContactDialog({ deal }: { deal: DealDetailDto }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(() => valuesOf(deal))
  const update = useUpdateContact(deal.id)
  const baseId = useId()
  const frozen = deal.publishedVersion !== null || isClosedStatus(deal.status)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (update.isPending) return
    const saved = valuesOf(deal)
    const patch: ContactPatch = Object.fromEntries(
      FIELDS.filter(({ key }) => values[key].trim() !== saved[key]).map(({ key }) => [key, values[key].trim()]),
    )
    if (Object.keys(patch).length === 0) {
      setOpen(false)
      return
    }
    update.mutate(patch, {
      onSuccess: () => {
        toast.success('Pipedrive has the new contact data.')
        setOpen(false)
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValues(valuesOf(deal))
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPen aria-hidden="true" />
          Edit contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit the contact data</DialogTitle>
            <DialogDescription>
              {frozen
                ? 'The tool saves the change in Pipedrive. The video keeps its names, so only the role, email and phone change here.'
                : 'The tool saves the change in Pipedrive, then reads the deal again. A new name changes the slides and the scripts.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(({ key, label, type, required }) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`${baseId}-${key}`}>{label}</Label>
                <Input
                  id={`${baseId}-${key}`}
                  type={type ?? 'text'}
                  required={required}
                  value={values[key]}
                  onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" aria-disabled={update.isPending || undefined} className="aria-disabled:opacity-50">
              {update.isPending ? 'Saving' : 'Save to Pipedrive'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
