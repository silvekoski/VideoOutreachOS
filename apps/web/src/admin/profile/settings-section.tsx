import { useId, useState } from 'react'
import type { AnalystDto, AnalystPatch, Channel, Lang } from '@mergero/shared'
import { CHANNELS, LANGUAGES } from '@mergero/shared'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUpdateAnalyst } from '../api'
import { languageName } from '../lib/brief'
import { channelLabel } from '../lib/events'
import { isValidExpiryDays } from '../lib/review'

export function SettingsSection({ analyst }: { analyst: AnalystDto }) {
  const update = useUpdateAnalyst(analyst.id)
  const [expiry, setExpiry] = useState(String(analyst.defaultExpiryDays))
  const expiryId = useId()
  const expiryHintId = useId()
  const channelId = useId()
  const briefId = useId()
  const expiryDays = Number(expiry)
  const expiryValid = isValidExpiryDays(expiryDays)

  const save = (patch: AnalystPatch, message: string) => update.mutate(patch, { onSuccess: () => toast.success(message) })

  return (
    <section aria-labelledby="settings-heading" className="grid gap-3">
      <h3 id="settings-heading" className="text-sm font-semibold">
        Defaults
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={expiryId}>Link expiry in days</Label>
          <Input
            id={expiryId}
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            step={1}
            value={expiry}
            aria-invalid={!expiryValid}
            aria-describedby={expiryHintId}
            onChange={(event) => setExpiry(event.target.value)}
            onBlur={() => {
              if (expiryValid && expiryDays !== analyst.defaultExpiryDays)
                save({ defaultExpiryDays: expiryDays }, `New links expire after ${expiryDays} days.`)
            }}
          />
          <p id={expiryHintId} className={expiryValid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
            {expiryValid ? 'For new links.' : 'Enter a whole number from 1 to 365.'}
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={channelId}>Second channel</Label>
          <Select
            value={analyst.defaultSecondChannel}
            onValueChange={(value) =>
              save({ defaultSecondChannel: value as Channel }, `Second channel set to ${channelLabel(value)}.`)
            }
          >
            <SelectTrigger id={channelId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {channelLabel(channel)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={briefId}>Meeting brief language</Label>
          <Select
            value={analyst.briefLanguage}
            onValueChange={(value) =>
              save({ briefLanguage: value as Lang }, `Meeting briefs use ${languageName(value as Lang)}.`)
            }
          >
            <SelectTrigger id={briefId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {languageName(lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  )
}
