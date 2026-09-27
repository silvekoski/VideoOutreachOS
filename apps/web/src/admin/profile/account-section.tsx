import { useId, useRef, useState, type FormEvent } from 'react'
import type { AnalystDto } from '@mergero/shared'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateAnalyst, useUploadPhoto } from '../api'
import { initials } from '../lib/format'

const NAME_MAX = 100

export function AccountSection({ analyst }: { analyst: AnalystDto }) {
  const update = useUpdateAnalyst(analyst.id)
  const uploadPhoto = useUploadPhoto(analyst.id)
  const [name, setName] = useState(analyst.name)
  const photoRef = useRef<HTMLInputElement>(null)
  const nameId = useId()
  const nameHintId = useId()
  const trimmed = name.trim()
  const nameValid = trimmed.length > 0 && trimmed.length <= NAME_MAX

  const saveName = (event?: FormEvent) => {
    event?.preventDefault()
    if (nameValid && trimmed !== analyst.name)
      update.mutate({ name: trimmed }, { onSuccess: (updated) => toast.success(`Name changed to ${updated.name}.`) })
  }

  return (
    <section aria-labelledby="account-heading" className="grid gap-3">
      <h3 id="account-heading" className="text-sm font-semibold">
        Account
      </h3>
      <div className="flex items-center gap-3">
        <Avatar className="size-16">
          {analyst.photoUrl ? <AvatarImage src={analyst.photoUrl} alt="" /> : null}
          <AvatarFallback className="text-lg font-medium">{initials(analyst.name)}</AvatarFallback>
        </Avatar>
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-disabled={uploadPhoto.isPending || undefined}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (!uploadPhoto.isPending) photoRef.current?.click()
          }}
        >
          {uploadPhoto.isPending ? 'Uploading' : analyst.photoUrl ? 'Replace the photo' : 'Upload a photo'}
        </Button>
        <input
          ref={photoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Profile photo"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) uploadPhoto.mutate(file, { onSuccess: () => toast.success('Photo saved.') })
          }}
        />
      </div>
      <form onSubmit={saveName} className="grid gap-1.5">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={NAME_MAX}
          autoComplete="name"
          aria-invalid={!nameValid}
          aria-describedby={nameHintId}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => saveName()}
        />
        <p id={nameHintId} className={nameValid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
          {nameValid ? 'Buyers see this name on your video pages. A Pipedrive sync does not change it.' : 'Enter a name.'}
        </p>
      </form>
    </section>
  )
}
