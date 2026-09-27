import { Hono } from 'hono'
import { transaction } from '../../db/index.ts'
import type { Db } from '../../db/index.ts'
import { getAnalyst, introUpload, markClonePending, startIntro } from '../../domain/analysts.ts'
import { getDeal, isExpired } from '../../domain/deals.ts'
import { DomainError } from '../../domain/errors.ts'
import { advance } from '../../domain/pipeline.ts'
import { getJob, retryJob } from '../../queue/index.ts'
import type { AnyJob, JobType } from '../../queue/index.ts'
import { inboxDto } from '../../views/inbox.ts'
import { analystFromQuery } from './analysts.ts'
import { adminContext } from './context.ts'
import { parseId } from './http.ts'

const PIPELINE_JOBS: ReadonlySet<JobType> = new Set(['scrape', 'write-script', 'audio', 'render'])

export const inboxRoutes = new Hono()

function reopen(db: Db, job: AnyJob, now: Date): void {
  if (job.type === 'audio' && job.payload.kind === 'intro') {
    const { analystId, lang, recordedAt } = job.payload
    const intro = introUpload(getAnalyst(db, analystId)?.intros[lang])
    if (intro?.status === 'failed' && intro.recordedAt === recordedAt) {
      startIntro(db, analystId, lang, { recordedAt, transcript: intro.transcript }, now)
    }
    return
  }
  if (job.type === 'audio' && job.payload.kind === 'clone') {
    const analyst = getAnalyst(db, job.payload.analystId)
    if (analyst?.cloneStatus === 'failed' && analyst.voiceSampleFile !== null) markClonePending(db, analyst.id, now)
    return
  }
  if (job.dealId === null || !PIPELINE_JOBS.has(job.type)) return
  const deal = getDeal(db, job.dealId)
  if (deal && deal.publishedVersion === null) advance(db, deal.id, now)
}

inboxRoutes.get('/inbox', (c) => {
  const { db, now } = adminContext()
  return c.json(inboxDto(db, analystFromQuery(c, db), now))
})

inboxRoutes.post('/jobs/:id/retry', (c) => {
  const { db, now } = adminContext()
  const id = parseId(c.req.param('id'), 'job ID')
  transaction(db, () => {
    const job = getJob(db, id)
    if (!job) throw new DomainError(404, 'The job does not exist')
    const deal = job.dealId !== null && PIPELINE_JOBS.has(job.type) ? getDeal(db, job.dealId) : null
    if (deal && isExpired(deal, now)) throw new DomainError(409, 'The link has expired')
    const retried = retryJob(db, id, now)
    if (!retried) throw new DomainError(409, `Only a failed job can be retried. This job is ${job.status}.`)
    reopen(db, retried, now)
  })
  return c.body(null, 204)
})
