import { test as base } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { EventBatch, VideoPageData } from '../packages/shared/src/types.ts'
import { adminClient, readState } from './stack.ts'
import type { AdminClient, E2eDeal, E2eState } from './stack.ts'

const PROJECT_DEAL: Record<string, 'de' | 'ch'> = { 'mobile-chrome': 'de', 'mobile-safari': 'ch' }

export const test = base.extend<{ state: E2eState; admin: AdminClient; projectDeal: E2eDeal }>({
  state: async ({}, use) => {
    await use(readState())
  },
  baseURL: async ({ state }, use) => {
    await use(state.baseUrl)
  },
  admin: async ({ state }, use) => {
    await use(adminClient(state.baseUrl))
  },
  projectDeal: async ({ state }, use, testInfo) => {
    const key = PROJECT_DEAL[testInfo.project.name]
    if (key === undefined) throw new Error(`The project ${testInfo.project.name} has no deal`)
    await use(state.deals[key])
  },
})

export { expect } from '@playwright/test'

export async function pageData(page: Page): Promise<VideoPageData> {
  return JSON.parse((await page.locator('#bootstrap').textContent()) ?? 'null') as VideoPageData
}

export function isEventsPost(url: string, method: string): boolean {
  return method === 'POST' && /\/v\/[^/]+\/events(?:\?|$)/u.test(url)
}

export function eventBatches(page: Page): EventBatch[] {
  const batches: EventBatch[] = []
  page.on('request', (request) => {
    const body = request.postData()
    if (isEventsPost(request.url(), request.method()) && body) batches.push(JSON.parse(body) as EventBatch)
  })
  return batches
}
