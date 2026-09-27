import { getDb } from '../../db/index.ts'
import type { Db } from '../../db/index.ts'
import { LiveHub } from '../../live/hub.ts'
import { createProviders } from '../../providers/index.ts'
import type { Providers } from '../../providers/types.ts'

export type AdminProviders = Pick<Providers, 'pipedrive' | 'linkedin' | 'model'>

export interface AdminOptions {
  db?: Db
  providers?: AdminProviders
  hub?: LiveHub
  clock?: () => Date
}

export interface AdminContext {
  readonly db: Db
  readonly now: Date
  readonly providers: AdminProviders
  readonly hub: LiveHub
}

let options: AdminOptions = {}
let created: AdminProviders | null = null
const defaultHub = new LiveHub()

export function configureAdmin(next: AdminOptions): void {
  options = { ...options, ...next }
}

export function adminContext(): AdminContext {
  return {
    db: options.db ?? getDb(),
    now: options.clock?.() ?? new Date(),
    hub: options.hub ?? defaultHub,
    get providers() {
      return options.providers ?? (created ??= createProviders())
    },
  }
}
