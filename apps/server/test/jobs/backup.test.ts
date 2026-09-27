import { removeStorage } from './storage-env.ts'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BACKUPS_KEPT } from '../../src/jobs/backup.ts'
import { runJob } from '../../src/jobs/runner.ts'
import { paths } from '../../src/paths.ts'
import { claimNext, enqueue, getJob, jobKeys } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { T0, insertAnalyst } from '../domain/fixtures.ts'
import { makeContext } from './helpers.ts'
import type { TestContext } from './helpers.ts'

let t: TempDb
let ctx: TestContext

afterAll(removeStorage)

beforeEach(() => {
  t = tempDb()
  ctx = makeContext(t.db, { now: T0 })
  insertAnalyst(t.db)
})

afterEach(() => t.close())

async function backup(date: string): Promise<AnyJob> {
  enqueue(t.db, 'backup', `${jobKeys.backup(T0)}:${date}`, { date }, { now: T0 })
  const job = claimNext(t.db, T0)
  if (!job) throw new Error('No due job')
  await runJob(ctx, job)
  return getJob(t.db, job.id) as AnyJob
}

describe('backup job', () => {
  it('copies the database with the backup API and keeps the newest 14 backups', async () => {
    await mkdir(paths.backupsDir, { recursive: true })
    const old = Array.from({ length: 15 }, (_, index) => `app-2026-09-${String(index + 1).padStart(2, '0')}.sqlite`)
    await Promise.all(
      [...old, 'app-2026-09-20.sqlite.partial', 'notes.txt'].map((name) => writeFile(path.join(paths.backupsDir, name), 'old')),
    )

    expect((await backup('2026-09-26')).status).toBe('done')

    const copy = new Database(paths.backup('2026-09-26'), { readonly: true })
    try {
      expect(copy.prepare('SELECT name FROM analysts').all()).toEqual([{ name: 'Aino Analyst' }])
    } finally {
      copy.close()
    }
    const names = (await readdir(paths.backupsDir)).sort()
    expect(names.filter((name) => name.endsWith('.sqlite'))).toEqual([...old.slice(-(BACKUPS_KEPT - 1)), 'app-2026-09-26.sqlite'])
    expect(names).toContain('notes.txt')
    expect(names.some((name) => name.endsWith('.partial'))).toBe(false)
  })

  it('fails at once for a date that is not YYYY-MM-DD', async () => {
    const job = await backup('../../escape')
    expect(job).toMatchObject({ status: 'failed', attempts: 1 })
    expect(job.error).toContain('is not YYYY-MM-DD')
  })
})
