import type { ReviewReason } from '@mergero/shared'

const NAME_SLOTS: ReadonlySet<string> = new Set(['facecam.name', 'your-company.company', 'book-meeting.name'])

export function isNameTooLong(reason: ReviewReason): boolean {
  return reason.code === 'text_too_long' && reason.slot !== undefined && NAME_SLOTS.has(reason.slot)
}
