process.env.DISABLE_TELEMETRY = 'true'

import { setTimeout as sleep } from 'node:timers/promises'
import { renderTemplatePreviews, renderTimeline } from '@mergero/scene'
import { closeDb, getDb } from './db/index.ts'
import { ensureTemplatePreviews } from './jobs/render.ts'
import { recoverStoppedJobs, runJob } from './jobs/runner.ts'
import type { JobContext } from './jobs/types.ts'
import { log } from './log.ts'
import { paths } from './paths.ts'
import { createProviders } from './providers/index.ts'
import { claimNext, enqueuePeriodicJobs, jobKeys } from './queue/index.ts'

const IDLE_MS = 1000

const wake = new AbortController()
let stopping = false

function stop(signal: NodeJS.Signals): void {
  if (stopping) {
    log.warn('second stop signal, the worker exits now', { signal })
    process.exit(130)
  }
  stopping = true
  log.info('the worker stops after the running job', { signal })
  wake.abort()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

async function idle(): Promise<void> {
  await sleep(IDLE_MS, undefined, { signal: wake.signal }).catch(() => undefined)
}

async function main(): Promise<void> {
  const db = getDb()
  const providers = createProviders()
  const ctx: JobContext = {
    db,
    providers,
    scene: { renderTimeline, renderTemplatePreviews },
    now: () => new Date(),
    sleep: (ms) => sleep(ms),
  }
  await recoverStoppedJobs(ctx)
  await ensureTemplatePreviews(ctx).catch((error: unknown) => log.error('the template preview check failed', { error }))
  log.info('worker started', { database: paths.database, pid: process.pid })

  let periodic = ''
  while (!stopping) {
    try {
      const now = ctx.now()
      const keys = `${jobKeys.sweep(now)} ${jobKeys.backup(now)}`
      if (keys !== periodic) {
        enqueuePeriodicJobs(db, now)
        periodic = keys
      }
      const job = claimNext(db, ctx.now())
      if (job) {
        await runJob(ctx, job)
        continue
      }
    } catch (error) {
      log.error('worker loop error', { error })
    }
    await idle()
  }

  await providers.mgx.close().catch((error: unknown) => log.warn('the MGX connection did not close cleanly', { error }))
  closeDb()
  log.info('worker stopped')
}

main().catch((error: unknown) => {
  log.error('worker crashed', { error })
  closeDb()
  process.exitCode = 1
})
