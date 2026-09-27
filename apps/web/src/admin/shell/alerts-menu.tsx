import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAlerts, useMarkAlertsSeen } from '../api'
import { useCurrentAnalyst } from '../analyst-context'
import { pickNewAlerts, unreadCount } from '../lib/alerts'
import { formatDateTime } from '../lib/format'
import { ShapeIcon } from '../components/shape-icon'

export function AlertsMenu() {
  const { analystId } = useCurrentAnalyst()
  const alerts = useAlerts(analystId)
  const markSeen = useMarkAlertsSeen()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const known = useRef<{ analystId: number; ids: Set<number> } | null>(null)
  const unread = unreadCount(alerts.data)

  useEffect(() => {
    const list = alerts.data
    if (!list || analystId === null) return
    if (!known.current || known.current.analystId !== analystId) {
      known.current = { analystId, ids: new Set(list.map((alert) => alert.id)) }
      return
    }
    const fresh = pickNewAlerts(known.current.ids, list)
    for (const alert of list) known.current.ids.add(alert.id)
    for (const alert of fresh) {
      toast(alert.company, {
        id: `alert-${alert.id}`,
        description: alert.text,
        action: { label: 'Open deal', onClick: () => void navigate(`/deals/${alert.dealId}`) },
      })
    }
  }, [alerts.data, analystId, navigate])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next && unread > 0 && analystId !== null && !markSeen.isPending) markSeen.mutate(analystId)
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Alerts, ${unread} unread`}>
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        <DropdownMenuLabel>Alerts of the last 14 days</DropdownMenuLabel>
        {alerts.isError ? (
          <p className="px-2 py-2 text-sm text-destructive">Could not load the alerts.</p>
        ) : !alerts.data || alerts.data.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">No alerts.</p>
        ) : (
          alerts.data.map((alert) => (
            <DropdownMenuItem
              key={alert.id}
              className="items-start gap-2 py-1.5"
              onSelect={() => void navigate(`/deals/${alert.dealId}`)}
            >
              <ShapeIcon
                shape={alert.unread ? 'circle' : 'circle-outline'}
                className={alert.unread ? 'mt-1 text-link' : 'mt-1 text-muted-foreground'}
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-medium">
                  {alert.company}
                  {alert.unread ? <span className="sr-only"> (unread)</span> : null}
                </span>
                <span className="text-xs text-muted-foreground">{alert.text}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(alert.at)}</span>
              </span>
            </DropdownMenuItem>
          ))
        )}
        {unread > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => analystId !== null && markSeen.mutate(analystId)}>
              Mark all as seen
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
