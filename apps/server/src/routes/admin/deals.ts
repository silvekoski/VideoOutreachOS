import path from 'node:path'
import { CHANNELS, DEAL_STATUSES, contactPatchSchema, reviewPatchSchema } from '@mergero/shared'
import type { EnsureDealDto } from '@mergero/shared'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { sql } from '../../db/index.ts'
import type { Db } from '../../db/index.ts'
import { newestBrief } from '../../domain/brief-data.ts'
import { updateContact } from '../../domain/contact.ts'
import { requireDeal, setExpiry } from '../../domain/deals.ts'
import { ensureDeal } from '../../domain/ensure.ts'
import { PROSPECT_LIMIT, generateVideos, listProspects } from '../../domain/prospects.ts'
import { DomainError } from '../../domain/errors.ts'
import { recordBriefRead } from '../../domain/events.ts'
import { writeOutreach } from '../../domain/outreach.ts'
import { applyReviewPatch, approveDeal, remakeDeal } from '../../domain/pipeline.ts'
import { completeTask } from '../../domain/tasks.ts'
import { insideDir, paths } from '../../paths.ts'
import { dealDetailDto } from '../../views/deal-detail.ts'
import { dealRowDtos } from '../../views/deal-rows.ts'
import { readRecording } from '../../video/recording.ts'
import { reviewDto } from '../../views/review.ts'
import { sessionEventsDto } from '../../views/sessions.ts'
import { analystFromQuery } from './analysts.ts'
import { adminContext } from './context.ts'
import type { AdminContext } from './context.ts'
import { parseId, parseInput, readJson, sendExistingFile } from './http.ts'

const VERSIONED_FILE = /\.v\d+\.[a-z0-9]+$/u
const SESSION_ID = /^[A-Za-z0-9-]{1,64}$/u

const blankToUndefined = (value: unknown) => (value === '' ? undefined : value)

const dealListQuery = z.object({
  analyst: z.preprocess(blankToUndefined, z.string().optional()),
  country: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[A-Za-z]{2}$/u, 'expected a two-letter country code')
      .transform((code) => code.toUpperCase())
      .optional(),
  ),
  status: z.preprocess(blankToUndefined, z.enum(DEAL_STATUSES).optional()),
  q: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
})

const expiryBody = z.object({ days: z.int().min(1).max(365) })
const generateBody = z.object({ dealIds: z.array(z.int().positive()).min(1).max(PROSPECT_LIMIT) })
const outreachBody = z.object({ channel: z.enum(CHANNELS) })

export const dealRoutes = new Hono()

function dealId(c: Context): number {
  return parseId(c.req.param('id'), 'deal ID')
}

function detail(context: AdminContext, db: Db, id: number) {
  return dealDetailDto(db, requireDeal(db, id), {
    now: context.now,
    pipedriveUrl: (deal) => context.providers.pipedrive.dealUrl(deal),
  })
}

function dealFile(id: number, name: string): string | null {
  const segments = name.split('/')
  if (segments.some((segment) => segment === '' || segment.startsWith('.'))) return null
  return insideDir(paths.dealDir(id), name)
}

dealRoutes.get('/deals', (c) => {
  const { db, now } = adminContext()
  const query = parseInput(dealListQuery, c.req.query(), 'query')
  const analystId = query.analyst === undefined ? undefined : parseId(query.analyst, 'analyst ID')
  return c.json(dealRowDtos(db, { analystId, country: query.country, status: query.status, q: query.q }, now))
})

dealRoutes.get('/prospects', async (c) => {
  const { db, providers } = adminContext()
  return c.json(await listProspects(db, providers.pipedrive, analystFromQuery(c, db).id))
})

dealRoutes.post('/deals/generate', async (c) => {
  const { db, now, providers } = adminContext()
  const { dealIds } = await readJson(c, generateBody)
  return c.json(await generateVideos(db, providers, dealIds, now))
})

dealRoutes.post('/deals/:id/ensure', async (c) => {
  const { db, now, providers } = adminContext()
  const { deal, created, refreshed, refreshError } = await ensureDeal(db, providers, dealId(c), now)
  const body: EnsureDealDto = { id: deal.id, created, refreshed, refreshError }
  return c.json(body)
})

