import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { PageHeader } from '../components/page-header'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="This address has no page in the admin panel." />
      <div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">Go to the deals</Link>
        </Button>
      </div>
    </>
  )
}
