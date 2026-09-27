import { createContext, useContext } from 'react'
import type { AnalystDto } from '@mergero/shared'

export interface AnalystContextValue {
  analystId: number | null
  analyst: AnalystDto | null
  analysts: AnalystDto[]
  loading: boolean
  error: unknown
  setAnalystId: (id: number) => void
}

export const AnalystContext = createContext<AnalystContextValue | null>(null)

export function useCurrentAnalyst(): AnalystContextValue {
  const value = useContext(AnalystContext)
  if (!value) throw new Error('useCurrentAnalyst needs an AnalystProvider.')
  return value
}
