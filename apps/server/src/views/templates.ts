import { stat } from 'node:fs/promises'
import { SLIDE_NAMES_EN, SLIDES } from '@mergero/shared'
import type { TemplatePreviewDto } from '@mergero/shared'
import { paths } from '../paths.ts'

export const TEMPLATE_FILE = /^slide-[1-8]\.jpg$/u

export function templatePreviews(): Promise<TemplatePreviewDto[]> {
  return Promise.all(
    SLIDES.map(async (slide) => {
      const info = await stat(paths.templatePreview(slide)).catch(() => null)
      return {
        slide,
        name: SLIDE_NAMES_EN[slide],
        imageUrl: info?.isFile() ? `/api/templates/slide-${slide}.jpg?v=${Math.trunc(info.mtimeMs)}` : null,
      }
    }),
  )
}
