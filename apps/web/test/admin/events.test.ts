import { describe, expect, it } from 'vitest'
import { channelLabel, eventDetail, eventLabel } from '../../src/admin/lib/events'

describe('eventLabel', () => {
  it('names the channel of an open', () => {
    expect(eventLabel({ type: 'open', channel: 'whatsapp', data: {} })).toBe('Opened on WhatsApp')
    expect(eventLabel({ type: 'open', channel: 'direct', data: {} })).toBe('Opened from a direct link')
  })

  it('names the task type', () => {
    expect(eventLabel({ type: 'task_created', channel: null, data: { type: 'call' } })).toBe('Call task created')
    expect(eventLabel({ type: 'task_done', channel: null, data: { type: 'second_channel', channel: 'sms' } })).toBe(
      'Second channel task (SMS) done',
    )
  })

  it('uses the fixed label for other events', () => {
    expect(eventLabel({ type: 'brief_read', channel: null, data: {} })).toBe('Meeting brief read')
  })
})

describe('eventDetail', () => {
  it('lists the plain values of the event data', () => {
    expect(eventDetail({ from: 12.345, fieldName: 'revenue', nested: { a: 1 } })).toBe('from: 12.3, field name: revenue')
  })

  it('skips the given keys and returns null without values', () => {
    expect(eventDetail({ from: 1 }, ['from'])).toBeNull()
    expect(eventDetail({})).toBeNull()
  })
})

describe('channelLabel', () => {
  it('names each channel', () => {
    expect(channelLabel('linkedin')).toBe('LinkedIn')
    expect(channelLabel(null)).toBe('Direct')
    expect(channelLabel('fax')).toBe('fax')
  })
})
