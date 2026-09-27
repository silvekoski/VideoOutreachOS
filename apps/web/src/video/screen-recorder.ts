import { record } from '@rrweb/record'
import { BATCH_INTERVAL_MS } from './recorder.ts'
import type { RecordingQueue } from './recording-queue.ts'

export function recordScreen(queue: RecordingQueue, doc: Document): () => void {
  let snapshotDue = false
  const stopRecord = record({
    emit(event) {
      if (!queue.add(event) || snapshotDue) return
      snapshotDue = true
      queueMicrotask(() => {
        snapshotDue = false
        record.takeFullSnapshot()
      })
    },
    maskAllInputs: true,
    blockSelector: '[data-private]',
    slimDOMOptions: 'all',
    sampling: { input: 'last' },
  })
  const timer = setInterval(() => void queue.tick(), BATCH_INTERVAL_MS)
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') queue.hide()
  }
  doc.addEventListener('visibilitychange', onVisibility)
  return () => {
    stopRecord?.()
    clearInterval(timer)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}
