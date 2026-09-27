import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { sql } from '../../src/db/index.ts'
import { enqueue } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'

const run = promisify(execFile)
const claimer = fileURLToPath(new URL('./claimer.ts', import.meta.url))
const JOBS = 600
const CLAIMERS = 3

let t: TempDb

beforeEach(() => {
  t = tempDb()
})

afterEach(() => {
  t.close()
})

it('never gives one job to two claimers in separate processes', { timeout: 30_000 }, async () => {
  const past = new Date(Date.now() - 1000)
  for (let n = 0; n < JOBS; n++) enqueue(t.db, 'sweep', `sweep:${n}`, { hour: String(n) }, { now: past })
  const startAt = String(Date.now() + 1500)
  const results = await Promise.all(
    Array.from({ length: CLAIMERS }, () => run(process.execPath, [claimer, t.file, startAt], { timeout: 25_000 })),
  )
  const lists = results.map((result) => JSON.parse(result.stdout) as number[])
  const all = lists.flat()
  expect(all).toHaveLength(JOBS)
  expect(new Set(all).size).toBe(JOBS)
  expect(lists.filter((list) => list.length > 0).length).toBeGreaterThan(1)
  const rows = sql<{ status: string; attempts: number; n: number }>(
    t.db,
    'SELECT status, attempts, COUNT(*) AS n FROM jobs GROUP BY status, attempts',
  ).all()
  expect(rows).toEqual([{ status: 'done', attempts: 1, n: JOBS }])
})
