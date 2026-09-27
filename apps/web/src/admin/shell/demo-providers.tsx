import { useId } from 'react'
import { FlaskConical } from 'lucide-react'
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import type { DemoProviders } from './use-demo-providers'

export function DemoProvidersGroup({ demo }: { demo: DemoProviders }) {
  const labelId = useId()
  const keepOpen = (event: Event) => event.preventDefault()
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup aria-labelledby={labelId}>
        <DropdownMenuLabel id={labelId} className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <FlaskConical aria-hidden="true" className="size-3.5" />
          Demo providers
        </DropdownMenuLabel>
        {demo.fakes.map((provider) => (
          <DropdownMenuItem key={provider.key} onSelect={keepOpen} className="block text-xs">
            <span className="font-medium">{provider.label}</span>
            <span className="text-muted-foreground">{`: ${provider.fake}`}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={keepOpen} className="block text-xs text-muted-foreground">
          {`MGX server: ${demo.mgxUrl}`}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  )
}
