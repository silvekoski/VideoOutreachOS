import { DomainError } from '../domain/errors.ts'
import { advance } from '../domain/pipeline.ts'
import { log } from '../log.ts'
import { NonRetryableError, completeJob, failJob, resetRunningJobs } from '../queue/index.ts'
import type { AnyJob, JobType } from '../queue/index.ts'
import { audioHandler } from './audio.ts'
import { backupHandler } from './backup.ts'
import { pipedriveWriteHandler } from './pipedrive-write.ts'
import { renderHandler } from './render.ts'
import { scrapeHandler } from './scrape.ts'
import { sweepHandler } from './sweep.ts'
import type { JobContext, JobHandler } from './types.ts'
import { writeBriefHandler } from './write-brief.ts'
import { writeScriptHandler } from './write-script.ts'

const HANDLERS: { [T in JobType]: JobHandler<T> } = {
  scrape: scrapeHandler,
  'write-script': writeScriptHandler,
  'write-brief': writeBriefHandler,
  audio: audioHandler,
  render: renderHandler,
  'pipedrive-write': pipedriveWriteHandler,
  sweep: sweepHandler,
  backup: backupHandler,
}

function handlerFor<T extends JobType>(type: T): JobHandler<T> {
  return HANDLERS[type]
}

function pipelineDealId(job: AnyJob): number | null {
  switch (job.type) {
    case 'scrape':
    case 'write-script':
      return job.payload.dealId
    case 'audio':
      return job.payload.kind === 'slides' ? job.payload.dealId : null
    case 'render':
      return job.payload.kind === 'deal' ? job.payload.dealId : null
    default:
      return null
  }
}

function jobFields(job: AnyJob): Record<string, unknown> {
  return { jobId: job.id, type: job.type, key: job.key, attempt: job.attempts, dealId: job.dealId, analystId: job.analystId }
}

async function finalFailure(ctx: JobContext, job: AnyJob, error: unknown): Promise<void> {
  try {
    await handlerFor(job.type).onFinalFailure?.(job, error, ctx)
  } catch (cleanupError) {
    log.error('the final failure step of a job failed', { ...jobFields(job), error: cleanupError })
  }
  const dealId = pipelineDealId(job)
  if (dealId === null) return
  try {
    advance(ctx.db, dealId, ctx.now())
  } catch (advanceError) {
    log.error('the pipeline could not advance after a failed job', { ...jobFields(job), error: advanceError })
  }
}

export async function runJob(ctx: JobContext, job: AnyJob): Promise<void> {
  const fields = jobFields(job)
  const started = performance.now()
  const elapsed = () => Math.round(performance.now() - started)
  log.info('job started', fields)
  try {
    await handlerFor(job.type).run(job, ctx)
  } catch (error) {
    const failure = error instanceof DomainError ? new NonRetryableError(error.message, { cause: error }) : error
    const outcome = failJob(ctx.db, job.id, failure, ctx.now())
    if (outcome?.status === 'queued') {
      log.warn('job failed, it runs again later', { ...fields, durationMs: elapsed(), runAt: outcome.runAt, error: outcome.error })
    } else {
      log.error('job failed', { ...fields, durationMs: elapsed(), error: failure })
      if (outcome?.status === 'failed') await finalFailure(ctx, job, failure)
    }
    return
  }
  completeJob(ctx.db, job.id, ctx.now())
  log.info('job done', { ...fields, durationMs: elapsed() })
}

export async function recoverStoppedJobs(ctx: JobContext): Promise<void> {
  const { requeued, failed } = resetRunningJobs(ctx.db, ctx.now())
  if (requeued === 0 && failed.length === 0) return
  log.warn('jobs of a stopped worker recovered', { requeued, failed: failed.map((job) => job.id) })
  for (const job of failed) await finalFailure(ctx, job, new Error(job.error ?? 'The worker stopped while the job was running'))
}
