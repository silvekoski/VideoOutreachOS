import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  documentTitle?: string
  description?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, documentTitle, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <title>{`${documentTitle ?? title} | Mergero video tool`}</title>
      <div className="min-w-0">
        <h1 id="page-title" tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">{title}</h1>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
