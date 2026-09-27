import { buildCaptions } from '@mergero/shared'
import type { IntroInfo } from '@mergero/shared'

export function introCaptionsUrl(intro: Pick<IntroInfo, 'language' | 'durationS' | 'transcript'>): string | null {
  const transcript = intro.transcript?.trim()
  if (!transcript || intro.durationS === null || intro.durationS <= 0) return null
  const captions = buildCaptions(
    {
      dealId: 0,
      version: 0,
      language: intro.language,
      fps: 30,
      width: 1920,
      height: 1080,
      pauseS: 0,
      segments: [
        {
          slide: 1,
          template: 'facecam',
          variables: { template: 'facecam', videoFile: '', analystName: '', transcript },
          labels: {},
          durationS: intro.durationS,
          startS: 0,
          endS: intro.durationS,
        },
      ],
    },
    transcript,
  )
  return `data:text/vtt;charset=utf-8,${encodeURIComponent(captions)}`
}
