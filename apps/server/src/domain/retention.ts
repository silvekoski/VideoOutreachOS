import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { nowIso, sql, transaction } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { log } from '../log.ts'
import { paths } from '../paths.ts'
import { dealEngagement } from './brief-data.ts'
import { requireDeal } from './deals.ts'
import { closeOpenTasks } from './stages.ts'

async function removeLateMedia(db: Db, storageDir: string): Promise<void> {
  const removed: number[] = []
  for (const { id } of sql<{ id: number }>(db, 'SELECT id FROM deals WHERE expired_at IS NOT NULL ORDER BY id').all()) {
    const dir = path.join(storageDir, 'deals', String(id))
    if (!(await stat(dir).catch(() => null))) continue
    try {
      await rm(dir, { recursive: true, force: true })
      removed.push(id)
    } catch (error) {
      log.error('media files written after the expiry could not be deleted, the next sweep tries again', { dealId: id, error })
    }
  }
  if (removed.length > 0) log.warn('media files written after the expiry deleted', { dealIds: removed })
}

export async function purgeExpired(db: Db, now: Date = new Date(), storageDir: string = paths.root): Promise<number[]> {
  await removeLateMedia(db, storageDir)
  const at = nowIso(now)
  const due = sql<{ id: number }>(
    db,
    'SELECT id FROM deals WHERE expired_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ? ORDER BY id',
  ).all(at)
  const purged: number[] = []
  for (const { id } of due) {
    try {
      await rm(path.join(storageDir, 'deals', String(id)), { recursive: true, force: true })
    } catch (error) {
      log.error('the media files of an expired deal could not be deleted, the next sweep tries again', { dealId: id, error })
      continue
    }
    transaction(db, () => {
      closeOpenTasks(db, id, now)
      const deal = requireDeal(db, id)
      const engagement = dealEngagement(db, deal)
      sql(
        db,
        `UPDATE deals SET analytics = json_set(analytics, '$.interest', ?, '$.signals', json(?), '$.saleTiming', ?)
         WHERE id = ? AND analytics IS NOT NULL`,
      ).run(engagement?.interest ?? null, JSON.stringify(engagement?.signals ?? null), deal.form?.timing ?? null, id)
      sql(db, 'DELETE FROM events WHERE deal_id = ?').run(id)
      sql(db, 'DELETE FROM sessions WHERE deal_id = ?').run(id)
      sql(db, 'DELETE FROM briefs WHERE deal_id = ?').run(id)
      sql(
        db,
        `UPDATE deals SET form = NULL, meeting_email = NULL,
           scrape = CASE WHEN scrape IS NULL THEN NULL ELSE json_set(scrape, '$.markdown', NULL) END,
           expired_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(at, at, id)
    })
    purged.push(id)
  }
  if (purged.length > 0) log.info('expired deals purged', { dealIds: purged })
  return purged
}
