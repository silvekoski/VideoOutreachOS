import type { Shape } from '../lib/status'
import { cn } from '@/lib/utils'

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function paths(shape: Shape) {
  switch (shape) {
    case 'circle':
      return <circle cx="6" cy="6" r="4.5" fill="currentColor" />
    case 'circle-outline':
      return <circle cx="6" cy="6" r="4.2" {...STROKE} />
    case 'circle-dashed':
      return <circle cx="6" cy="6" r="4.2" {...STROKE} strokeDasharray="2.2 1.6" />
    case 'circle-half':
      return (
        <>
          <circle cx="6" cy="6" r="4.2" {...STROKE} />
          <path d="M6 1.8a4.2 4.2 0 0 1 0 8.4z" fill="currentColor" />
        </>
      )
    case 'diamond':
      return <path d="M6 1 11 6 6 11 1 6z" fill="currentColor" />
    case 'cross':
      return <path d="M2.5 2.5l7 7m0-7-7 7" {...STROKE} strokeWidth={2} />
    case 'triangle':
      return <path d="M3 1.5 10.5 6 3 10.5z" fill="currentColor" />
    case 'square':
      return <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
    case 'check':
      return <path d="M2 6.5 5 9.5l5.5-7" {...STROKE} strokeWidth={2} />
    case 'slash':
      return (
        <>
          <circle cx="6" cy="6" r="4.2" {...STROKE} />
          <path d="M3 9 9 3" {...STROKE} />
        </>
      )
    case 'plus':
      return <path d="M6 2v8M2 6h8" {...STROKE} strokeWidth={2} />
    case 'minus':
      return <path d="M2 6h8" {...STROKE} strokeWidth={2} />
  }
}

export function ShapeIcon({ shape, className }: { shape: Shape; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false" className={cn('size-3 shrink-0', className)}>
      {paths(shape)}
    </svg>
  )
}
