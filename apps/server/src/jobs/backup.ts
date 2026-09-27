import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { log } from '../log.ts'
import { paths } from '../paths.ts'
import { NonRetryableError } from '../queue/index.ts'
import type { JobHandler } from './types.ts'

export const BACKUPS_KEPT = 14
const BACKUP_FILE = /^app-\d{4}-\d{2}-\d{2}\.sqlite$/u
const PARTIAL_SUFFIX = '.partial'

async function rotate(): Promise<string[]> {
  const names = await readdir(paths.backupsDir)
  const old = names
    .filter((name) => BACKUP_FILE.test(name))
    .sort()
    .reverse()
    .slice(BACKUPS_KEPT)
  const stale = names.filter((name) => name.endsWith(PARTIAL_SUFFIX))
  await Promise.all([...old, ...stale].map((name) => rm(path.join(paths.backupsDir, name), { force: true })))
  return old
}

export const backupHandler: JobHandler<'backup'> = {
  async run(job, ctx) {
    const { date } = job.payload
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new NonRetryableError(`The backup date "${date}" is not YYYY-MM-DD`)
    const file = paths.backup(date)
    const partial = `${file}${PARTIAL_SUFFIX}`
    await mkdir(paths.backupsDir, { recursive: true })
    try {
      await ctx.db.backup(partial)
      await rename(partial, file)
    } catch (error) {
      await rm(partial, { force: true })
      throw error
    }
    const removed = await rotate()
    log.info('database backup written', { file, removed })
  },
}
