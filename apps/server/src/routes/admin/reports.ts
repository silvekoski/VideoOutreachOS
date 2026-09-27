import path from 'node:path'
import { isTimeZone } from '@mergero/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { DomainError } from '../../domain/errors.ts'
import { paths } from '../../paths.ts'
import { providerStatus } from '../../providers/index.ts'
import { addDaysToDate, isIsoDate, localDate } from '../../views/dates.ts'
import { metricsDto } from '../../views/metrics.ts'
import { mockMetricsDto } from '../../views/metrics-mock.ts'
import { TEMPLATE_FILE, templatePreviews } from '../../views/templates.ts'
import { adminContext } from './context.ts'
import { parseInput, sendExistingFile } from './http.ts'

const DEFAULT_RANGE_DAYS = 90
const DEFAULT_TIME_ZONE = 'UTC'

const isoDate = z.string().refine(isIsoDate, 'expected a date in the format YYYY-MM-DD')
const timeZone = z.string().max(64).refine(isTimeZone, 'expected an IANA time zone, for example Europe/Helsinki')
const metricsQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  tz: timeZone.optional(),
  source: z.enum(['real', 'mock']).default('real'),
})

export const reportRoutes = new Hono()

reportRoutes.get('/status', (c) => c.json(providerStatus()))

reportRoutes.get('/metrics', async (c) => {
  const { db, now } = adminContext()
  const query = parseInput(metricsQuery, c.req.query(), 'query')
  const tz = query.tz ?? DEFAULT_TIME_ZONE
  const to = query.to ?? localDate(now, tz)
  const from = query.from ?? addDaysToDate(to, 1 - DEFAULT_RANGE_DAYS)
  if (from > to) throw new DomainError(400, 'The start date must not be after the end date')
  const range = { from, to, timeZone: tz }
  return c.json(query.source === 'mock' ? await mockMetricsDto(range, now) : await metricsDto(db, range))
})

reportRoutes.get('/templates', async (c) => c.json(await templatePreviews()))

reportRoutes.get('/templates/:file', (c) => {
  const name = c.req.param('file')
  if (!TEMPLATE_FILE.test(name)) throw new DomainError(404, 'The file does not exist')
  return sendExistingFile(c, path.join(paths.templatesDir, name), { cacheControl: 'private, no-cache' })
})
