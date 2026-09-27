import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { markAlertsSeen } from '../../src/domain/analysts.ts'
import { requireDeal } from '../../src/domain/deals.ts'
import { DomainError } from '../../src/domain/errors.ts'
import { addDealEvent, alertsFor, listEvents, recordBriefRead } from '../../src/domain/events.ts'
import { advance } from '../../src/domain/pipeline.ts'
import { enqueuePipedriveAnalytics, markLost, moveStage, stageRank } from '../../src/domain/stages.ts'
import { completeTask, createTask, getTask, listOpenTasks, nextSecondChannel } from '../../src/domain/tasks.ts'
import { jobsForDeal } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { ANALYST_ID, DEAL_ID, T0, insertAnalyst, insertDeal, later } from './fixtures.ts'

let t: TempDb

beforeEach(() => {
  t = tempDb()
  insertAnalyst(t.db)
})

afterEach(() => {
  t.close()
})

function publishedDeal(id = DEAL_ID) {
  return insertDeal(t.db, { id, patch: { status: 'link_sent', publishedVersion: 1, publishedAt: T0.toISOString() } })
}

function writeKeys(dealId = DEAL_ID): string[] {
  return jobsForDeal(t.db, dealId, ['pipedrive-write']).map((job) => job.key)
}

function insertSession(id: string, dealId: number, channel: string, device: string, at: Date): void {
  sql(
    t.db,
    `INSERT INTO sessions (id, deal_id, version, started_at, last_seen_at, local_day, channel, device, browser, os, screen)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'Safari', 'iOS', '390x844')`,
  ).run(id, dealId, at.toISOString(), at.toISOString(), at.toISOString().slice(0, 10), channel, device)
}

function insertSessionEvent(sessionId: string, dealId: number, seq: number, type: string, at: Date): number {
  return Number(
    sql(t.db, 'INSERT INTO events (deal_id, session_id, seq, type, at) VALUES (?, ?, ?, ?, ?)').run(
      dealId,
      sessionId,
      seq,
      type,
      at.toISOString(),
    ).lastInsertRowid,
  )
}

describe('moveStage', () => {
  it('moves the stage forward only and adds one stage job per stage', () => {
    publishedDeal()
    expect(moveStage(t.db, DEAL_ID, 'opened', { now: later(1) }).moved).toBe(true)
    expect(moveStage(t.db, DEAL_ID, 'link_sent', { now: later(2) }).moved).toBe(false)
    expect(moveStage(t.db, DEAL_ID, 'opened', { now: later(3) }).moved).toBe(false)
    const form = moveStage(t.db, DEAL_ID, 'form_sent', { now: later(4), data: { receiptId: 'r1' } })
    expect(form.moved).toBe(true)
    expect(form.event).toMatchObject({ type: 'form_sent', data: { receiptId: 'r1' }, sessionId: null })
    expect(moveStage(t.db, DEAL_ID, 'opened', { now: later(5) }).moved).toBe(false)
    expect(requireDeal(t.db, DEAL_ID).status).toBe('form_sent')
    expect(writeKeys()).toEqual(['pipedrive-write:100:stage:opened', 'pipedrive-write:100:stage:form_sent'])
  })

  it('records a second form as an event without a stage move', () => {
    publishedDeal()
    moveStage(t.db, DEAL_ID, 'meeting_booked', { now: later(1) })
    const again = moveStage(t.db, DEAL_ID, 'form_sent', { now: later(2) })
    expect(again.moved).toBe(false)
    expect(again.event?.type).toBe('form_sent')
    expect(requireDeal(t.db, DEAL_ID).status).toBe('meeting_booked')
  })

  it('refuses a deal that is not published', () => {
    insertDeal(t.db)
    expect(() => moveStage(t.db, DEAL_ID, 'opened')).toThrow(DomainError)
  })

  it('closes the open tasks when the owner books a meeting', () => {
    publishedDeal()
    const task = createTask(t.db, DEAL_ID, 'call', null, later(1))
    moveStage(t.db, DEAL_ID, 'meeting_booked', { now: later(2), data: { meetingAt: '2026-10-01T07:00:00.000Z' } })
    expect(getTask(t.db, task?.id ?? 0)).toMatchObject({ status: 'done', doneAt: later(2).toISOString() })
    expect(writeKeys()).toContain(`pipedrive-write:100:activity_done:${task?.id}`)
  })

  it('ranks the statuses', () => {
    expect(['draft', 'review', 'failed', 'link_sent', 'opened', 'form_sent', 'meeting_booked', 'lost'].map((s) => stageRank(s as never))).toEqual([
      -1, -1, -1, 0, 1, 2, 3, 4,
    ])
  })
})

