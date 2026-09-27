import { SidebarTrigger } from '@/components/ui/sidebar'
import { ProfileSheet } from '../profile/profile-sheet'
import { AlertsMenu } from './alerts-menu'
import { AnalystSelect } from './analyst-select'
import { CommandPalette } from './command-palette'
import { ProviderBadge } from './provider-badge'
import { ThemeMenu } from './theme-menu'

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur print:hidden">
      <SidebarTrigger />
      <AnalystSelect />
      <ProviderBadge />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <CommandPalette />
        <AlertsMenu />
        <ThemeMenu />
        <ProfileSheet />
      </div>
    </header>
  )
}
