import type { RefObject } from 'react'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCurrentAnalyst } from '../analyst-context'
import { AccountSection } from './account-section'
import { IntroSection } from './intro-section'
import { SettingsSection } from './settings-section'
import { TemplatesSection } from './templates-section'
import { VoiceSection } from './voice-section'

interface ProfileSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusTo: RefObject<HTMLElement | null>
}

export function ProfileSheet({ open, onOpenChange, returnFocusTo }: ProfileSheetProps) {
  const { analyst } = useCurrentAnalyst()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusTo.current?.focus()
        }}
      >
        <SheetHeader className="border-b">
          <SheetTitle>Profile menu</SheetTitle>
          <SheetDescription>
            {analyst ? `${analyst.name}${analyst.email ? `, ${analyst.email}` : ''}` : 'No analyst selected.'}
          </SheetDescription>
        </SheetHeader>
        {analyst ? (
          <div className="grid gap-5 p-4">
            <AccountSection key={analyst.id} analyst={analyst} />
            <Separator />
            <IntroSection analyst={analyst} />
            <Separator />
            <VoiceSection analyst={analyst} />
            <Separator />
            <SettingsSection key={analyst.id} analyst={analyst} />
            <Separator />
            <TemplatesSection enabled={open} />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