dealRoutes.get('/deals/:id', async (c) => {
  const context = adminContext()
  return c.json(await detail(context, context.db, dealId(c)))
})

dealRoutes.patch('/deals/:id/contact', async (c) => {
  const context = adminContext()
  const patch = await readJson(c, contactPatchSchema)
  const { refreshError } = await updateContact(context.db, context.providers, dealId(c), patch, context.now)
  if (refreshError !== null) throw new DomainError(409, `Pipedrive has the change, but the deal could not be read again: ${refreshError}`)
  return c.json(await detail(context, context.db, dealId(c)))
})

dealRoutes.get('/deals/:id/review', async (c) => {
  const { db, now } = adminContext()
  return c.json(await reviewDto(db, requireDeal(db, dealId(c)), now))
})

dealRoutes.patch('/deals/:id/review', async (c) => {
  const { db, now } = adminContext()
  const id = dealId(c)
  const patch = await readJson(c, reviewPatchSchema)
  const result = applyReviewPatch(db, id, patch, now)
  return c.json(await reviewDto(db, result.deal, now))
})

dealRoutes.post('/deals/:id/approve', async (c) => {
  const { db, now } = adminContext()
  const result = approveDeal(db, dealId(c), now)
  return c.json(await reviewDto(db, result.deal, now))
})

dealRoutes.post('/deals/:id/remake', async (c) => {
  const { db, now } = adminContext()
  const result = remakeDeal(db, dealId(c), now)
  return c.json(await reviewDto(db, result.deal, now))
})

dealRoutes.post('/deals/:id/expiry', async (c) => {
  const context = adminContext()
  const id = dealId(c)
  const { days } = await readJson(c, expiryBody)
  setExpiry(context.db, id, days, context.now)
  return c.json(await detail(context, context.db, id))
})

dealRoutes.post('/deals/:id/outreach', async (c) => {
  const { db, now, providers } = adminContext()
  const id = dealId(c)
  const { channel } = await readJson(c, outreachBody)
  return c.json(await writeOutreach(db, providers.model, id, channel, now))
})

dealRoutes.get('/deals/:id/files/:file{.+}', async (c) => {
  const { db } = adminContext()
  const id = dealId(c)
  requireDeal(db, id)
  const name = c.req.param('file')
  const file = dealFile(id, name)
  if (!file) throw new DomainError(404, 'The file does not exist')
  return sendExistingFile(c, file, {
    cacheControl: VERSIONED_FILE.test(name) ? 'private, max-age=86400, immutable' : 'private, no-cache',
    downloadName: c.req.query('download') === '1' ? `deal-${id}-${path.basename(file)}` : null,
  })
})

dealRoutes.post('/deals/:id/brief/read', (c) => {
  const { db, now } = adminContext()
  const id = dealId(c)
  requireDeal(db, id)
  const brief = newestBrief(db, id)
  if (!brief) throw new DomainError(404, 'The deal has no meeting brief')
  recordBriefRead(db, id, brief.version, now)
  return c.body(null, 204)
})

dealRoutes.get('/sessions/:id/events', (c) => {
  const { db } = adminContext()
  const id = c.req.param('id')
  if (!SESSION_ID.test(id)) throw new DomainError(400, 'The session ID is not valid')
  return c.json(sessionEventsDto(db, id))
})

dealRoutes.get('/sessions/:id/recording', async (c) => {
  const { db } = adminContext()
  const id = c.req.param('id')
  if (!SESSION_ID.test(id)) throw new DomainError(400, 'The session ID is not valid')
  const session = sql<{ deal_id: number }>(db, 'SELECT deal_id FROM sessions WHERE id = ?').get(id)
  if (!session) throw new DomainError(404, 'The session does not exist')
  c.header('Content-Type', 'application/json')
  c.header('Cache-Control', 'private, no-cache')
  return c.body(await readRecording(paths.root, session.deal_id, id))
})

dealRoutes.post('/tasks/:id/done', (c) => {
  const { db, now } = adminContext()
  if (!completeTask(db, parseId(c.req.param('id'), 'task ID'), now)) throw new DomainError(404, 'The task does not exist')
  return c.body(null, 204)
})
