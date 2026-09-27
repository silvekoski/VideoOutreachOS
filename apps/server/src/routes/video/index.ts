import { stat } from 'node:fs/promises'
import path from 'node:path'
import { bookSchema, buildCaptions, eventBatchSchema, formSubmitSchema, recordingChunkSchema, t } from '@mergero/shared'
import type { BookResult } from '@mergero/shared'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import type { z } from 'zod'
import type { Db } from '../../db/index.ts'
import type { DealRow } from '../../db/rows.ts'
import { contactFor } from '../../domain/config.ts'
import { DomainError } from '../../domain/errors.ts'
import { messagePage, preferredLanguage, videoDocument } from '../../html/pages.ts'
import { denyFraming } from '../../html/routes.ts'
import { sendFile } from '../../http/send-file.ts'
import type { AssetTags } from '../../html/vite.ts'
import type { MgxClient } from '../../providers/types.ts'
import { insideDir } from '../../paths.ts'
import { findLink, pageVersion, requireLiveLink, requirePublishedLink } from '../../video/access.ts'
import { bookMeeting, dealSlots } from '../../video/booking.ts'
import { MgxSubmitError, submitForm } from '../../video/form.ts'
import { ingestBatch } from '../../video/ingest.ts'
import { buildPageData, introTranscript } from '../../video/page-data.ts'
import { saveRecordingChunk } from '../../video/recording.ts'

export interface VideoRouteDeps {
  db: Db
  mgx: Pick<MgxClient, 'submitForm'>
  storageDir: string
  publicBaseUrl: string
  assets: AssetTags
  now?: () => Date
}

const MAX_BODY_BYTES = 256 * 1024
const MAX_RECORDING_BODY_BYTES = 2 * 1024 * 1024
const MEDIA_CACHE = 'private, max-age=86400'
const LOGO_TYPES = new Map([
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
])

function mediaTypes(version: number): Map<string, string> {
  return new Map([
    [`video-720.v${version}.mp4`, 'video/mp4'],
    [`video-1080.v${version}.mp4`, 'video/mp4'],
    [`poster.v${version}.jpg`, 'image/jpeg'],
  ])
}

async function readBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let value: unknown
  try {
    value = JSON.parse(await c.req.text())
  } catch {
    throw new DomainError(400, 'The request body is not valid JSON')
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new DomainError(
      400,
      'The request body is not valid',
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }
  return parsed.data
}

async function isFile(file: string): Promise<boolean> {
  return (await stat(file).catch(() => null))?.isFile() ?? false
}

