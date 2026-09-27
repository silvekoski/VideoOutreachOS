import { getDb } from '../../db/index.ts'
import type { Db } from '../../db/index.ts'
import { createProviders } from '../../providers/index.ts'
import type { Providers } from '../../providers/types.ts'

export type AdminProviders = Pick<Providers, 'pipedrive' | 'linkedin'>

export interface AdminOptions {
  db?: Db
  providers?: AdminProviders
  clock?: () => Date
}

export interface AdminContext {
  readonly db: Db
  readonly now: Date
  readonly providers: AdminProviders
}

let options: AdminOptions = {}
let created: AdminProviders | null = null

export function configureAdmin(next: AdminOptions): void {
  options = { ...options, ...next }
}

export function adminContext(): AdminContext {
  return {
    db: options.db ?? getDb(),
    now: options.clock?.() ?? new Date(),
    get providers() {
      return options.providers ?? (created ??= createProviders())
    },
  }
}
