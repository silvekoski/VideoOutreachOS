import { CHANNELS } from '@mergero/shared'
import type { Channel, SessionChannel } from '@mergero/shared'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { toTaskRow } from '../db/rows.ts'
import type { TaskColumns, TaskRow, TaskType } from '../db/rows.ts'
import { enqueue, jobKeys } from '../queue/index.ts'
import { addDealEvent } from './events.ts'

const SECOND_CHANNEL_ORDER: readonly Channel[] = ['email', 'linkedin', 'whatsapp', 'sms']

export function getTask(db: Db, id: number): TaskRow | null {
  const row = sql<TaskColumns>(db, 'SELECT * FROM tasks WHERE id = ?').get(id)
  return row ? toTaskRow(row) : null
}

export function listOpenTasks(db: Db, filter: { analystId?: number; dealId?: number } = {}): TaskRow[] {
  return sql<TaskColumns>(
    db,
    `SELECT t.* FROM tasks t JOIN deals d ON d.id = t.deal_id
     WHERE t.status = 'open' AND (? IS NULL OR d.analyst_id = ?) AND (? IS NULL OR t.deal_id = ?)
     ORDER BY t.created_at, t.id`,
  )
    .all(filter.analystId ?? null, filter.analystId ?? null, filter.dealId ?? null, filter.dealId ?? null)
    .map(toTaskRow)
}

export function createTask(
  db: Db,
  dealId: number,
  type: TaskType,
  channel: Channel | null,
  now: Date = new Date(),
): TaskRow | null {
  if ((type === 'second_channel') !== (channel !== null)) {
    throw new Error('A second channel task needs a channel, and a call task has no channel')
  }
  return transaction(db, () => {
    const row = sql<TaskColumns>(
      db,
      `INSERT INTO tasks (deal_id, type, channel, status, created_at) VALUES (?, ?, ?, 'open', ?)
       ON CONFLICT (deal_id, type) DO NOTHING RETURNING *`,
    ).get(dealId, type, channel, nowIso(now))
    if (!row) return null
    const task = toTaskRow(row)
    enqueue(db, 'pipedrive-write', jobKeys.pipedriveWrite(dealId, 'activity', task.id), { dealId, op: 'activity', taskId: task.id }, { now })
    addDealEvent(db, dealId, 'task_created', { taskId: task.id, type, channel }, now)
    return task
  })
}

export function completeTask(db: Db, taskId: number, now: Date = new Date()): TaskRow | null {
  return transaction(db, () => {
    const task = getTask(db, taskId)
    if (!task || task.status === 'done') return task
    sql(db, `UPDATE tasks SET status = 'done', done_at = ? WHERE id = ?`).run(nowIso(now), taskId)
    enqueue(
      db,
      'pipedrive-write',
      jobKeys.pipedriveWrite(task.dealId, 'activity_done', taskId),
      { dealId: task.dealId, op: 'activity_done', taskId },
      { now },
    )
    addDealEvent(db, task.dealId, 'task_done', { taskId, type: task.type, channel: task.channel }, now)
    return getTask(db, taskId)
  })
}

export function setTaskActivityId(db: Db, taskId: number, activityId: number): TaskRow | null {
  sql(db, 'UPDATE tasks SET pipedrive_activity_id = ? WHERE id = ?').run(activityId, taskId)
  return getTask(db, taskId)
}

export function nextSecondChannel(defaultChannel: Channel, firstSessionChannel: SessionChannel | null): Channel {
  if (defaultChannel !== firstSessionChannel) return defaultChannel
  const index = SECOND_CHANNEL_ORDER.indexOf(defaultChannel)
  return SECOND_CHANNEL_ORDER[(index + 1) % SECOND_CHANNEL_ORDER.length] ?? CHANNELS[0]
}
