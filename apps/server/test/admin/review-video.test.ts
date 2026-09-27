import { rmSync } from 'node:fs'
import type { ApiError, ReviewDto, Timeline } from '@mergero/shared'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Harness } from './harness.ts'

await vi.hoisted(async () => (await import('./temp-storage.ts')).useTempStorage())

const { paths } = await import('../../src/paths.ts')
const { createVersion, markRenderStatus, setSlideTimes } = await import('../../src/domain/timelines.ts')
const { SCRAPE_OK, SLIDE_TIMES, T0, insertAnalyst, insertDeal, makeTimeline } = await import('../domain/fixtures.ts')
const { createHarness, jsonBody, writeStorageFile } = await import('./harness.ts')

let h: Harness

function renderVersion(timeline: Timeline): void {
  createVersion(h.db, 100, timeline, T0)
  setSlideTimes(h.db, 100, timeline.version, SLIDE_TIMES)
  markRenderStatus(h.db, 100, timeline.version, 'rendered', T0)
  writeStorageFile(`deals/100/video-1080.v${timeline.version}.mp4`, 'video')
}

function withIntroTranscript(timeline: Timeline, transcript: string | null | undefined): Timeline {
  const variables = timeline.segments[0]?.variables
  if (variables?.template !== 'facecam') throw new Error('The first segment must be the face-cam intro')
  if (transcript === undefined) Reflect.deleteProperty(variables, 'transcript')
  else variables.transcript = transcript
  return timeline
}

beforeEach(() => {
  h = createHarness()
  insertAnalyst(h.db)
  insertDeal(h.db, { id: 100, patch: { scrape: SCRAPE_OK } })
})

afterEach(() => h.close())

afterAll(() => rmSync(paths.root, { recursive: true, force: true }))

describe('review video', () => {
  it('keeps the slide times and captions of the played version after an edit', async () => {
    renderVersion(makeTimeline(100, { audio: 'ok' }))
    const edit = await h.json<ReviewDto>('/api/deals/100/review', jsonBody('PATCH', { scripts: { 2: 'A new script for slide two.' } }))
    expect(edit.status).toBe(200)
    expect(edit.body.version).toBe(2)
    expect(edit.body.timeline.segments.every((segment) => segment.startS === null)).toBe(true)
    expect(edit.body.video).toEqual({
      version: 1,
      url: '/api/deals/100/files/video-1080.v1.mp4',
      captionsUrl: '/api/deals/100/captions.v1.vtt',
      language: 'fi',
      slides: SLIDE_TIMES,
    })
  })

  it('gives no video before the first render', async () => {
    createVersion(h.db, 100, makeTimeline(100, { audio: 'ok' }), T0)
    expect((await h.json<ReviewDto>('/api/deals/100/review')).body.video).toBeNull()
  })
})

describe('GET /api/deals/:id/captions.v:n.vtt', () => {
  it('builds the captions of any rendered version, with the analyst transcript as the fallback', async () => {
    renderVersion(withIntroTranscript(makeTimeline(100, { audio: 'ok' }), undefined))
    await h.request('/api/deals/100/review', jsonBody('PATCH', { scripts: { 2: 'A new script for slide two.' } }))
    const response = await h.request('/api/deals/100/captions.v1.vtt')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    const text = await response.text()
    expect(text.startsWith('WEBVTT\n\n1\n00:00:00.000 --> ')).toBe(true)
    expect(text).toContain('Hei, olen Aino Mergerosta.')
    expect(text).toContain('Script of slide 2.')
    expect(text).not.toContain('A new script')
  })

  it('uses the intro transcript stored in the version', async () => {
    renderVersion(withIntroTranscript(makeTimeline(100, { audio: 'ok' }), 'Words of the old recording.'))
    renderVersion(withIntroTranscript(makeTimeline(100, { audio: 'ok', version: 2 }), null))
    const first = await (await h.request('/api/deals/100/captions.v1.vtt')).text()
    expect(first).toContain('Words of the old recording.')
    expect(first).not.toContain('Hei, olen')
    const second = await (await h.request('/api/deals/100/captions.v2.vtt')).text()
    expect(second).not.toContain('Hei, olen')
    expect(second).toContain('Script of slide 2.')
  })

  it('gives 404 for a version with no render and 400 for a bad version', async () => {
    renderVersion(makeTimeline(100, { audio: 'ok' }))
    await h.request('/api/deals/100/review', jsonBody('PATCH', { scripts: { 2: 'A new script for slide two.' } }))
    expect(await h.json<ApiError>('/api/deals/100/captions.v2.vtt')).toEqual({
      status: 404,
      body: { error: 'Version 2 of deal 100 has no rendered video yet' },
    })
    expect((await h.request('/api/deals/100/captions.v9.vtt')).status).toBe(404)
    expect((await h.request('/api/deals/100/captions.v0.vtt')).status).toBe(400)
    expect((await h.request('/api/deals/999/captions.v1.vtt')).status).toBe(404)
    expect((await h.request('/api/deals/100/captions.vtt')).status).toBe(404)
  })
})
