import { removeStorage } from './storage-env.ts'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { RenderInputError } from '@mergero/scene'
import { frames } from '@mergero/shared'
import type { RenderInput, SlideSegment, Timeline } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { requireDeal, updateDeal } from '../../src/domain/deals.ts'
import { advance } from '../../src/domain/pipeline.ts'
import { createVersion, getTimeline, newestTimeline, updateVersion } from '../../src/domain/timelines.ts'
import { ensureTemplatePreviews, sceneHash } from '../../src/jobs/render.ts'
import { runJob } from '../../src/jobs/runner.ts'
import type { SceneRenderer } from '../../src/jobs/types.ts'
import { paths } from '../../src/paths.ts'
import { NonRetryableError, claimNext, getJob, jobKeys, jobsForDeal } from '../../src/queue/index.ts'
import type { AnyJob } from '../../src/queue/index.ts'
import { tempDb } from '../db/temp-db.ts'
import type { TempDb } from '../db/temp-db.ts'
import { DEAL_ID, SCRAPE_OK, T0, insertAnalyst, insertDeal, makeTimeline, readyIntroFor } from '../domain/fixtures.ts'
import { makeContext, testVideo } from './helpers.ts'
import type { TestContext } from './helpers.ts'

let t: TempDb
let ctx: TestContext
let inputs: RenderInput[]

afterAll(removeStorage)

beforeEach(() => {
  t = tempDb()
  inputs = []
  insertAnalyst(t.db, { intros: { fi: { ...readyIntroFor('fi'), durationS: 1 } } })
  insertDeal(t.db, { patch: { scrape: SCRAPE_OK } })
})

afterEach(() => t.close())

function stubRender(options: { audio?: boolean; fail?: Error } = {}): SceneRenderer['renderTimeline'] {
  return async ({ input, outFile }) => {
    inputs.push(input)
    if (options.fail) throw options.fail
    const planned = input.timeline.segments.reduce((sum, segment) => sum + frames(segment.durationS ?? 0, input.timeline.fps), 0)
    const count = planned + 1
    await testVideo(outFile, count / 30, { audio: options.audio ?? true })
    return { file: outFile, frames: count, durationS: count / 30 }
  }
}

function withShortAudio(timeline: Timeline): Timeline {
  for (const segment of timeline.segments) {
    if (segment.template !== 'facecam') segment.audio.durationS = 0.5
  }
  return timeline
}

function queueRender(scene: Partial<SceneRenderer>): void {
  ctx = makeContext(t.db, { now: T0, scene })
  createVersion(t.db, DEAL_ID, withShortAudio(makeTimeline(DEAL_ID, { audio: 'ok' })), T0)
  expect(advance(t.db, DEAL_ID, T0).action).toBe('render')
}

async function runNext(): Promise<AnyJob> {
  const job = claimNext(t.db, ctx.now())
  if (!job) throw new Error('No due job')
  await runJob(ctx, job)
  return getJob(t.db, job.id) as AnyJob
}

