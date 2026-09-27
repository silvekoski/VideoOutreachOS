import { DEAL_STATUSES } from '@mergero/shared'
import { describe, expect, it } from 'vitest'
import { AUDIO_META, INTEREST_BARS, PUBLISHED_STATUSES, STATUS_META, audioMeta } from '../../src/admin/lib/status'

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

  it('treats the five Pipedrive stages as published', () => {
    expect([...PUBLISHED_STATUSES].sort()).toEqual(['form_sent', 'link_sent', 'lost', 'meeting_booked', 'opened'])
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

describe('INTEREST_BARS', () => {
  it('orders the levels by bar count', () => {
    expect(INTEREST_BARS.low).toBeLessThan(INTEREST_BARS.medium)
    expect(INTEREST_BARS.medium).toBeLessThan(INTEREST_BARS.high)
  })
})
