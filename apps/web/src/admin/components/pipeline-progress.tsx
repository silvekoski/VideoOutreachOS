import { AudioLines, Check, Clapperboard, Globe, Link2, PenLine, type LucideIcon } from 'lucide-react'
import { LottiePlayer } from '@/components/lottie-player'
import animation from '../assets/pipeline-animation.json'
import { pipelineSteps, stepLabel, type PipelineStep } from '../lib/pipeline'
import { cn } from '@/lib/utils'

const STEP_ICONS: Record<PipelineStep, LucideIcon> = {
  scrape: Globe,
  'write-script': PenLine,
  audio: AudioLines,
  render: Clapperboard,
  publish: Link2,
}

const STEP_DETAILS: Record<PipelineStep, string> = {
  scrape: 'The tool reads the company website and collects the key facts.',
  'write-script': 'The language model writes the script for each slide.',
  audio: 'The tool makes the voice track for each slide in the voice of the analyst.',
  render: 'The tool puts the slides and the audio together into the video.',
  publish: 'The tool publishes the video page and makes the link.',
}

interface PipelineProgressProps {
  step: string | null
  title?: string
  className?: string
}

export function PipelineProgress({ step, title = 'The tool makes the video', className }: PipelineProgressProps) {
  const steps = pipelineSteps(step)
  const index = steps.findIndex((item) => item.state === 'current')
  const current = steps[index]
  return (
    <section aria-label="Pipeline progress" className={cn('grid gap-4 rounded-xl border bg-card px-4 py-3 print:hidden', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <LottiePlayer animationData={animation} staticFrame={11} className="h-6 w-18" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{title}</p>
          <p role="status" className="text-xs text-muted-foreground">
            {current ? `Now: ${current.label}. ${STEP_DETAILS[current.key]}` : `Now: ${stepLabel(step)}`}
          </p>
        </div>
        {current ? (
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-foreground tabular-nums">
            {`Step ${index + 1} of ${steps.length}`}
          </span>
        ) : null}
      </div>
      {current ? (
        <ol className="grid grid-cols-5" aria-label="Steps">
          {steps.map((item, position) => {
            const Icon = item.state === 'done' ? Check : STEP_ICONS[item.key]
            return (
              <li
                key={item.key}
                aria-current={item.state === 'current' ? 'step' : undefined}
                className="relative grid justify-items-center gap-1.5 text-center"
              >
                {position < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-4 right-[calc(-50%+1.25rem)] left-[calc(50%+1.25rem)] h-0.5 overflow-hidden rounded-full bg-border"
                  >
                    {item.state === 'done' ? <span className="block h-full bg-primary" /> : null}
                    {item.state === 'current' ? (
                      <span className="block h-full w-1/2 bg-primary/70 motion-safe:animate-pulse" />
                    ) : null}
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative grid size-8 place-items-center rounded-full border-2',
                    item.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                    item.state === 'current' && 'border-primary bg-primary/15 text-foreground',
                    item.state === 'pending' && 'border-border text-muted-foreground',
                  )}
                >
                  {item.state === 'current' ? (
                    <span className="absolute inset-0 rounded-full border-2 border-primary motion-safe:animate-ping" />
                  ) : null}
                  <Icon className="size-4" />
                </span>
                <span
                  className={cn(
                    'text-xs',
                    item.state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
                    item.state === 'current' && 'font-semibold',
                  )}
                >
                  {item.label}
                  <span className="sr-only">{item.state === 'done' ? ' (done)' : item.state === 'current' ? ' (now)' : ''}</span>
                </span>
              </li>
            )
          })}
        </ol>
      ) : null}
    </section>
  )
}
