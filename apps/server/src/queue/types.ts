import type { Lang, ScriptSlideNumber, Stage } from '@mergero/shared'

export const JOB_TYPES = [
  'scrape',
  'write-script',
  'write-brief',
  'audio',
  'render',
  'pipedrive-write',
  'sweep',
  'backup',
] as const
export type JobType = (typeof JOB_TYPES)[number]

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type AudioPayload =
  | { kind: 'slides'; dealId: number; version: number }
  | { kind: 'intro'; analystId: number; lang: Lang; uploadFile: string; recordedAt: string }
  | { kind: 'clone'; analystId: number }

export type RenderPayload = { kind: 'deal'; dealId: number; version: number } | { kind: 'preview'; sceneHash: string }

export type PipedriveWritePayload =
  | { dealId: number; op: 'stage'; stage: Stage }
  | { dealId: number; op: 'fields' }
  | { dealId: number; op: 'analytics' }
  | { dealId: number; op: 'lost'; reason: string }
  | { dealId: number; op: 'activity'; taskId: number }
  | { dealId: number; op: 'activity_done'; taskId: number }
  | { dealId: number; op: 'note'; briefId: number }
  | { op: 'video_field'; dealIds: number[] }

export type PipedriveWriteOp = PipedriveWritePayload['op']

export interface JobPayloads {
  scrape: { dealId: number }
  'write-script': { dealId: number; version: number; slides: ScriptSlideNumber[]; lines: boolean }
  'write-brief': { dealId: number; lastEventId: number }
  audio: AudioPayload
  render: RenderPayload
  'pipedrive-write': PipedriveWritePayload
  sweep: { hour: string }
  backup: { date: string }
}

export interface Job<T extends JobType = JobType> {
  id: number
  type: T
  payload: JobPayloads[T]
  status: JobStatus
  runAt: string
  attempts: number
  error: string | null
  key: string
  dealId: number | null
  analystId: number | null
  createdAt: string
  updatedAt: string
}

export type AnyJob = { [T in JobType]: Job<T> }[JobType]
