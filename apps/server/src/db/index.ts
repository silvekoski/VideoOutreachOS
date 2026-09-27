import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import { paths } from '../paths.ts'

export type Db = BetterSqlite3.Database
export type Statement<Row> = BetterSqlite3.Statement<unknown[], Row>

const BUSY_TIMEOUT_MS = 5000
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
const statements = new WeakMap<Db, Map<string, Statement<unknown>>>()
let shared: Db | null = null

export function openDb(file: string): Db {
  mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file, { timeout: BUSY_TIMEOUT_MS })
  db.pragma('journal_mode = WAL')
  db.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`)
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.exec(schema)
  return db
}

export function getDb(): Db {
  shared ??= openDb(paths.database)
  return shared
}

export function closeDb(): void {
  shared?.close()
  shared = null
}

export function nowIso(date: Date = new Date()): string {
  return date.toISOString()
}

export function sql<Row = unknown>(db: Db, text: string): Statement<Row> {
  let cache = statements.get(db)
  if (!cache) {
    cache = new Map()
    statements.set(db, cache)
  }
  let statement = cache.get(text)
  if (!statement) {
    statement = db.prepare(text)
    cache.set(text, statement)
  }
  return statement as Statement<Row>
}

export function transaction<T>(db: Db, fn: () => T): T {
  return db.transaction(fn).immediate()
}
