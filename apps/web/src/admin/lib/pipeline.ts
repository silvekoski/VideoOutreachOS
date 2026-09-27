export const PIPELINE_STEPS = ['scrape', 'write-script', 'audio', 'render', 'publish'] as const
export type PipelineStep = (typeof PIPELINE_STEPS)[number]

const STEP_LABELS: Record<string, string> = {
  scrape: 'Read the website',
  'write-script': 'Write the scripts',
  audio: 'Make the audio',
  render: 'Render the video',
  publish: 'Publish the link',
  'pipedrive-write': 'Update Pipedrive',
  'write-brief': 'Write the meeting brief',
}

export function stepLabel(step: string | null): string {
  if (!step) return 'Waiting for the worker'
  return STEP_LABELS[step] ?? step.replace(/[-_]/g, ' ')
}

export interface StepState {
  key: PipelineStep
  label: string
  state: 'done' | 'current' | 'pending'
}

export function pipelineSteps(step: string | null): StepState[] {
  const current = PIPELINE_STEPS.indexOf(step as PipelineStep)
  return PIPELINE_STEPS.map((key, index) => ({
    key,
    label: stepLabel(key),
    state: current === -1 ? 'pending' : index < current ? 'done' : index === current ? 'current' : 'pending',
  }))
}
