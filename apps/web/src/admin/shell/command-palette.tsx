import { useEffect, useState } from 'react'
import { ChartLine, Inbox, LayoutList, Search, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useDeals } from '../api'
import { useCurrentAnalyst } from '../analyst-context'
import { StatusBadge } from '../components/state-badge'
import { useReturnFocus } from '../lib/use-return-focus'
import { THEMES } from './themes'

const PAGES = [
  { to: '/', label: 'Inbox', icon: Inbox },
  { to: '/deals', label: 'Deals', icon: LayoutList },
  { to: '/metrics', label: 'Metrics', icon: ChartLine },
] as const

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const { analysts, analystId, setAnalystId } = useCurrentAnalyst()
  const deals = useDeals(open)
  const returnFocus = useReturnFocus()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const run = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-keyshortcuts="Control+K Meta+K" className="text-muted-foreground">
          <Search aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Search</span>
          <kbd className="hidden rounded border bg-muted px-1 font-mono text-[10px] sm:inline">{MAC ? '⌘K' : 'Ctrl K'}</kbd>
        </Button>
      </DialogTrigger>
      <DialogContent {...returnFocus} className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">Search deals, go to a page, switch the analyst or the theme.</DialogDescription>
        <Command label="Search deals and commands" loop>
          <CommandInput placeholder="Type a company name or a command" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Pages">
              {PAGES.map((page) => (
                <CommandItem key={page.to} value={`page ${page.label}`} onSelect={() => run(() => void navigate(page.to))}>
                  <page.icon aria-hidden="true" />
                  {page.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Deals">
              {deals.isPending ? (
                <CommandItem disabled value="deals loading">
                  Loading deals
                </CommandItem>
              ) : deals.isError ? (
                <CommandItem disabled value="deals error">
                  Could not load the deals
                </CommandItem>
              ) : (
                deals.data.map((deal) => (
                  <CommandItem
                    key={deal.id}
                    value={`deal ${deal.id}`}
                    keywords={[deal.company, deal.country, deal.analystName]}
                    onSelect={() => run(() => void navigate(`/deals/${deal.id}`))}
                  >
                    <span className="min-w-0 flex-1 truncate">{deal.company}</span>
                    <span className="text-xs text-muted-foreground">{deal.country}</span>
                    <StatusBadge status={deal.status} />
                  </CommandItem>
                ))
              )}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Switch analyst">
              {analysts.map((analyst) => (
                <CommandItem
                  key={analyst.id}
                  value={`analyst ${analyst.id}`}
                  keywords={[analyst.name, 'analyst']}
                  data-checked={analyst.id === analystId}
                  onSelect={() => run(() => setAnalystId(analyst.id))}
                >
                  <UserRound aria-hidden="true" />
                  {analyst.name}
                  {analyst.id === analystId ? <span className="sr-only"> (current)</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Theme">
              {THEMES.map((item) => (
                <CommandItem
                  key={item.value}
                  value={`theme ${item.value}`}
                  keywords={[item.label, 'theme']}
                  onSelect={() => run(() => setTheme(item.value))}
                >
                  <item.icon aria-hidden="true" />
                  {`${item.label} theme`}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
