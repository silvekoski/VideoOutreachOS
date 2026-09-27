import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { AnalystDto } from '@mergero/shared'
import { readStorage, writeStorage } from '@/lib/storage'
import { useAnalysts } from './api'
import { AnalystContext, type AnalystContextValue } from './analyst-context'

const STORAGE_KEY = 'mergero.analyst'
const NO_ANALYSTS: AnalystDto[] = []

function storedAnalystId(): number | null {
  const raw = readStorage(STORAGE_KEY)
  const id = raw === null ? Number.NaN : Number(raw)
  return Number.isInteger(id) ? id : null
}

export function AnalystProvider({ children }: { children: ReactNode }) {
  const query = useAnalysts()
  const [selectedId, setSelectedId] = useState<number | null>(storedAnalystId)
  const analysts = query.data ?? NO_ANALYSTS
  const analyst = analysts.find((item) => item.id === selectedId) ?? analysts[0] ?? null

  const setAnalystId = useCallback((id: number) => {
    setSelectedId(id)
    writeStorage(STORAGE_KEY, String(id))
  }, [])

  const value = useMemo<AnalystContextValue>(
    () => ({
      analystId: analyst?.id ?? null,
      analyst,
      analysts,
      loading: query.isPending,
      error: query.error,
      setAnalystId,
    }),
    [analyst, analysts, query.isPending, query.error, setAnalystId],
  )

  return <AnalystContext.Provider value={value}>{children}</AnalystContext.Provider>
}
