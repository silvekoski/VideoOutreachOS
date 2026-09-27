import { describe, expect, it } from 'vitest'
import {
  approvalState,
  createId,
  currentBlock,
  generalReasons,
  isValidExpiryDays,
  needsRemake,
  padLines,
  reasonListKey,
  reasonsForSlide,
  sameLines,
  versionPublished,
} from '../../src/admin/lib/review'
import { slideWatchRows } from '../../src/admin/lib/watch'

describe('padLines', () => {
  it('always gives three lines', () => {
    expect(padLines([])).toEqual(['', '', ''])
    expect(padLines(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c'])
  })

  it('compares line lists', () => {
    expect(sameLines(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameLines(['a', 'b'], ['a', 'c'])).toBe(false)
  })
})

describe('review reasons', () => {
  const reasons = [
    { code: 'text_too_long' as const, slide: 5 as const, detail: 'Slide 5, buyer focus: 96 of 80 characters' },
    { code: 'no_voice' as const, detail: 'No voice clone' },
  ]

  it('splits the reasons by slide', () => {
    expect(reasonsForSlide(reasons, 5)).toHaveLength(1)
    expect(reasonsForSlide(reasons, 2)).toHaveLength(0)
    expect(generalReasons(reasons).map((reason) => reason.code)).toEqual(['no_voice'])
  })

  it('offers a new video only when the Pipedrive data of the video changed', () => {
    expect(needsRemake(reasons)).toBe(false)
    expect(needsRemake([...reasons, { code: 'remake_needed', detail: 'The NACE code changed in Pipedrive.' }])).toBe(true)
  })
})

describe('slideWatchRows', () => {
  it('gives one row per slide and fills the missing slides with zero', () => {
    const rows = slideWatchRows([{ slide: 3, watchS: 12.5, replays: 2 }])
    expect(rows).toHaveLength(8)
    expect(rows[2]).toEqual({ slide: 3, watchS: 12.5, replays: 2 })
    expect(rows[0]).toEqual({ slide: 1, watchS: 0, replays: 0 })
  })
})

describe('publish state', () => {
  const failed = [{ id: 7, type: 'render', error: 'Render timed out', updatedAt: '2026-09-26T12:00:00.000Z' }]

  it('counts only the reviewed version as published', () => {
    expect(versionPublished({ version: 2, publishedVersion: 2 })).toBe(true)
    expect(versionPublished({ version: 2, publishedVersion: 1 })).toBe(false)
    expect(versionPublished({ version: 1, publishedVersion: null })).toBe(false)
  })

  it('waits for an approved version that is not live until a job fails', () => {
    const approved = {
      approved: true,
      version: 2,
      publishedVersion: 1,
      status: 'link_sent' as const,
      expired: false,
      renderStatus: 'rendering' as const,
      failedJobs: [],
      reviewReasons: [],
    }
    expect(approvalState(approved)).toBe('waiting')
    expect(approvalState({ ...approved, failedJobs: failed })).toBe('failed')
    expect(approvalState({ ...approved, renderStatus: 'failed' })).toBe('failed')
    expect(approvalState({ ...approved, publishedVersion: 2 })).toBe('published')
    expect(approvalState({ ...approved, approved: false })).toBeNull()
  })

  it('does not wait for an approved version that a review reason blocks', () => {
    const blocked = {
      approved: true,
      version: 1,
      publishedVersion: null,
      status: 'review' as const,
      expired: false,
      renderStatus: 'pending' as const,
      failedJobs: [],
      reviewReasons: [{ code: 'script_missing' as const, slide: 5 as const, detail: 'Slide 5 has no script' }],
    }
    expect(approvalState(blocked)).toBe('blocked')
    expect(approvalState({ ...blocked, status: 'lost' })).toBe('closed')
    expect(approvalState({ ...blocked, reviewReasons: [], expired: true })).toBe('closed')
  })
})

describe('currentBlock', () => {
  const linesMissing = { code: 'lines_missing' as const, slide: 3 as const, detail: 'Slide 3 needs two or three lines about the company' }
  const noVoice = { code: 'no_voice' as const, detail: 'Aino Analyst has no voice clone' }

  it('keeps the reasons of the 409 while the live reasons stay the same', () => {
    const block = { reasons: [linesMissing], live: reasonListKey([linesMissing, noVoice]) }
    expect(currentBlock(block, [linesMissing, noVoice])).toEqual([linesMissing])
    expect(currentBlock(null, [linesMissing])).toBeNull()
  })

  it('drops the reasons of the 409 when an edit changes the live reasons', () => {
    const block = { reasons: [linesMissing], live: reasonListKey([linesMissing, noVoice]) }
    expect(currentBlock(block, [noVoice])).toBeNull()
    expect(currentBlock(block, [])).toBeNull()
    expect(currentBlock(block, [{ ...linesMissing, detail: 'Slide 3 needs one more line' }, noVoice])).toBeNull()
  })
})

describe('other helpers', () => {
  it('checks the expiry days', () => {
    expect(isValidExpiryDays(1)).toBe(true)
    expect(isValidExpiryDays(365)).toBe(true)
    expect(isValidExpiryDays(0)).toBe(false)
    expect(isValidExpiryDays(12.5)).toBe(false)
  })

  it('makes unique IDs', () => {
    expect(createId()).not.toBe(createId())
  })
})
