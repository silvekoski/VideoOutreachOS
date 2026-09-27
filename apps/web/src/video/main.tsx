import './video.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import type { VideoPageData } from '@mergero/shared'
import { fill } from '@mergero/shared/i18n/base'
import { pageUrl } from './api.ts'
import { App } from './app.tsx'
import { detectPlatform, sessionInfo } from './device.ts'
import { trackPage } from './page-tracking.ts'
import { createRecorder, httpTransport, noopRecorder, randomId, sessionStore } from './recorder.ts'
import { RecorderContext } from './recorder-context.ts'
import { createRecordingQueue } from './recording-queue.ts'
import { loadStrings } from './strings.ts'

function readBootstrap(): VideoPageData | null {
  const text = document.getElementById('bootstrap')?.textContent
  if (!text) return null
  try {
    return JSON.parse(text) as VideoPageData
  } catch {
    return null
  }
}

const container = document.getElementById('root')
const data = readBootstrap()

if (container !== null && data === null) {
  void loadStrings('en').then(({ page }) => {
    createRoot(container).render(
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold text-ink">{page.notFoundTitle}</h1>
        <p className="mt-3 text-muted">{page.notFoundText}</p>
      </main>,
    )
  })
} else if (container !== null && data !== null) {
  document.documentElement.lang = data.pageLanguage
  const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints)
  const session = sessionInfo({
    search: window.location.search,
    platform,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    version: data.version,
  })
  const transport = (path: string) => httpTransport(pageUrl(data.code, path), (url, body) => navigator.sendBeacon(url, body))
  const recorder = data.preview
    ? noopRecorder
    : createRecorder({
        session,
        transport: transport('events'),
        store: sessionStore(() => window.sessionStorage, `mergero.session.${data.code}.v${data.version}`),
        newId: () => randomId(window.crypto),
      })
  if (!data.preview) {
    recorder.record('open')
    recorder.start()
    trackPage(recorder, window)
  }
  void loadStrings(data.pageLanguage).then((strings) => {
    document.title = fill(strings.page.documentTitle, { company: data.company })
    createRoot(container).render(
      <StrictMode>
        <RecorderContext value={recorder}>
          <App data={data} strings={strings} platform={platform} />
        </RecorderContext>
      </StrictMode>,
    )
    if (data.preview) return
    const queue = createRecordingQueue({ session, transport: transport('recording'), sessionId: () => recorder.sessionId() })
    void import('./screen-recorder.ts').then(({ recordScreen }) => recordScreen(queue, document))
  })
}