export function createVideoRoutes(deps: VideoRouteDeps): Hono {
  const { db } = deps
  const now = deps.now ?? (() => new Date())
  const app = new Hono()
  const dealFile = (deal: DealRow, name: string) => path.join(deps.storageDir, 'deals', String(deal.id), name)
  const isPreview = (c: Context) => c.req.query('preview') === '1'
  const rejectPreview = (c: Context) => {
    if (isPreview(c)) throw new HTTPException(403, { message: 'A preview does not send anything' })
  }

  const smallBody = bodyLimit({ maxSize: MAX_BODY_BYTES })

  const trackedLink = (c: Context, at: Date): DealRow | null => {
    const link = findLink(db, c.req.param('code') ?? '', at)
    if (link.kind === 'missing') throw new DomainError(404, 'The link does not exist')
    if (isPreview(c)) return null
    if (link.kind === 'expired') throw new DomainError(410, 'The link has expired')
    if (link.deal.publishedVersion === null) throw new DomainError(404, 'The link does not exist')
    return link.deal
  }

  const pageRow = (c: Context) => {
    const deal = requireLiveLink(db, c.req.param('code') ?? '', now())
    const row = pageVersion(db, deal, isPreview(c))
    if (!row) throw new DomainError(404, 'The link does not exist')
    return { deal, row }
  }

  app.use('/v/*', async (c, next) => {
    await next()
    c.header('X-Robots-Tag', 'noindex, nofollow')
    c.header('Referrer-Policy', 'no-referrer')
  })
  app.use('/v/*', denyFraming)

  app.get('/v/:code', async (c) => {
    c.header('Cache-Control', 'no-store')
    const at = now()
    const preview = isPreview(c)
    const link = findLink(db, c.req.param('code'), at)
    if (link.kind === 'expired') {
      const lang = link.deal.pageLanguage
      const strings = t(lang).page
      return c.html(
        messagePage({ lang, title: strings.expiredTitle, text: strings.expiredText, contact: contactFor(link.deal.country) }),
        410,
      )
    }
    const row = link.kind === 'live' ? pageVersion(db, link.deal, preview) : null
    if (link.kind === 'missing' || !row) {
      const lang = preferredLanguage(c.req.header('Accept-Language'))
      const strings = t(lang).page
      return c.html(messagePage({ lang, title: strings.notFoundTitle, text: strings.notFoundText, contact: contactFor('') }), 404)
    }
    const { deal } = link
    const pageUrl = `${deps.publicBaseUrl}/v/${deal.linkCode}`
    const imageUrl = (await isFile(dealFile(deal, 'og-image.jpg'))) ? `${pageUrl}/og-image.jpg` : null
    const data = buildPageData(db, deal, row, { preview, now: at })
    return c.html(videoDocument({ data, pageUrl, imageUrl, assets: deps.assets('video', { lang: data.pageLanguage }) }))
  })

  app.get('/v/:code/og-image.jpg', async (c) => {
    const { deal } = pageRow(c)
    const response = await sendFile(c, dealFile(deal, 'og-image.jpg'), { contentType: 'image/jpeg', cacheControl: MEDIA_CACHE })
    return response ?? c.notFound()
  })

  app.get('/v/:code/media/:file', async (c) => {
    const { deal, row } = pageRow(c)
    const name = c.req.param('file')
    const contentType = mediaTypes(row.version).get(name)
    if (contentType === undefined) return c.notFound()
    const response = await sendFile(c, dealFile(deal, name), { contentType, cacheControl: MEDIA_CACHE })
    return response ?? c.notFound()
  })

  app.get('/v/:code/logos/:index{[0-9]+}', async (c) => {
    const { row } = pageRow(c)
    const variables = row.timeline.segments.find((segment) => segment.slide === 5)?.variables
    const logoFile = variables?.template === 'buyers' ? variables.buyers[Number(c.req.param('index'))]?.logoFile : null
    const file = logoFile ? insideDir(path.join(deps.storageDir, 'cache', 'logos'), path.basename(logoFile)) : null
    const contentType = file ? LOGO_TYPES.get(path.extname(file).toLowerCase()) : undefined
    if (!file || !contentType) return c.notFound()
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    const response = await sendFile(c, file, { contentType, cacheControl: MEDIA_CACHE })
    return response ?? c.notFound()
  })

  app.get('/v/:code/:file{captions\\.v[0-9]+\\.vtt}', (c) => {
    const { row } = pageRow(c)
    if (c.req.param('file') !== `captions.v${row.version}.vtt`) return c.notFound()
    const captions = buildCaptions(row.timeline, introTranscript(row.timeline))
    c.header('Content-Type', 'text/vtt; charset=utf-8')
    c.header('Cache-Control', MEDIA_CACHE)
    return c.body(captions)
  })

  app.get('/v/:code/slots', (c) => {
    const deal = requireLiveLink(db, c.req.param('code'), now())
    c.header('Cache-Control', 'no-store')
    return c.json(dealSlots(db, deal.id, now()))
  })

  app.post('/v/:code/events', smallBody, async (c) => {
    const at = now()
    const deal = trackedLink(c, at)
    if (deal === null) return c.body(null, 204)
    ingestBatch(db, deal.id, await readBody(c, eventBatchSchema), at)
    return c.body(null, 204)
  })

  app.post('/v/:code/recording', bodyLimit({ maxSize: MAX_RECORDING_BODY_BYTES }), async (c) => {
    const at = now()
    const deal = trackedLink(c, at)
    if (deal === null) return c.body(null, 204)
    await saveRecordingChunk(db, deps.storageDir, deal.id, await readBody(c, recordingChunkSchema), at)
    return c.body(null, 204)
  })

  app.post('/v/:code/form', smallBody, async (c) => {
    rejectPreview(c)
    const deal = requirePublishedLink(db, c.req.param('code'), now())
    const body = await readBody(c, formSubmitSchema)
    try {
      return c.json(await submitForm(db, deps.mgx, deal.id, body, now()))
    } catch (error) {
      if (error instanceof MgxSubmitError) return c.json({ error: error.message }, 502)
      throw error
    }
  })

  app.post('/v/:code/book', smallBody, async (c) => {
    rejectPreview(c)
    const deal = requirePublishedLink(db, c.req.param('code'), now())
    const body = await readBody(c, bookSchema)
    const result: BookResult = { ok: true, meetingAt: bookMeeting(db, deal.id, body, now()) }
    return c.json(result)
  })

  return app
}
