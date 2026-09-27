import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DealAnalytics } from '@mergero/shared'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { dealInterest } from '../../src/domain/brief-data.ts'
import { requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { addDealEvent } from '../../src/domain/events.ts'
import { purgeExpired } from '../../src/domain/retention.ts'
import { createTask, getTask } from '../../src/domain/tasks.ts'
import { createVersion } from '../../src/domain/timelines.ts'
import { jobsForDeal } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, SCRAPE_OK, T0, insertAnalyst, insertDeal, later, makeTimeline } from './fixtures.ts'

let t: TempDb
let storage: string

beforeEach(() => {
  t = tempDb()
  storage = path.join(t.dir, 'storage')
  insertAnalyst(t.db)
})

afterEach(() => {
  t.close()
})

function count(table: string, dealId: number): number {
  return sql<{ n: number }>(t.db, `SELECT COUNT(*) AS n FROM ${table} WHERE deal_id = ?`).get(dealId)?.n ?? 0
}

function seedDeal(id: number, expiresAt: Date) {
  const analytics: DealAnalytics = { opens: 1, sessions: 1, totalWatchS: 80, perSlide: [], stopSlide: 5, replays: 0, completed: false, days: 1, lastEventId: 1, channel: 'email', firstChannel: 'email', buyerLinkTaps: 0, calculatorResults: 0, forwards: 0 }
  insertDeal(t.db, {
    id,
    patch: {
      status: 'opened',
      publishedVersion: 1,
      publishedAt: T0.toISOString(),
      expiresAt: expiresAt.toISOString(),
      scrape: SCRAPE_OK,
      form: { revenue: null, profit: null, staff: '20-49', timing: 'later', notInterestedReason: null, custom: [], message: 'Hi', submittedAt: T0.toISOString() },
      meetingEmail: 'owner@acme.test',
      meetingAt: later(60 * 24).toISOString(),
      analytics,
    },
  })
  createVersion(t.db, id, makeTimeline(id), T0)
  const dir = path.join(storage, 'deals', String(id), 'audio')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'slide-2.v1.mp3'), 'x')
  writeFileSync(path.join(storage, 'deals', String(id), 'video-720.v1.mp4'), 'x')
  sql(
    t.db,
    `INSERT INTO sessions (id, deal_id, version, started_at, last_seen_at, local_day, channel, device, browser, os, screen)
     VALUES (?, ?, 1, ?, ?, '2026-09-26', 'email', 'mobile', 'Safari', 'iOS', '390x844')`,
  ).run(`s-${id}`, id, T0.toISOString(), T0.toISOString())
  sql(t.db, `INSERT INTO events (deal_id, session_id, seq, type, at) VALUES (?, ?, 0, 'open', ?)`).run(id, `s-${id}`, T0.toISOString())
  addDealEvent(t.db, id, 'link_sent', {}, T0)
  sql(t.db, `INSERT INTO briefs (deal_id, version, last_event_id, language, json, created_at) VALUES (?, 1, 1, 'en', '{}', ?)`).run(
    id,
    T0.toISOString(),
  )
  return createTask(t.db, id, 'second_channel', 'sms', T0)
}

it('deletes the media, sessions, events, briefs and personal fields of expired deals and keeps the analytics', async () => {
  const task = seedDeal(DEAL_ID, later(10))
  seedDeal(101, later(120))
  const now = later(30)

  expect(await purgeExpired(t.db, now, storage)).toEqual([DEAL_ID])

  expect(existsSync(path.join(storage, 'deals', String(DEAL_ID)))).toBe(false)
  expect(existsSync(path.join(storage, 'deals', '101', 'video-720.v1.mp4'))).toBe(true)
  for (const table of ['sessions', 'events', 'briefs']) {
    expect(count(table, DEAL_ID)).toBe(0)
    expect(count(table, 101)).toBeGreaterThan(0)
  }
  const deal = requireDeal(t.db, DEAL_ID)
  expect(deal).toMatchObject({
    form: null,
    meetingEmail: null,
    expiredAt: now.toISOString(),
    status: 'opened',
    publishedAt: T0.toISOString(),
    analytics: { totalWatchS: 80, stopSlide: 5 },
  })
  expect(deal.scrape).toEqual({ ...SCRAPE_OK, markdown: null })
  expect(getTask(t.db, task?.id ?? 0)?.status).toBe('done')
  expect(jobsForDeal(t.db, DEAL_ID, ['pipedrive-write']).map((job) => job.key)).toContain(`pipedrive-write:100:activity_done:${task?.id}`)
  expect(count('timelines', DEAL_ID)).toBe(1)

  expect(await purgeExpired(t.db, later(40), storage)).toEqual([])
  expect(await purgeExpired(t.db, later(200), storage)).toEqual([101])
})

it('deletes media files that a late job wrote after the purge', async () => {
  seedDeal(DEAL_ID, later(10))
  seedDeal(101, later(120))
  expect(await purgeExpired(t.db, later(30), storage)).toEqual([DEAL_ID])
  const late = path.join(storage, 'deals', String(DEAL_ID), 'audio', 'slide-3.v2.mp3')
  mkdirSync(path.dirname(late), { recursive: true })
  writeFileSync(late, 'x')

  expect(await purgeExpired(t.db, later(40), storage)).toEqual([])

  expect(existsSync(path.join(storage, 'deals', String(DEAL_ID)))).toBe(false)
  expect(existsSync(path.join(storage, 'deals', '101', 'video-720.v1.mp4'))).toBe(true)
})

it('keeps the interest level of an opened deal after the events are deleted', async () => {
  seedDeal(DEAL_ID, later(10))
  updateDeal(t.db, DEAL_ID, { firstOpenAt: T0.toISOString() }, T0)
  sql(t.db, `INSERT INTO events (deal_id, session_id, seq, type, at) VALUES (?, ?, 1, 'complete', ?)`).run(DEAL_ID, `s-${DEAL_ID}`, T0.toISOString())
  const before = dealInterest(t.db, requireDeal(t.db, DEAL_ID))
  expect(before).toBe('medium')

  await purgeExpired(t.db, later(30), storage)

  const deal = requireDeal(t.db, DEAL_ID)
  expect(count('events', DEAL_ID)).toBe(0)
  expect(deal.analytics).toMatchObject({ interest: 'medium', signals: ['watched_to_end'], saleTiming: 'later' })
  expect(dealInterest(t.db, deal)).toBe('medium')
})
