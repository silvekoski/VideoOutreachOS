export const SCENE_FPS = 30
export const SCENE_WIDTH = 1920
export const SCENE_HEIGHT = 1080

export function segmentFrames(durationS: number, fps: number): number {
  return Math.ceil(durationS * fps - 1e-9)
}
