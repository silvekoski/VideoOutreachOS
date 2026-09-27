import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error'
  return (
    <main className="mx-auto grid max-w-xl gap-3 p-6">
      <title>Error | Mergero video tool</title>
      <h1 className="text-lg font-semibold">The page stopped with an error</h1>
      <p role="alert" className="text-sm text-muted-foreground">
        {message}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Go to the Inbox</Link>
        </Button>
      </div>
    </main>
  )
}
