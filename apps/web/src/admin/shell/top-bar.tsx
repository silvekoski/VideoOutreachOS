import { Link, NavLink, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { MergeroLogo } from '@/components/mergero-logo'
import { useInbox } from '../api'
import { useCurrentAnalyst } from '../analyst-context'
import { AccountMenu } from './account-menu'
import { AlertsMenu } from './alerts-menu'
import { CommandPalette } from './command-palette'
import { QueueMenu } from './queue-menu'
import { ThemeMenu } from './theme-menu'

const NAV = [
  { to: '/', label: 'Deals', match: (path: string) => path === '/' || path.startsWith('/deals') },
  { to: '/metrics', label: 'Metrics', match: (path: string) => path.startsWith('/metrics') },
] as const

function Divider() {
  return <span aria-hidden="true" className="hidden h-5 w-px bg-border md:block" />
}

export function TopBar() {
  const { pathname } = useLocation()
  const { analystId } = useCurrentAnalyst()
  const inbox = useInbox(analystId)
  const inboxCount = inbox.data?.groups.reduce((sum, group) => sum + group.rows.length, 0) ?? 0

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-3xl border bg-card p-1.5 pl-4 md:h-15 md:w-fit md:flex-nowrap md:rounded-full md:pl-6">
      <Link to="/" className="flex items-baseline gap-2.5 rounded-md">
        <MergeroLogo replayKey={pathname} className="h-4 md:h-5" />
        <span className="hidden text-[13px] font-medium text-muted-foreground sm:inline">Video tool</span>
      </Link>
      <Divider />
      <nav aria-label="Main" className="order-last grid w-full grid-cols-2 gap-0.5 md:order-none md:flex md:w-auto">
        {NAV.map((item) => {
          const active = item.match(pathname)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
              {item.to === '/' && inboxCount > 0 ? (
                <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1.5 text-[10px] leading-none font-semibold text-primary-foreground">
                  {inboxCount}
                  <span className="sr-only"> deals need an action today</span>
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>
      <Divider />
      <div className="ml-auto flex shrink-0 items-center gap-0.5 md:ml-0">
        <CommandPalette />
        <QueueMenu />
        <AlertsMenu />
        <ThemeMenu />
        <AccountMenu />
      </div>
    </header>
  )
}
