import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useCurrentAnalyst } from '../analyst-context'
import { IntroSection } from './intro-section'
import { SettingsSection } from './settings-section'
import { TemplatesSection } from './templates-section'
import { VoiceSection } from './voice-section'

export function ProfileSheet() {
  const [open, setOpen] = useState(false)
  const { analyst } = useCurrentAnalyst()
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Profile menu">
          <UserRound aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>Profile menu</SheetTitle>
          <SheetDescription>
            {analyst ? `${analyst.name}${analyst.email ? `, ${analyst.email}` : ''}` : 'No analyst selected.'}
          </SheetDescription>
        </SheetHeader>
        {analyst ? (
          <div className="grid gap-5 p-4">
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
