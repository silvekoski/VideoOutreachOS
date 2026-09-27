import { useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentAnalyst } from '../analyst-context'
import { initials } from '../lib/format'
import { ProfileSheet } from '../profile/profile-sheet'
import { DemoProvidersGroup } from './demo-providers'
import { useDemoProviders } from './use-demo-providers'

export function AccountMenu() {
  const { analyst, analysts, loading, setAnalystId } = useCurrentAnalyst()
  const demo = useDemoProviders()
  const [profileOpen, setProfileOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={`Account menu${analyst ? `, ${analyst.name}` : ''}${demo ? ', demo providers in use' : ''}`}
          >
            <Avatar>
              {analyst?.photoUrl ? <AvatarImage src={analyst.photoUrl} alt="" /> : null}
              <AvatarFallback className="font-medium">
                {analyst ? initials(analyst.name) : <UserRound aria-hidden="true" />}
              </AvatarFallback>
              {demo ? <AvatarBadge className="bg-amber-500" /> : null}
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="grid gap-0.5">
            <span className="truncate text-sm text-foreground">
              {analyst?.name ?? (loading ? 'Loading analysts' : 'No analysts')}
            </span>
            {analyst?.email ? <span className="truncate font-normal">{analyst.email}</span> : null}
          </DropdownMenuLabel>
          <DropdownMenuItem disabled={!analyst} onSelect={() => setProfileOpen(true)}>
            <UserRound aria-hidden="true" />
            Profile menu
          </DropdownMenuItem>
          {analysts.length > 1 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Switch analyst</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={analyst ? String(analyst.id) : ''}
                onValueChange={(value) => setAnalystId(Number(value))}
              >
                {analysts.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </>
          ) : null}
          {demo ? <DemoProvidersGroup demo={demo} /> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} returnFocusTo={trigger} />
    </>
  )
}
