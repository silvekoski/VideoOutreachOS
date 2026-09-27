import { useRef } from 'react'

export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null
    },
    onCloseAutoFocus: (event: Event) => {
      const target = opener.current
      opener.current = null
      if (!target?.isConnected) return
      event.preventDefault()
      target.focus()
    },
  }
}
