import { describe, expect, it } from 'vitest'
import { isNameTooLong } from '../../src/admin/review/name-reasons'

describe('isNameTooLong', () => {
  it('finds a text that is too long only in the company or analyst name slots', () => {
    const tooLong = (slot: string) => ({ code: 'text_too_long' as const, slide: 3 as const, slot, detail: 'Too long' })
    expect(isNameTooLong(tooLong('your-company.company'))).toBe(true)
    expect(isNameTooLong(tooLong('facecam.name'))).toBe(true)
    expect(isNameTooLong(tooLong('book-meeting.name'))).toBe(true)
    expect(isNameTooLong(tooLong('your-company.line'))).toBe(false)
    expect(isNameTooLong({ code: 'script_check', slide: 3, slot: 'your-company.company', detail: 'Check' })).toBe(false)
    expect(isNameTooLong({ code: 'text_too_long', slide: 3, detail: 'No slot' })).toBe(false)
  })
})
