import type { Lang, ScriptSlideNumber } from '@mergero/shared'
import type { PipedriveWriteOp } from './types.ts'

export const jobKeys = {
  scrape: (dealId: number) => `scrape:${dealId}`,
  writeScript: (dealId: number, version: number, slides: readonly ScriptSlideNumber[]) =>
    `write-script:${dealId}:${version}:${[...new Set(slides)].sort((a, b) => a - b).join('-')}`,
  audioSlides: (dealId: number, version: number, run: number) => `audio:${dealId}:${version}:${run}`,
  audioIntro: (analystId: number, lang: Lang, recordedAt: string) => `audio-intro:${analystId}:${lang}:${recordedAt}`,
  audioClone: (analystId: number, sampleAt: string) => `audio-clone:${analystId}:${sampleAt}`,
  render: (dealId: number, version: number) => `render:${dealId}:${version}`,
  renderPreview: (sceneHash: string) => `render-preview:${sceneHash}`,
  brief: (dealId: number, lastEventId: number) => `brief:${dealId}:${lastEventId}`,
  pipedriveWrite: (dealId: number | null, op: PipedriveWriteOp, id: string | number) =>
    `pipedrive-write:${dealId ?? 'all'}:${op}:${id}`,
  sweep: (now: Date) => `sweep:${sweepHour(now)}`,
  backup: (now: Date) => `backup:${backupDate(now)}`,
}

export function sweepHour(now: Date): string {
  return now.toISOString().slice(0, 13)
}

export function backupDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}
