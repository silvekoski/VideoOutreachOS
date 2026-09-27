import type { ReactNode } from 'react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface DealCardProps {
  id: string
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}

export function DealCard({ id, title, description, action, className, children }: DealCardProps) {
  return (
    <Card size="sm" aria-labelledby={id} className={cn('print:hidden', className)} role="region">
      <CardHeader>
        <CardTitle>
          <h2 id={id}>{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
