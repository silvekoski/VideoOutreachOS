import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import { paths } from '../paths.ts'

export type Db = BetterSqlite3.Database
export type Statement<Row> = BetterSqlite3.Statement<unknown[], Row>

const BUSY_TIMEOUT_MS = 5000
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
const ADDED_COLUMNS = [
  ['analysts', 'name_local', 'INTEGER NOT NULL DEFAULT 0 CHECK (name_local IN (0,1))'],
  ['analysts', 'photo_file', 'TEXT'],
] as const
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
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = db.pragma(`table_info(${table})`) as { name: string }[]
    if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
  rebuildDealsWithWon(db)
  return db
}

// SQLite cannot change a CHECK constraint, so the table is rebuilt (https://www.sqlite.org/lang_altertable.html#otheralter).
function rebuildDealsWithWon(db: Db): void {
  const current = db.prepare<[], { sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'deals'").get()
  if (!current || current.sql.includes("'won'")) return
  const definition = /CREATE TABLE IF NOT EXISTS deals \(([\s\S]*?)\n\);/u.exec(schema)?.[1]
  if (!definition) throw new Error('schema.sql has no deals table')
  const columns = (db.pragma('table_info(deals)') as { name: string }[]).map((column) => column.name).join(', ')
  db.pragma('foreign_keys = OFF')
  try {
    db.transaction(() => {
      db.exec(`CREATE TABLE deals_rebuilt (${definition}\n)`)
      db.exec(`INSERT INTO deals_rebuilt (${columns}) SELECT ${columns} FROM deals`)
      db.exec('DROP TABLE deals')
      db.exec('ALTER TABLE deals_rebuilt RENAME TO deals')
      if ((db.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('The deals rebuild broke a foreign key')
    })()
  } finally {
    db.pragma('foreign_keys = ON')
  }
  db.exec(schema)
}

// data_version changes when another connection commits, so one read-only connection sees the writes of the API and the worker.
export function watchDatabase(file: string, onChange: () => void, intervalMs: number): () => void {
  const watcher = new Database(file, { readonly: true, fileMustExist: true })
  let version = watcher.pragma('data_version', { simple: true })
  const timer = setInterval(() => {
    const next = watcher.pragma('data_version', { simple: true })
    if (next === version) return
    version = next
    onChange()
  }, intervalMs)
  timer.unref()
  return () => {
    clearInterval(timer)
    watcher.close()
  }
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
