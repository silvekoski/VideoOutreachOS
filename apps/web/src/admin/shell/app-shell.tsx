import { Outlet } from 'react-router'
import { useLiveUpdates } from '../api'
import { Sidebar, TopBar } from './top-bar'

export function AppShell() {
  useLiveUpdates()
  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto grid w-full max-w-(--breakpoint-2xl) grid-cols-1 gap-5 p-4 outline-none md:px-7 md:py-6 print:max-w-none print:p-0"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
