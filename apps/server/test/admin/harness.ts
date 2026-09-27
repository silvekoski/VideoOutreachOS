import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ADMIN_REQUEST_HEADER } from '@mergero/shared'
import type { SessionAnalytics, SessionChannel } from '@mergero/shared'
import { nowIso, openDb, sql } from '../../src/db/index.ts'
import type { Db } from '../../src/db/index.ts'
import type { DealPatch, DealRow } from '../../src/db/rows.ts'
import { publish } from '../../src/domain/pipeline.ts'
import { approveVersion, createVersion, markRenderStatus, setSlideTimes } from '../../src/domain/timelines.ts'
import { paths } from '../../src/paths.ts'
import { SeedLinkedInSource } from '../../src/providers/linkedin.ts'
import { FakeModel } from '../../src/providers/model-fake.ts'
import { FakePipedriveClient } from '../../src/providers/pipedrive-fake.ts'
import { adminRoutes, configureAdmin } from '../../src/routes/admin/index.ts'
import { DEAL_ID, SCRAPE_OK, SLIDE_TIMES, T0, insertDeal, makeTimeline } from '../domain/fixtures.ts'

const PANEL_HEADERS: Record<string, string> = { [ADMIN_REQUEST_HEADER]: '1', 'Sec-Fetch-Site': 'same-origin' }

export interface Harness {
  db: Db
  setNow: (date: Date) => void
  request: (url: string, init?: RequestInit) => Promise<Response>
  json: <T>(url: string, init?: RequestInit) => Promise<{ status: number; body: T }>
  close: () => void
}

export function createHarness(start: Date = T0): Harness {
  rmSync(paths.root, { recursive: true, force: true })
  mkdirSync(paths.root, { recursive: true })
  const db = openDb(paths.database)
  let now = start
  configureAdmin({
    db,
    clock: () => now,
    providers: { pipedrive: new FakePipedriveClient({ file: paths.fakePipedrive }), linkedin: new SeedLinkedInSource(), model: new FakeModel() },
  })
  const request = async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    for (const [name, value] of Object.entries(PANEL_HEADERS)) if (!headers.has(name)) headers.set(name, value)
    return adminRoutes.request(url, { ...init, headers })
  }
  return {
    db,
    setNow: (date) => {
      now = date
    },
    request,
    json: async <T>(url: string, init?: RequestInit) => {
      const response = await request(url, init)
      return { status: response.status, body: (await response.json()) as T }
    },
    close: () => {
      if (db.open) db.close()
    },
  }
}

export function jsonBody(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export function writeStorageFile(relative: string, content: string | Buffer): string {
  const file = path.join(paths.root, ...relative.split('/'))
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, content)
  return file
}

export function publishedDeal(
  db: Db,
  options: { id?: number; analystId?: number; at?: Date; patch?: DealPatch } = {},
): DealRow {
  const id = options.id ?? DEAL_ID
  const at = options.at ?? T0
  insertDeal(db, { id, analystId: options.analystId, patch: { scrape: SCRAPE_OK, ...options.patch } })
  createVersion(db, id, makeTimeline(id, { audio: 'ok' }), at)
  setSlideTimes(db, id, 1, SLIDE_TIMES)
  markRenderStatus(db, id, 1, 'rendered', at)
  approveVersion(db, id, 1, at)
  return publish(db, id, 1, at)
}

export function addSession(
  db: Db,
  dealId: number,
  options: { id: string; startedAt: Date; channel?: SessionChannel; analytics?: SessionAnalytics | null },
): void {
  const at = nowIso(options.startedAt)
  sql(
    db,
    `INSERT INTO sessions (id, deal_id, version, started_at, last_seen_at, local_day, channel, device, browser, os, screen, analytics)
     VALUES (?, ?, 1, ?, ?, ?, ?, 'mobile', 'Chrome', 'Android', '412x839', ?)`,
  ).run(
    options.id,
    dealId,
    at,
    at,
    at.slice(0, 10),
    options.channel ?? 'whatsapp',
    options.analytics ? JSON.stringify(options.analytics) : null,
  )
}

export function addSessionEvent(
  db: Db,
  dealId: number,
  sessionId: string,
  event: { seq: number; type: string; at: Date; slide?: number | null; videoTime?: number | null; channel?: string },
): number {
  return Number(
    sql(
      db,
      `INSERT INTO events (deal_id, session_id, seq, type, slide, video_time, channel, client_at, at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
    ).run(
      dealId,
      sessionId,
      event.seq,
      event.type,
      event.slide ?? null,
      event.videoTime ?? null,
      event.channel ?? 'whatsapp',
      nowIso(event.at),
      nowIso(event.at),
    ).lastInsertRowid,
  )
}

export function stoppedAt(slide: SessionAnalytics['stopSlide'], watchS = 40): SessionAnalytics {
  return { watchS, perSlide: [], stopSlide: slide, replays: 0, completed: false, played: true, formActivity: false }
}
