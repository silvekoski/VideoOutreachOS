import type { CSSProperties, ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface InspectProps {
  detail: ReactNode
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export function Inspect({ detail, children, className, style }: InspectProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={className} style={style}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="block">{detail}</TooltipContent>
    </Tooltip>
  )
}
