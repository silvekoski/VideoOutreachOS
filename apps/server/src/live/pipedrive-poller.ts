import { sql } from '../db/index.ts'
import type { Db } from '../db/index.ts'
import { applyPipedriveChanges } from '../domain/pipedrive-sync.ts'
import type { SyncOutcome, SyncProviders } from '../domain/pipedrive-sync.ts'
import { log } from '../log.ts'
import type { PipedriveChange, PipedriveChanges } from '../providers/types.ts'
import type { LiveHub } from './hub.ts'

export const WATCHED_MS = 10_000
export const IDLE_MS = 60_000
export const SAVING_MS = 120_000
const LOW_BUDGET_SHARE = 0.2
const CURSOR_KEY = 'pipedrive_recents_cursor'

export interface PollerOptions {
  db: Db
  providers: SyncProviders
  hub: LiveHub
  clock?: () => Date
}

export function recentsTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

const changeKey = (change: PipedriveChange) => `${change.type}:${change.id}:${change.updatedAt ?? ''}`

export class PipedrivePoller {
  readonly #options: PollerOptions
  #timer: NodeJS.Timeout | null = null
  #nextAt = 0
  #running = false
  #stopped = false
  #seen = new Set<string>()
  #budget: PipedriveChanges['budget'] = null

  constructor(options: PollerOptions) {
    this.#options = options
  }

  start(): void {
    this.#schedule(0)
  }

  stop(): void {
    this.#stopped = true
    if (this.#timer) clearTimeout(this.#timer)
  }

  wake(): void {
    if (!this.#running && this.#nextAt - Date.now() > WATCHED_MS) this.#schedule(0)
  }

  delayMs(): number {
    const budget = this.#budget
    if (budget && budget.remaining < budget.limit * LOW_BUDGET_SHARE) return SAVING_MS
    return this.#options.hub.size > 0 ? WATCHED_MS : IDLE_MS
  }

  async poll(): Promise<SyncOutcome> {
    const { db, providers, hub } = this.#options
    const now = this.#options.clock?.() ?? new Date()
    const cursor = sql<{ value: string }>(db, 'SELECT value FROM sync_state WHERE key = ?').get(CURSOR_KEY)?.value ?? recentsTimestamp(now)
    const page = await providers.pipedrive.listChanges(cursor)
    this.#budget = page.budget
    const changes = page.changes.filter((change) => !this.#seen.has(changeKey(change)))
    this.#seen = new Set(page.changes.map(changeKey))
    const outcome = await applyPipedriveChanges(db, providers, changes, now)
    sql(db, 'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(CURSOR_KEY, page.cursor)
    if (outcome.dealIds.length > 0 || outcome.prospects) {
      log.info('pipedrive changes applied', { changes: changes.length, deals: outcome.dealIds, prospects: outcome.prospects })
      hub.publish({ type: 'pipedrive', ...outcome })
    }
    return outcome
  }

  #schedule(delayMs: number): void {
    if (this.#stopped) return
    if (this.#timer) clearTimeout(this.#timer)
    this.#nextAt = Date.now() + delayMs
    this.#timer = setTimeout(() => void this.#tick(), delayMs)
    this.#timer.unref()
  }

  async #tick(): Promise<void> {
    this.#running = true
    try {
      await this.poll()
    } catch (error) {
      log.warn('the Pipedrive poll failed, the next poll tries again', { error })
    } finally {
      this.#running = false
    }
    this.#schedule(this.delayMs())
  }
}
