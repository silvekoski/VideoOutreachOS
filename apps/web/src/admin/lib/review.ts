import { isClosedStatus } from '@mergero/shared'
import type { ReviewDto, ReviewReason, SlideNumber } from '@mergero/shared'

export const LINE_COUNT = 3

export function padLines(lines: readonly string[]): string[] {
  return Array.from({ length: LINE_COUNT }, (_, index) => lines[index] ?? '')
}

export function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index])
}

export function reasonsForSlide(reasons: readonly ReviewReason[], slide: SlideNumber): ReviewReason[] {
  return reasons.filter((reason) => reason.slide === slide)
}

export function generalReasons(reasons: readonly ReviewReason[]): ReviewReason[] {
  return reasons.filter((reason) => reason.slide === undefined)
}

export function needsRemake(reasons: readonly ReviewReason[]): boolean {
  return reasons.some((reason) => reason.code === 'remake_needed')
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' && globalThis.isSecureContext !== false)
    return crypto.randomUUID()
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function versionPublished(review: Pick<ReviewDto, 'version' | 'publishedVersion'>): boolean {
  return review.publishedVersion === review.version
}

export type ApprovalState = 'published' | 'waiting' | 'blocked' | 'failed' | 'closed'

type ApprovalFields = Pick<
  ReviewDto,
  'approved' | 'version' | 'publishedVersion' | 'status' | 'expired' | 'renderStatus' | 'failedJobs' | 'reviewReasons'
>

export function approvalState(review: ApprovalFields): ApprovalState | null {
  if (!review.approved) return null
  if (versionPublished(review)) return 'published'
  if (isClosedStatus(review.status) || review.expired) return 'closed'
  if (review.failedJobs.length > 0 || review.renderStatus === 'failed') return 'failed'
  return review.reviewReasons.length > 0 ? 'blocked' : 'waiting'
}

export interface ApprovalBlock {
  reasons: ReviewReason[]
  live: string
}

export function reasonListKey(reasons: readonly ReviewReason[]): string {
  return JSON.stringify(reasons)
}

export function currentBlock(block: ApprovalBlock | null, live: readonly ReviewReason[]): ReviewReason[] | null {
  return block && block.live === reasonListKey(live) ? block.reasons : null
}

export function isValidExpiryDays(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 365
}
