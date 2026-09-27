import { createContext, useContext } from 'react'
import { noopRecorder } from './recorder.ts'
import type { Recorder } from './recorder.ts'

export const RecorderContext = createContext<Recorder>(noopRecorder)

export function useRecorder(): Recorder {
  return useContext(RecorderContext)
}
