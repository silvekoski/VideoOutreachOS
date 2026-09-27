import type { RenderInput } from '@mergero/shared'

export interface ChildJob {
  input: RenderInput
  still: string | null
  outDir: string
  outName: `${string}.mp4`
  chromePath: string
  ffmpegPath: string
  ffprobePath: string
  port: number
  fsAllow: string[]
}

export type ChildMessage =
  | { type: 'progress'; progress: number }
  | { type: 'done'; file: string }
  | { type: 'error'; message: string }
