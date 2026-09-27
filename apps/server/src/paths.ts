import path from 'node:path'
import type { Lang } from '@mergero/shared'
import { env } from './env.ts'

const root = env.storageDir

export const paths = {
  root,
  dataDir: path.join(root, 'data'),
  database: path.join(root, 'data', 'app.sqlite'),
  backupsDir: path.join(root, 'data', 'backups'),
  backup: (date: string) => path.join(root, 'data', 'backups', `app-${date}.sqlite`),
  fakePipedrive: path.join(root, 'data', 'fake-pipedrive.json'),
  templatesDir: path.join(root, 'templates'),
  templatePreview: (slide: number) => path.join(root, 'templates', `slide-${slide}.jpg`),
  logosDir: path.join(root, 'cache', 'logos'),
  uploadsDir: path.join(root, 'cache', 'uploads'),
  dealDir: (dealId: number) => path.join(root, 'deals', String(dealId)),
  screenshot: (dealId: number) => path.join(root, 'deals', String(dealId), 'screenshot.png'),
  ogImage: (dealId: number) => path.join(root, 'deals', String(dealId), 'og-image.jpg'),
  poster: (dealId: number, version: number) => path.join(root, 'deals', String(dealId), `poster.v${version}.jpg`),
  audioDir: (dealId: number) => path.join(root, 'deals', String(dealId), 'audio'),
  slideAudio: (dealId: number, slide: number, version: number) =>
    path.join(root, 'deals', String(dealId), 'audio', `slide-${slide}.v${version}.mp3`),
  video1080: (dealId: number, version: number) => path.join(root, 'deals', String(dealId), `video-1080.v${version}.mp4`),
  video720: (dealId: number, version: number) => path.join(root, 'deals', String(dealId), `video-720.v${version}.mp4`),
  analystDir: (analystId: number) => path.join(root, 'analysts', String(analystId)),
  intro: (analystId: number, lang: Lang) => path.join(root, 'analysts', String(analystId), `intro-${lang}.mp4`),
  voiceSample: (analystId: number) => path.join(root, 'analysts', String(analystId), 'voice-sample.mp3'),
  consent: (analystId: number) => path.join(root, 'analysts', String(analystId), 'consent.pdf'),
  photo: (analystId: number) => path.join(root, 'analysts', String(analystId), 'photo.jpg'),
}

export function insideDir(dir: string, file: string): string | null {
  const resolved = path.resolve(dir, file)
  return resolved.startsWith(path.resolve(dir) + path.sep) ? resolved : null
}
