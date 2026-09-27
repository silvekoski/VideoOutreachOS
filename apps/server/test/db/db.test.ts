import { existsSync, readFileSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nowIso, openDb, sql, transaction } from '../../src/db/index.ts'
import { toDealRow } from '../../src/db/rows.ts'
import type { DealColumns } from '../../src/db/rows.ts'
import { tempDb } from './temp-db.ts'
import type { TempDb } from './temp-db.ts'

let t: TempDb

beforeEach(() => {
  t = tempDb()
})

afterEach(() => {
  t.close()
})

function insertMinimalDeal(): void {
  const at = '2026-09-26T12:00:00.000Z'
  sql(t.db, 'INSERT INTO analysts (id, name, created_at, updated_at) VALUES (1, ?, ?, ?)').run('Aino', at, at)
  sql(
    t.db,
    `INSERT INTO deals (id, analyst_id, status, link_code, language, page_language, country, snapshot, expiry_days, created_at, updated_at)
     VALUES (7, 1, 'draft', 'AAAAAAAAAAAAAAAAAAAAAA', 'fi', 'fi', 'FI', '{"company":"Acme Oy"}', 30, ?, ?)`,
  ).run(at, at)
}

describe('openDb', () => {
  it('creates the folder and sets the pragmas', () => {
    expect(existsSync(path.dirname(t.file))).toBe(true)
    expect(t.db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(t.db.pragma('busy_timeout', { simple: true })).toBe(5000)
    expect(t.db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(t.db.pragma('synchronous', { simple: true })).toBe(1)
  })

  it('creates all tables and runs the schema again without an error', () => {
    const tables = sql<{ name: string }>(t.db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all()
      .map((row) => row.name)
    expect(tables).toEqual(['analysts', 'briefs', 'deals', 'events', 'jobs', 'sessions', 'sync_state', 'tasks', 'timelines'])
    const again = openDb(t.file)
    expect(sql<{ n: number }>(again, 'SELECT COUNT(*) AS n FROM jobs').get()?.n).toBe(0)
    again.close()
  })

  it('enforces the foreign keys and the checks', () => {
    expect(() =>
      sql(t.db, `INSERT INTO timelines (deal_id, version, json, created_at) VALUES (999, 1, '{}', 'x')`).run(),
    ).toThrow(/FOREIGN KEY/u)
    insertMinimalDeal()
    expect(() => sql(t.db, `UPDATE deals SET status = 'shipped' WHERE id = 7`).run()).toThrow(/CHECK/u)
  })

  it('rebuilds an old deals table for the won status and keeps the rows and the foreign keys', () => {
    t.db.close()
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${t.file}${suffix}`, { force: true })
    const oldSchema = readFileSync(new URL('../../src/db/schema.sql', import.meta.url), 'utf8').replace(",'lost','won'))", ",'lost'))")
    const old = new Database(t.file)
    old.exec(oldSchema)
    old.close()
    t.db = openDb(t.file)
    insertMinimalDeal()
    sql(t.db, `INSERT INTO timelines (deal_id, version, json, created_at) VALUES (7, 1, '{}', 'x')`).run()
    t.db.close()
    t.db = openDb(t.file)
    sql(t.db, `UPDATE deals SET status = 'won' WHERE id = 7`).run()
    expect(sql<{ status: string }>(t.db, 'SELECT status FROM deals WHERE id = 7').get()?.status).toBe('won')
    expect(() => sql(t.db, `INSERT INTO timelines (deal_id, version, json, created_at) VALUES (999, 1, '{}', 'x')`).run()).toThrow(/FOREIGN KEY/u)
    sql(t.db, 'DELETE FROM deals WHERE id = 7').run()
    expect(sql<{ n: number }>(t.db, 'SELECT COUNT(*) AS n FROM timelines').get()?.n).toBe(0)
    t.db.close()
  })

  it('cascades a deal delete to its timelines', () => {
    insertMinimalDeal()
    sql(t.db, `INSERT INTO timelines (deal_id, version, json, created_at) VALUES (7, 1, '{}', 'x')`).run()
    sql(t.db, 'DELETE FROM deals WHERE id = 7').run()
    expect(sql<{ n: number }>(t.db, 'SELECT COUNT(*) AS n FROM timelines').get()?.n).toBe(0)
  })
})

describe('helpers', () => {
  it('writes RFC 3339 UTC times', () => {
    expect(nowIso(new Date(Date.UTC(2026, 8, 26, 12)))).toBe('2026-09-26T12:00:00.000Z')
  })

  it('caches prepared statements per connection', () => {
    expect(sql(t.db, 'SELECT 1')).toBe(sql(t.db, 'SELECT 1'))
  })

  it('rolls back a failed transaction', () => {
    expect(() =>
      transaction(t.db, () => {
        insertMinimalDeal()
        throw new Error('stop')
      }),
    ).toThrow('stop')
    expect(sql<{ n: number }>(t.db, 'SELECT COUNT(*) AS n FROM analysts').get()?.n).toBe(0)
  })

  it('maps a deal row and parses the JSON columns', () => {
    insertMinimalDeal()
    const deal = toDealRow(sql<DealColumns>(t.db, 'SELECT * FROM deals WHERE id = 7').get() as DealColumns)
    expect(deal).toMatchObject({
      id: 7,
      analystId: 1,
      status: 'draft',
      reviewReasons: [],
      snapshot: { company: 'Acme Oy' },
      scrape: null,
      customQuestions: [],
      removedBuyers: [],
      form: null,
      analytics: null,
    })
  })
})