describe('markLost', () => {
  it('sets the deal to lost once, closes tasks, and adds the Pipedrive job', () => {
    publishedDeal()
    const task = createTask(t.db, DEAL_ID, 'second_channel', 'sms', later(1))
    const lost = markLost(t.db, DEAL_ID, ' We are not selling. ', later(2))
    expect(lost.moved).toBe(true)
    expect(requireDeal(t.db, DEAL_ID)).toMatchObject({ status: 'lost', lostAt: later(2).toISOString(), lostReason: 'We are not selling.' })
    expect(getTask(t.db, task?.id ?? 0)?.status).toBe('done')
    expect(writeKeys()).toContain(`pipedrive-write:100:lost:${lost.event?.id}`)
    const lostJob = jobsForDeal(t.db, DEAL_ID, ['pipedrive-write']).find((job) => job.key.includes(':lost:'))
    expect(lostJob?.payload).toEqual({ dealId: DEAL_ID, op: 'lost', reason: 'We are not selling.' })

    expect(markLost(t.db, DEAL_ID, 'again', later(3)).moved).toBe(false)
    expect(moveStage(t.db, DEAL_ID, 'meeting_booked', { now: later(4) }).moved).toBe(false)
    expect(advance(t.db, DEAL_ID, later(5)).action).toBe('none')
    expect(requireDeal(t.db, DEAL_ID).status).toBe('lost')
  })
})

describe('tasks', () => {
  it('makes one task per deal and type, with an activity job and an event', () => {
    publishedDeal()
    const first = createTask(t.db, DEAL_ID, 'call', null, later(1))
    expect(first).toMatchObject({ dealId: DEAL_ID, type: 'call', channel: null, status: 'open' })
    expect(createTask(t.db, DEAL_ID, 'call', null, later(2))).toBeNull()
    expect(writeKeys()).toEqual([`pipedrive-write:100:activity:${first?.id}`])
    expect(listEvents(t.db, DEAL_ID).map((event) => [event.type, event.data])).toEqual([
      ['task_created', { taskId: first?.id, type: 'call', channel: null }],
    ])
    expect(listOpenTasks(t.db, { dealId: DEAL_ID }).map((task) => task.id)).toEqual([first?.id])
    expect(listOpenTasks(t.db, { analystId: ANALYST_ID })).toHaveLength(1)
    expect(listOpenTasks(t.db, { analystId: 999 })).toHaveLength(0)

    expect(completeTask(t.db, first?.id ?? 0, later(3))?.status).toBe('done')
    expect(completeTask(t.db, first?.id ?? 0, later(4))?.doneAt).toBe(later(3).toISOString())
    expect(completeTask(t.db, 999, later(4))).toBeNull()
    expect(writeKeys()).toEqual([`pipedrive-write:100:activity:${first?.id}`, `pipedrive-write:100:activity_done:${first?.id}`])
    expect(listEvents(t.db, DEAL_ID).map((event) => event.type)).toEqual(['task_created', 'task_done'])
    expect(createTask(t.db, DEAL_ID, 'call', null, later(5))).toBeNull()
  })

  it('checks the channel of a task', () => {
    publishedDeal()
    expect(() => createTask(t.db, DEAL_ID, 'second_channel', null)).toThrow()
    expect(() => createTask(t.db, DEAL_ID, 'call', 'email')).toThrow()
  })

  it('picks the second channel', () => {
    expect(nextSecondChannel('linkedin', 'email')).toBe('linkedin')
    expect(nextSecondChannel('linkedin', 'linkedin')).toBe('whatsapp')
    expect(nextSecondChannel('sms', 'sms')).toBe('email')
    expect(nextSecondChannel('email', null)).toBe('email')
  })
})