describe('render job, deal', () => {
  it('renders, makes the 1080p, 720p and poster files, writes the actual slide times and moves the deal to review', async () => {
    queueRender({ renderTimeline: stubRender() })

    const job = await runNext()

    expect(job.status).toBe('done')
    const input = inputs[0] as RenderInput
    expect(input.storageDir).toBe(paths.root)
    expect(input.brand.logoOnDark).toBe('config/mergero-logo-white.svg')
    expect(input.timeline.segments[0]).toMatchObject({
      durationS: 1,
      startS: 0,
      endS: 1,
      variables: { videoFile: 'analysts/10/intro-fi.mp4', transcript: 'Hei, olen Aino Mergerosta.' },
    })
    expect(input.timeline.segments[1]).toMatchObject({ durationS: 0.9, startS: 1, endS: 1.9 })
    for (const file of [paths.video1080(DEAL_ID, 1), paths.video720(DEAL_ID, 1), paths.poster(DEAL_ID, 1)]) {
      expect((await stat(file)).size).toBeGreaterThan(0)
    }
    const row = getTimeline(t.db, DEAL_ID, 1)
    expect(row).toMatchObject({ renderStatus: 'rendered', renderedAt: T0.toISOString() })
    const segments = row?.timeline.segments ?? []
    expect(segments.map((segment) => [segment.slide, segment.startS])).toEqual([
      [1, 0], [2, 1], [3, 1.9], [4, 2.8], [5, 3.7], [6, 4.6], [7, 5.5], [8, 6.4],
    ])
    expect(segments.at(-1)?.endS).toBeCloseTo(220 / 30, 6)
    expect(requireDeal(t.db, DEAL_ID).status).toBe('review')
  })

  it('retries a silent render and marks the version failed after a final failure', async () => {
    queueRender({ renderTimeline: stubRender({ audio: false }) })
    const silent = await runNext()
    expect(silent).toMatchObject({ status: 'queued', attempts: 1 })
    expect(silent.error).toContain('is silent')
    expect(getTimeline(t.db, DEAL_ID, 1)?.renderStatus).toBe('rendering')

    ctx.scene.renderTimeline = stubRender({ fail: new NonRetryableError('Render failed: Chrome crashed') })
    ctx.clock.now = new Date(T0.getTime() + 10 * 60_000)
    const failed = await runNext()
    expect(failed.status).toBe('failed')
    expect(getTimeline(t.db, DEAL_ID, 1)?.renderStatus).toBe('failed')
    expect(requireDeal(t.db, DEAL_ID).status).toBe('failed')
  })

  it('fails at once when a media file is missing', async () => {
    queueRender({ renderTimeline: stubRender({ fail: new RenderInputError('Render input file is missing: /storage/deals/100/audio/slide-2.v1.mp3 (slide 2 audio)') }) })

    const job = await runNext()

    expect(job).toMatchObject({ status: 'failed', attempts: 1 })
    expect(job.error).toContain('Render input file is missing')
    expect(getTimeline(t.db, DEAL_ID, 1)?.renderStatus).toBe('failed')
    expect(requireDeal(t.db, DEAL_ID).status).toBe('failed')
  })

  it('does nothing for a deal whose link has expired', async () => {
    queueRender({ renderTimeline: stubRender() })
    updateDeal(t.db, DEAL_ID, { expiresAt: T0.toISOString(), expiredAt: T0.toISOString() }, T0)

    const job = await runNext()

    expect(job.status).toBe('done')
    expect(inputs).toEqual([])
    expect(getTimeline(t.db, DEAL_ID, 1)?.renderStatus).toBe('rendering')
  })

  it('stops before the render when a text is too long and puts a new version up for review', async () => {
    queueRender({ renderTimeline: stubRender() })
    updateVersion(t.db, DEAL_ID, 1, (timeline) => {
      const buyers = timeline.segments.find((segment): segment is SlideSegment => segment.slide === 5)
      const first = buyers?.variables.template === 'buyers' ? buyers.variables.buyers[0] : undefined
      if (first) first.focus = 'x'.repeat(95)
      return timeline
    })

    const job = await runNext()

    expect(job.status).toBe('done')
    expect(inputs).toEqual([])
    expect(getTimeline(t.db, DEAL_ID, 1)?.renderStatus).toBe('failed')
    expect(newestTimeline(t.db, DEAL_ID)).toMatchObject({ version: 2, renderStatus: 'pending' })
    const deal = requireDeal(t.db, DEAL_ID)
    expect(deal.status).toBe('review')
    expect(deal.reviewReasons).toContainEqual(expect.objectContaining({ code: 'text_too_long', slide: 5, slot: 'buyers.focus' }))
  })
})

describe('render job, template previews', () => {
  it('queues the previews when they are missing, renders them and queues them again after a deletion', async () => {
    ctx = makeContext(t.db, {
      now: T0,
      scene: {
        renderTemplatePreviews: async ({ outDir }) => {
          const files = [1, 2, 3, 4, 5, 6, 7, 8].map((slide) => path.join(outDir, `slide-${slide}.jpg`))
          await Promise.all(files.map((file) => writeFile(file, 'jpeg')))
          return files
        },
      },
    })
    const hash = await sceneHash()
    await mkdir(paths.templatesDir, { recursive: true })

    expect(await ensureTemplatePreviews(ctx)).toBe(true)
    const job = await runNext()
    expect(job).toMatchObject({ type: 'render', key: jobKeys.renderPreview(hash), status: 'done' })
    expect((await readFile(path.join(paths.templatesDir, 'scene-hash'), 'utf8')).trim()).toBe(hash)
    expect(await ensureTemplatePreviews(ctx)).toBe(false)

    await rm(paths.templatePreview(4))
    expect(await ensureTemplatePreviews(ctx)).toBe(true)
    expect(getJob(t.db, job.id)?.status).toBe('queued')
    expect(jobsForDeal(t.db, DEAL_ID, ['render'])).toEqual([])
  })
})
