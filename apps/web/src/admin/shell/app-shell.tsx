import { ChartLine, Inbox, LayoutList } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import logoOnLight from '../../../../../config/mergero-logo-dark.svg'
import logoOnDark from '../../../../../config/mergero-logo-white.svg'
import { useInbox } from '../api'
import { useCurrentAnalyst } from '../analyst-context'
import { TopBar } from './top-bar'

const NAV = [
  { to: '/', label: 'Inbox', icon: Inbox, match: (path: string) => path === '/' },
  { to: '/deals', label: 'Deals', icon: LayoutList, match: (path: string) => path.startsWith('/deals') },
  { to: '/metrics', label: 'Metrics', icon: ChartLine, match: (path: string) => path.startsWith('/metrics') },
] as const

function AppSidebar() {
  const { pathname } = useLocation()
  const { analystId } = useCurrentAnalyst()
  const inbox = useInbox(analystId)
  const { isMobile, setOpenMobile } = useSidebar()
  const inboxCount = inbox.data?.groups.reduce((sum, group) => sum + group.rows.length, 0) ?? 0

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-1.5">
          <span
            aria-hidden="true"
            className="hidden size-6 shrink-0 place-items-center rounded-md bg-primary font-heading text-sm font-semibold text-primary-foreground group-data-[collapsible=icon]:grid"
          >
            M
          </span>
          <span className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
            <img src={logoOnLight} alt="Mergero" width={500} height={68} className="h-3.5 w-auto dark:hidden" />
            <img src={logoOnDark} alt="Mergero" width={500} height={68} className="hidden h-3.5 w-auto dark:block" />
            <span className="truncate text-xs font-medium text-muted-foreground">Video tool</span>
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Main">
              <SidebarMenu>
                {NAV.map((item) => {
                  const active = item.match(pathname)
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/'}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => {
                            if (isMobile) setOpenMobile(false)
                          }}
                        >
                          <item.icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {item.to === '/' && inboxCount > 0 ? (
                        <SidebarMenuBadge>
                          {inboxCount}
                          <span className="sr-only"> items need an action</span>
                        </SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

export function AppShell() {
  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <AppSidebar />
      <div className="relative flex min-w-0 flex-1 flex-col bg-background">
        <TopBar />
        <main id="main" tabIndex={-1} className="mx-auto grid w-full max-w-6xl gap-4 p-4 outline-none md:p-6 print:max-w-none print:p-0">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  )
}
