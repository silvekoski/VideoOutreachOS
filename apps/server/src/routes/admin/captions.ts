import { buildCaptions } from '@mergero/shared'
import type { Timeline } from '@mergero/shared'
import { Hono } from 'hono'
import type { AnalystRow } from '../../db/rows.ts'
import { requireAnalyst } from '../../domain/analysts.ts'
import { requireDeal } from '../../domain/deals.ts'
import { DomainError } from '../../domain/errors.ts'
import { getTimeline } from '../../domain/timelines.ts'
import { adminContext } from './context.ts'
import { parseId } from './http.ts'

const CAPTIONS_FILE = /^captions\.v(\d+)\.vtt$/u

function introTranscript(timeline: Timeline, analyst: AnalystRow): string | null {
  const variables = timeline.segments.find((segment) => segment.template === 'facecam')?.variables
  const text = variables && 'transcript' in variables ? variables.transcript : analyst.intros[timeline.language]?.transcript
  return typeof text === 'string' ? text.trim() || null : null
}

export const captionRoutes = new Hono()

captionRoutes.get('/deals/:id/:file{captions\\.v[0-9]+\\.vtt}', (c) => {
  const { db } = adminContext()
  const deal = requireDeal(db, parseId(c.req.param('id'), 'deal ID'))
  const version = parseId(CAPTIONS_FILE.exec(c.req.param('file'))?.[1], 'version')
  const timeline = getTimeline(db, deal.id, version)?.timeline
  if (!timeline || timeline.segments.some((segment) => segment.startS === null || segment.endS === null)) {
    throw new DomainError(404, `Version ${version} of deal ${deal.id} has no rendered video yet`)
  }
  c.header('Content-Type', 'text/vtt; charset=utf-8')
  c.header('Cache-Control', 'private, no-cache')
  return c.body(buildCaptions(timeline, introTranscript(timeline, requireAnalyst(db, deal.analystId))))
})
