import { describe, expect, it } from 'vitest'
import { pipelineSteps, stepLabel } from '../../src/admin/lib/pipeline'

describe('pipelineSteps', () => {
  it('marks the steps before the current step as done', () => {
    expect(pipelineSteps('audio').map((step) => step.state)).toEqual(['done', 'done', 'current', 'pending', 'pending'])
  })

  it('keeps all steps pending for an unknown step', () => {
    expect(pipelineSteps('backup').every((step) => step.state === 'pending')).toBe(true)
    expect(pipelineSteps(null).every((step) => step.state === 'pending')).toBe(true)
  })
})

describe('stepLabel', () => {
  it('names the known steps and makes the unknown steps readable', () => {
    expect(stepLabel('render')).toBe('Render the video')
    expect(stepLabel('some-new_step')).toBe('some new step')
    expect(stepLabel(null)).toBe('Waiting for the worker')
  })
})
