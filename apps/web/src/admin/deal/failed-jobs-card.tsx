import type { FailedJobDto } from '@mergero/shared'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRetryJob } from '../api'
import { ShapeIcon } from '../components/shape-icon'
import { formatDateTime, timeZoneNote } from '../lib/format'
import { stepLabel } from '../lib/pipeline'
import { DealCard } from './deal-card'

export function FailedJobsList({ jobs, timeZone }: { jobs: FailedJobDto[]; timeZone?: string }) {
  const retry = useRetryJob()
  return (
    <ul className="grid gap-2">
      {jobs.map((job) => (
        <li key={job.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-destructive/30 px-3 py-2 text-sm">
          <ShapeIcon shape="cross" className="mt-1 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{`Failed: ${stepLabel(job.type)}`}</p>
            <p className="text-xs break-words text-muted-foreground">{job.error}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(job.updatedAt, timeZone)}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={retry.isPending && retry.variables === job.id}
            onClick={() =>
              retry.mutate(job.id, {
                onSuccess: () => {
                  toast.success('Retry queued.')
                  document.getElementById('page-title')?.focus()
                },
              })
            }
          >
            <RotateCcw aria-hidden="true" />
            Retry
          </Button>
        </li>
      ))}
    </ul>
  )
}

export function FailedJobsCard({ jobs, timeZone }: { jobs: FailedJobDto[]; timeZone: string }) {
  return (
    <DealCard id="failed-jobs" title="Failed jobs" description={timeZoneNote(timeZone)}>
      <FailedJobsList jobs={jobs} timeZone={timeZone} />
    </DealCard>
  )
}
