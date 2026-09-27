import {
  LANGUAGE_LOCALES,
  OUTREACH_LINK,
  checkOutreach,
  countryTimeZone,
  fallbackOutreach,
  outreachOutputJsonSchema,
  outreachOutputSchema,
} from '@mergero/shared'
import type { Channel, OutreachContext, OutreachDto } from '@mergero/shared'
import type { Db } from '../db/index.ts'
import { askModel } from '../jobs/ask-model.ts'
import { outreachPrompt } from '../jobs/prompts.ts'
import { log } from '../log.ts'
import { ModelError } from '../providers/featherless.ts'
import type { LanguageModelClient } from '../providers/types.ts'
import { videoLink } from '../views/urls.ts'
import { getAnalyst } from './analysts.ts'
import { isExpired, requireDeal } from './deals.ts'
import { DomainError } from './errors.ts'
import { getTimeline } from './timelines.ts'

async function draft(model: LanguageModelClient, context: OutreachContext, dealId: number) {
  try {
    const answer = await askModel(
      model,
      {
        system: outreachPrompt(context),
        input: { task: 'outreach', context },
        schemaName: 'outreach',
        jsonSchema: outreachOutputJsonSchema,
        schema: outreachOutputSchema,
        check: (value) => checkOutreach(value, context),
      },
      { dealId, channel: context.channel },
    )
    if (answer.ok) return { ...answer.value, drafted: 'model' as const }
  } catch (error) {
    if (!(error instanceof ModelError)) throw error
    log.warn('outreach model failed', { dealId, channel: context.channel, error: error.message })
  }
  return { ...fallbackOutreach(context), drafted: 'template' as const }
}

export async function writeOutreach(db: Db, model: LanguageModelClient, dealId: number, channel: Channel, now: Date): Promise<OutreachDto> {
  const deal = requireDeal(db, dealId)
  if (deal.publishedVersion === null || deal.expiresAt === null) throw new DomainError(409, 'The link exists after publication')
  if (isExpired(deal, now)) throw new DomainError(409, 'The link has expired')
  const lang = deal.pageLanguage
  const segments = getTimeline(db, dealId, deal.publishedVersion)?.timeline.segments ?? []
  const context: OutreachContext = {
    lang,
    channel,
    company: deal.snapshot.company,
    ownerName: deal.snapshot.ownerName,
    ownerFirstName: deal.snapshot.ownerFirstName,
    analystName: getAnalyst(db, deal.analystId)?.name ?? 'Mergero',
    expiresOn: new Intl.DateTimeFormat(LANGUAGE_LOCALES[lang], { dateStyle: 'long', timeZone: countryTimeZone(deal.country) }).format(
      new Date(deal.expiresAt),
    ),
    companyLines: segments.flatMap((segment) =>
      segment.variables.template === 'your-company' ? segment.variables.lines.map((line) => line.trim()).filter(Boolean) : [],
    ),
  }
  const { subject, message, drafted } = await draft(model, context, dealId)
  return {
    channel,
    lang,
    subject: channel === 'email' ? subject.trim() : null,
    message: message.trim().replace(OUTREACH_LINK, videoLink(deal.linkCode, channel)),
    drafted,
  }
}
