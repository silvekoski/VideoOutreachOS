import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/theme'
import { ApiRequestError, errorMessage } from './api'
import { AnalystProvider } from './analyst-provider'
import { DealPage } from './pages/deal-page'
import { DealsPage } from './pages/deals-page'
import { MetricsPage } from './pages/metrics-page'
import { NotFoundPage } from './pages/not-found-page'
import { ReviewPage } from './pages/review-page'
import { RouteError } from './pages/route-error'
import { AppShell } from './shell/app-shell'

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent !== true) toast.error(errorMessage(error))
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (failures, error) =>
        !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) && failures < 2,
    },
  },
})

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DealsPage /> },
      { path: 'deals', element: <Navigate to="/" replace /> },
      { path: 'deals/:id', element: <DealPage /> },
      { path: 'deals/:id/review', element: <ReviewPage /> },
      { path: 'metrics', element: <MetricsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      enableSystem
      disableTransitionOnChange
      storageKey={THEME_STORAGE_KEY}
      scriptProps={{ type: 'application/json' }}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AnalystProvider>
            <RouterProvider router={router} />
          </AnalystProvider>
          <Toaster position="bottom-right" closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