describe('Pipedrive analytics job', () => {
  it('adds one delayed job while one is queued', () => {
    publishedDeal()
    const job = enqueuePipedriveAnalytics(t.db, DEAL_ID, T0)
    expect(job).toMatchObject({ runAt: later(1).toISOString(), payload: { dealId: DEAL_ID, op: 'analytics' } })
    expect(enqueuePipedriveAnalytics(t.db, DEAL_ID, later(0.5))).toBeNull()
    sql(t.db, `UPDATE jobs SET status = 'done' WHERE id = ?`).run(job?.id)
    expect(enqueuePipedriveAnalytics(t.db, DEAL_ID, later(2))).not.toBeNull()
  })
})

describe('alerts', () => {
  it('lists the first open of each session and the owner events, newest first', () => {
    publishedDeal()
    publishedDeal(101)
    insertSession('s1', DEAL_ID, 'whatsapp', 'mobile', later(1))
    const open1 = insertSessionEvent('s1', DEAL_ID, 0, 'open', later(1))
    insertSessionEvent('s1', DEAL_ID, 1, 'play', later(1))
    insertSessionEvent('s1', DEAL_ID, 2, 'open', later(2))
    insertSession('s2', 101, 'direct', 'desktop', later(3))
    const open2 = insertSessionEvent('s2', 101, 0, 'open', later(3))
    const booked = addDealEvent(t.db, DEAL_ID, 'meeting_booked', { meetingAt: '2026-10-01T07:00:00.000Z' }, later(4))
    addDealEvent(t.db, DEAL_ID, 'task_created', {}, later(5))
    const lost = addDealEvent(t.db, 101, 'lost', { reason: 'Sold already' }, later(6))

    const alerts = alertsFor(t.db, ANALYST_ID, T0)
    expect(alerts.map((alert) => [alert.id, alert.type, alert.text])).toEqual([
      [lost.id, 'lost', 'Marked as lost: Sold already'],
      [booked.id, 'meeting_booked', 'Booked a meeting for 2026-10-01 10:00 (Europe/Helsinki)'],
      [open2, 'open', 'Opened the video on a computer'],
      [open1, 'open', 'Opened the video from the WhatsApp link on a phone'],
    ])
    expect(alerts[0]).toMatchObject({ dealId: 101, company: 'Acme Oy', unread: true, at: later(6).toISOString() })

    markAlertsSeen(t.db, ANALYST_ID, later(4))
    expect(alertsFor(t.db, ANALYST_ID, T0).map((alert) => alert.unread)).toEqual([true, false, false, false])
    expect(alertsFor(t.db, ANALYST_ID, later(3.5))).toHaveLength(2)
    expect(alertsFor(t.db, ANALYST_ID, T0, 1)).toHaveLength(1)
    expect(alertsFor(t.db, 999, T0)).toEqual([])
  })

  it('records a brief read once per brief version in 10 minutes', () => {
    publishedDeal()
    expect(recordBriefRead(t.db, DEAL_ID, 1, later(0))).not.toBeNull()
    expect(recordBriefRead(t.db, DEAL_ID, 1, later(9))).toBeNull()
    expect(recordBriefRead(t.db, DEAL_ID, 2, later(9))).not.toBeNull()
    expect(recordBriefRead(t.db, DEAL_ID, 1, later(11))).not.toBeNull()
  })
})
