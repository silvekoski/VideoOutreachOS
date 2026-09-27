import { DEAL_STATUSES } from '@mergero/shared'
import { describe, expect, it } from 'vitest'
import { AUDIO_META, INTEREST_SCORE, STATUS_META, audioMeta } from '../../src/admin/lib/status'

describe('STATUS_META', () => {
  it('gives each status a word and a shape', () => {
    for (const status of DEAL_STATUSES) {
      expect(STATUS_META[status].label.length).toBeGreaterThan(0)
      expect(STATUS_META[status].shape).toBeTruthy()
    }
  })

  it('uses a distinct shape for each status', () => {
    const shapes = DEAL_STATUSES.map((status) => STATUS_META[status].shape)
    expect(new Set(shapes).size).toBe(DEAL_STATUSES.length)
  })

  it('uses a distinct word for each status', () => {
    const labels = DEAL_STATUSES.map((status) => STATUS_META[status].label)
    expect(new Set(labels).size).toBe(DEAL_STATUSES.length)
  })
})

describe('audioMeta', () => {
  it('shows New audio for an edited slide', () => {
    expect(audioMeta('ok', true).label).toBe('New audio')
  })

  it('shows No audio when the status is unknown', () => {
    expect(audioMeta(null, false)).toBe(AUDIO_META.missing)
  })

  it('maps a failed clip to a cross shape', () => {
    expect(audioMeta('failed', false).shape).toBe('cross')
  })
})

describe('INTEREST_SCORE', () => {
  it('orders the levels by bar count', () => {
    expect(INTEREST_SCORE.low).toBeLessThan(INTEREST_SCORE.medium)
    expect(INTEREST_SCORE.medium).toBeLessThan(INTEREST_SCORE.high)
  })
})
