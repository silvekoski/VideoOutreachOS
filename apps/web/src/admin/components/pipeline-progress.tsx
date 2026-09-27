import { LottiePlayer } from '@/components/lottie-player'
import animation from '../assets/pipeline-animation.json'
import { pipelineSteps, stepLabel } from '../lib/pipeline'
import { ShapeIcon } from './shape-icon'
import { cn } from '@/lib/utils'

interface PipelineProgressProps {
  step: string | null
  title?: string
  className?: string
}

export function PipelineProgress({ step, title = 'The tool makes the video', className }: PipelineProgressProps) {
  const steps = pipelineSteps(step)
  const known = steps.some((item) => item.state === 'current')
  return (
    <section
      aria-label="Pipeline progress"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 print:hidden', className)}
    >
      <LottiePlayer animationData={animation} staticFrame={11} className="h-6 w-18" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p role="status" className="text-xs text-muted-foreground">
          {`Now: ${stepLabel(step)}`}
        </p>
      </div>
      {known ? (
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Steps">
          {steps.map((item) => (
            <li
              key={item.key}
              aria-current={item.state === 'current' ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-1',
                item.state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
                item.state === 'current' && 'font-medium',
              )}
            >
              <ShapeIcon shape={item.state === 'done' ? 'check' : item.state === 'current' ? 'circle-half' : 'circle-outline'} />
              {item.label}
              <span className="sr-only">{item.state === 'done' ? ' (done)' : item.state === 'current' ? ' (now)' : ''}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
