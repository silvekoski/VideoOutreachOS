import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

interface SegmentedFilterProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  items: { value: T; label: string; count?: number }[]
}

export function SegmentedFilter<T extends string>({ label, value, onChange, items }: SegmentedFilterProps<T>) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T)
      }}
      spacing={1}
      className="flex-wrap rounded-lg bg-muted p-1"
    >
      {items.map((item) => {
        const on = item.value === value
        return (
          <ToggleGroupItem
            key={item.value}
            value={item.value}
            size="sm"
            className="gap-2 px-3 data-[state=on]:bg-background data-[state=on]:shadow-xs"
          >
            {item.label}
            {item.count === undefined ? null : (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-xs font-semibold tabular-nums',
                  on ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-foreground',
                )}
              >
                {item.count}
              </span>
            )}
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
