import { LANGUAGE_NAMES } from '@mergero/shared'
import type { FailedJobDto } from '@mergero/shared'
import type { AnyJob, JobType, PipedriveWriteOp } from '../queue/index.ts'

const MAX_LINE = 200

const JOB_NAMES: Record<JobType, string> = {
  scrape: 'Website scrape',
  'write-script': 'Script writing',
  'write-brief': 'Meeting brief',
  audio: 'Audio',
  render: 'Render',
  'pipedrive-write': 'Pipedrive update',
  sweep: 'Hourly sweep',
  backup: 'Daily backup',
}

const PIPEDRIVE_OPS: Record<PipedriveWriteOp, string> = {
  stage: 'deal stage',
  fields: 'form fields',
  analytics: 'watch data',
  lost: 'lost status',
  activity: 'task',
  activity_done: 'task done',
  note: 'meeting brief note',
  video_field: 'Video field',
}

export function jobName(job: AnyJob): string {
  switch (job.type) {
    case 'audio':
      if (job.payload.kind === 'intro') return `Face-cam intro (${LANGUAGE_NAMES[job.payload.lang]})`
      return job.payload.kind === 'clone' ? 'Voice clone' : JOB_NAMES.audio
    case 'pipedrive-write':
      return `${JOB_NAMES['pipedrive-write']} (${PIPEDRIVE_OPS[job.payload.op]})`
    default:
      return JOB_NAMES[job.type]
  }
}

export function errorLine(error: string | null): string {
  const line = error?.split('\n').map((text) => text.trim()).find((text) => text !== '') ?? ''
  if (line === '') return 'no error text'
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 3)}...` : line
}

export function failedJobDto(job: AnyJob): FailedJobDto {
  return { id: job.id, type: job.type, error: job.error?.trim() || 'No error text', updatedAt: job.updatedAt }
}
