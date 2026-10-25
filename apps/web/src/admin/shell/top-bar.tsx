import { Link, NavLink, useLocation } from 'react-router'
import { ChartColumn, Clapperboard, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Brand } from '@/components/brand'
import { useInbox } from '../api'
import { useCurrentAnalyst } from '../analyst-context'
import { AccountMenu } from './account-menu'
import { AlertsMenu } from './alerts-menu'
import { CommandPalette } from './command-palette'
import { QueueMenu } from './queue-menu'
import { ThemeMenu } from './theme-menu'

const NAV = [
  { to: '/', label: 'Deals', icon: LayoutDashboard, match: (path: string) => path === '/' || path.startsWith('/deals') },
  { to: '/metrics', label: 'Metrics', icon: ChartColumn, match: (path: string) => path.startsWith('/metrics') },
] as const

function useInboxCount() {
  const { analystId } = useCurrentAnalyst()
  const inbox = useInbox(analystId)
  return inbox.data?.groups.reduce((sum, group) => sum + group.rows.length, 0) ?? 0
}

export function Sidebar() {
  const { pathname } = useLocation()
  const inboxCount = useInboxCount()

  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-1 border-r bg-card px-3.5 py-5 md:flex print:hidden">
      <Link to="/" className="mb-5 rounded-md px-2">
        <Brand />
      </Link>
      <nav aria-label="Main" className="grid gap-0.5">
        {NAV.map((item) => {
          const active = item.match(pathname)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
                active
                  ? 'bg-primary/10 font-medium text-primary before:absolute before:inset-y-2 before:-left-3.5 before:w-[3px] before:rounded-r before:bg-primary'
                  : 'text-foreground/80 hover:bg-muted',
              )}
            >
              <item.icon aria-hidden="true" className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')} />
              {item.label}
              {item.to === '/' && inboxCount > 0 ? (
                <span className="ml-auto rounded-full bg-status-good/12 px-2 py-px text-[11px] font-medium text-status-good tabular-nums">
                  {inboxCount}
                  <span className="sr-only"> deals need an action today</span>
                </span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>
      <div className="mt-auto rounded-2xl bg-[radial-gradient(120%_90%_at_0%_0%,#3b6cf6,#1e3a8a_70%)] p-4 text-white">
        <span className="mb-3 grid size-7 place-items-center rounded-lg bg-white text-primary">
          <Clapperboard aria-hidden="true" className="size-3.5" />
        </span>
        <p className="text-sm font-semibold">Personal video, at scale</p>
        <p className="mt-1 text-xs leading-relaxed text-blue-100/80">
          Each prospect gets a video made for them. You review it before anything is sent.
        </p>
      </div>
    </aside>
  )
}

export function TopBar() {
  const { pathname } = useLocation()
  const inboxCount = useInboxCount()

  return (
    <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur print:hidden">
      <div className="flex h-16 items-center gap-3 px-4 md:px-7">
        <Link to="/" className="rounded-md md:hidden">
          <Brand className="[&>span:last-child]:hidden" />
        </Link>
        <nav aria-label="Main" className="flex gap-0.5 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm',
                item.match(pathname) ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground',
              )}
            >
              {item.label}
              {item.to === '/' && inboxCount > 0 ? <span className="text-xs tabular-nums">{inboxCount}</span> : null}
            </NavLink>
          ))}
        </nav>
        <CommandPalette />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <QueueMenu />
          <AlertsMenu />
          <ThemeMenu />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
