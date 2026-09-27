import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { MgxData, SlideTime } from '@mergero/shared'
import { Hono } from 'hono'
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { Db } from '../../src/db/index.ts'
import type { DealPatch, DealRow } from '../../src/db/rows.ts'
import { requireDeal } from '../../src/domain/deals.ts'
import { publish } from '../../src/domain/pipeline.ts'
import { createVersion, markRenderStatus, setApproval, setSlideTimes } from '../../src/domain/timelines.ts'
import { handleError, handleNotFound } from '../../src/html/errors.ts'
import { viteAssets } from '../../src/html/vite.ts'
import type { MgxClient } from '../../src/providers/types.ts'
import { createVideoRoutes } from '../../src/routes/video/index.ts'
import { tempDb } from '../db/temp-db.ts'
import { DEAL_ID, SLIDE_TIMES, T0, insertAnalyst, insertDeal, makeTimeline } from '../domain/fixtures.ts'
import type { TimelineOptions } from '../domain/fixtures.ts'

export const PUBLIC_BASE_URL = 'https://video.test'
export const RECEIPT_ID = 'MGX-TESTRECEIPT'
export const MEDIA_BYTES = 1000

export interface Harness {
  db: Db
  storageDir: string
  app: Hono
  clock: { now: Date }
  mgx: { submitForm: Mock<MgxClient['submitForm']> }
  request: (url: string, init?: RequestInit) => Promise<Response>
  close: () => void
}

export function createHarness(): Harness {
  const temp = tempDb()
  const storageDir = path.join(temp.dir, 'storage')
  const clock = { now: T0 }
  const mgx = { submitForm: vi.fn<MgxClient['submitForm']>(async () => ({ receiptId: RECEIPT_ID })) }
  const app = new Hono()
  app.route(
    '/',
    createVideoRoutes({
      db: temp.db,
      mgx,
      storageDir,
      publicBaseUrl: PUBLIC_BASE_URL,
      assets: viteAssets({ production: false, devUrl: 'http://vite.test', distDir: temp.dir }),
      now: () => clock.now,
    }),
  )
  app.notFound(handleNotFound)
  app.onError(handleError)
  insertAnalyst(temp.db)
  return {
    db: temp.db,
    storageDir,
    app,
    clock,
    mgx,
    request: async (url, init) => app.request(url, init),
    close: temp.close,
  }
}

export function mediaBytes(): Buffer {
  return Buffer.from(Array.from({ length: MEDIA_BYTES }, (_, index) => index % 256))
}

export function writeDealFile(storageDir: string, dealId: number, name: string, content: Buffer | string = mediaBytes()): void {
  const dir = path.join(storageDir, 'deals', String(dealId))
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, name), content)
}

export function addRenderedVersion(
  h: Harness,
  dealId: number = DEAL_ID,
  options: TimelineOptions = {},
  times: readonly SlideTime[] = SLIDE_TIMES,
): number {
  const row = createVersion(h.db, dealId, makeTimeline(dealId, { audio: 'ok', ...options }), h.clock.now)
  setSlideTimes(h.db, dealId, row.version, times)
  markRenderStatus(h.db, dealId, row.version, 'rendered', h.clock.now)
  setApproval(h.db, dealId, row.version, true, h.clock.now)
  for (const name of [`video-720.v${row.version}.mp4`, `video-1080.v${row.version}.mp4`, `poster.v${row.version}.jpg`]) {
    writeDealFile(h.storageDir, dealId, name)
  }
  return row.version
}

export function draftDeal(h: Harness, options: { id?: number; patch?: DealPatch } = {}): DealRow {
  return insertDeal(h.db, { id: options.id ?? DEAL_ID, patch: options.patch })
}

export function publishedDeal(h: Harness, options: { id?: number; patch?: DealPatch; timeline?: TimelineOptions } = {}): DealRow {
  const deal = draftDeal(h, options)
  const version = addRenderedVersion(h, deal.id, options.timeline)
  publish(h.db, deal.id, version, h.clock.now)
  writeDealFile(h.storageDir, deal.id, 'og-image.jpg')
  return requireDeal(h.db, deal.id)
}

export function mgxData(multiples: number[], nace = '25.62'): MgxData {
  return {
    buyers: [],
    featuredBuyers: [],
    sectorDeals: multiples.map((profitMultiple, index) => ({
      id: `d${index + 1}`,
      year: 2024,
      country: 'DE',
      nace,
      text: `Deal ${index + 1}`,
      profitMultiple,
    })),
    recentDeals: [],
    multiples,
    fetchedAt: T0.toISOString(),
  }
}

export function json(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }
}
