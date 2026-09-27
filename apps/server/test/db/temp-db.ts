import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { openDb } from '../../src/db/index.ts'
import type { Db } from '../../src/db/index.ts'

export interface TempDb {
  db: Db
  dir: string
  file: string
  close: () => void
}

export function tempDb(): TempDb {
  const dir = mkdtempSync(path.join(tmpdir(), 'mergero-db-'))
  const file = path.join(dir, 'data', 'app.sqlite')
  const db = openDb(file)
  return {
    db,
    dir,
    file,
    close: () => {
      if (db.open) db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
