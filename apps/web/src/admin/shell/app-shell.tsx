import { Outlet, useLocation } from 'react-router'
import { cn } from '@/lib/utils'
import { useLiveUpdates } from '../api'
import { TopBar } from './top-bar'

export function AppShell() {
  useLiveUpdates()
  const { pathname } = useLocation()
  const width = pathname === '/' ? 'max-w-(--breakpoint-2xl)' : 'max-w-6xl'
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="sticky top-0 z-20 bg-background print:hidden">
        <div className={cn('mx-auto w-full px-4 pt-3 pb-2 md:px-6 md:pt-4 md:pb-3', width)}>
          <TopBar />
        </div>
      </div>
      <main
        id="main"
        tabIndex={-1}
        className={cn('mx-auto grid w-full grid-cols-1 gap-4 p-4 outline-none md:p-6 print:max-w-none print:p-0', width)}
      >
        <Outlet />
      </main>
    </div>
  )
}
