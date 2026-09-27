import { briefOutputJsonSchema, briefOutputSchema, checkBriefText } from '@mergero/shared'
import type { MeetingBrief } from '@mergero/shared'
import { buildBriefData, lastOwnerEventId, newestBrief, saveBrief } from '../domain/brief-data.ts'
import { getDeal, isExpired, requireDeal } from '../domain/deals.ts'
import { log } from '../log.ts'
import { askModel } from './ask-model.ts'
import { briefTextPrompt } from './prompts.ts'
import type { JobHandler } from './types.ts'

export const writeBriefHandler: JobHandler<'write-brief'> = {
  async run(job, ctx) {
    const { dealId, lastEventId } = job.payload
    const now = ctx.now()
    const deal = requireDeal(ctx.db, dealId)
    if (isExpired(deal, now)) {
      log.info('meeting brief skipped, the link has expired', { dealId })
      return
    }
    const newest = newestBrief(ctx.db, dealId)
    if (newest && newest.lastEventId >= lastEventId && newest.brief.header.summary !== null) {
      log.info('meeting brief skipped, a brief already covers these events', { dealId, lastEventId, version: newest.version })
      return
    }
    const covered = Math.max(lastEventId, lastOwnerEventId(ctx.db, dealId) ?? 0)
    const data = buildBriefData(ctx.db, dealId, now)
    const input = { task: 'brief-text', lang: data.language, brief: data }
    const answer = await askModel(
      ctx.providers.model,
      {
        system: briefTextPrompt(data.language),
        input,
        schemaName: 'brief-text',
        jsonSchema: briefOutputJsonSchema,
        schema: briefOutputSchema,
        check: (value) => checkBriefText(value, data.language, input),
      },
      { dealId },
    )
    const brief: MeetingBrief = {
      ...data,
      header: { ...data.header, summary: answer.ok ? answer.value.summary.trim() : null },
      questions: answer.ok ? answer.value.questions.map((question) => question.trim()) : null,
    }
    const saved = saveBrief(ctx.db, dealId, brief, covered, ctx.now())
    log.info('meeting brief written', {
      dealId,
      version: saved.version,
      lastEventId: covered,
      language: data.language,
      summary: answer.ok,
      interest: data.header.interest,
    })
  },

  async onFinalFailure(job, _error, ctx) {
    const { dealId, lastEventId } = job.payload
    const now = ctx.now()
    const deal = getDeal(ctx.db, dealId)
    if (!deal || deal.meetingAt === null || isExpired(deal, now)) return
    const newest = newestBrief(ctx.db, dealId)
    if (newest && newest.lastEventId >= lastEventId) return
    const covered = Math.max(lastEventId, lastOwnerEventId(ctx.db, dealId) ?? 0)
    const saved = saveBrief(ctx.db, dealId, { ...buildBriefData(ctx.db, dealId, now), questions: null }, covered, now)
    log.warn('meeting brief written without a summary, the model failed', { dealId, version: saved.version, lastEventId: covered })
  },
}
