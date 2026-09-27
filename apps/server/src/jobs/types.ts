import type { renderTemplatePreviews, renderTimeline } from '@mergero/scene'
import type { Db } from '../db/index.ts'
import type { Providers } from '../providers/types.ts'
import type { Job, JobType } from '../queue/index.ts'

export interface SceneRenderer {
  renderTimeline: typeof renderTimeline
  renderTemplatePreviews: typeof renderTemplatePreviews
}

export interface JobContext {
  db: Db
  providers: Providers
  scene: SceneRenderer
  now: () => Date
  sleep: (ms: number) => Promise<void>
}

export interface JobHandler<T extends JobType> {
  run(job: Job<T>, ctx: JobContext): Promise<void>
  onFinalFailure?(job: Job<T>, error: unknown, ctx: JobContext): Promise<void>
}
