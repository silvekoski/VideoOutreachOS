import type { AudioStatus, DealStatus, InterestLevel, IntroInfo, ReviewReasonCode, AnalystDto } from '@mergero/shared'

export type Shape =
  | 'circle'
  | 'circle-outline'
  | 'circle-dashed'
  | 'circle-half'
  | 'diamond'
  | 'cross'
  | 'triangle'
  | 'square'
  | 'check'
  | 'slash'
  | 'plus'
  | 'minus'

export type Tone = 'neutral' | 'attention' | 'danger' | 'progress' | 'success'

export interface StateMeta {
  label: string
  shape: Shape
  tone: Tone
}

export const STATUS_META: Record<DealStatus, StateMeta> = {
  draft: { label: 'Draft', shape: 'circle-dashed', tone: 'neutral' },
  review: { label: 'Review', shape: 'diamond', tone: 'attention' },
  failed: { label: 'Failed', shape: 'cross', tone: 'danger' },
  link_sent: { label: 'Link sent', shape: 'triangle', tone: 'progress' },
  opened: { label: 'Opened', shape: 'circle-half', tone: 'progress' },
  form_sent: { label: 'Form sent', shape: 'square', tone: 'progress' },
  meeting_booked: { label: 'Meeting booked', shape: 'check', tone: 'success' },
  lost: { label: 'Lost', shape: 'slash', tone: 'neutral' },
}

export const PUBLISHED_STATUSES: ReadonlySet<DealStatus> = new Set<DealStatus>([
  'link_sent',
  'opened',
  'form_sent',
  'meeting_booked',
  'lost',
])

export const AUDIO_META: Record<AudioStatus | 'new_audio', StateMeta> = {
  ok: { label: 'Audio ready', shape: 'check', tone: 'success' },
  new: { label: 'New audio', shape: 'circle-dashed', tone: 'attention' },
  new_audio: { label: 'New audio', shape: 'circle-dashed', tone: 'attention' },
  missing: { label: 'No audio', shape: 'circle-outline', tone: 'neutral' },
  failed: { label: 'Audio failed', shape: 'cross', tone: 'danger' },
}

export function audioMeta(status: AudioStatus | null, newAudio: boolean): StateMeta {
  if (newAudio) return AUDIO_META.new_audio
  return AUDIO_META[status ?? 'missing']
}

export const INTRO_META: Record<IntroInfo['status'] | 'none', StateMeta> = {
  none: { label: 'Not recorded', shape: 'circle-outline', tone: 'neutral' },
  processing: { label: 'Processing', shape: 'circle-dashed', tone: 'attention' },
  ready: { label: 'Ready', shape: 'check', tone: 'success' },
  failed: { label: 'Failed', shape: 'cross', tone: 'danger' },
}

export const CLONE_META: Record<AnalystDto['voice']['cloneStatus'], StateMeta> = {
  none: { label: 'No voice clone', shape: 'circle-outline', tone: 'neutral' },
  pending: { label: 'Clone in progress', shape: 'circle-dashed', tone: 'attention' },
  ready: { label: 'Clone ready', shape: 'check', tone: 'success' },
  failed: { label: 'Clone failed', shape: 'cross', tone: 'danger' },
}

export const INTEREST_BARS: Record<InterestLevel, 1 | 2 | 3> = { low: 1, medium: 2, high: 3 }

export const REVIEW_REASON_TITLES: Record<ReviewReasonCode, string> = {
  lines_missing: 'Company lines missing',
  script_missing: 'Script missing',
  model_failed: 'Model output failed',
  text_too_long: 'Text too long',
  audio_failed: 'Audio failed',
  no_intro: 'No intro in this language',
  no_voice: 'No voice clone',
  script_check: 'Check the script',
  slide_empty: 'Slide is empty',
  remake_needed: 'Pipedrive data changed',
}
