import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentAnalyst } from '../analyst-context'

export function AnalystSelect() {
  const { analyst, analysts, loading, setAnalystId } = useCurrentAnalyst()
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="hidden text-xs text-muted-foreground sm:flex">
        Analyst
      </Label>
      <Select
        value={analyst ? String(analyst.id) : ''}
        onValueChange={(value) => setAnalystId(Number(value))}
        disabled={analysts.length === 0}
      >
        <SelectTrigger id={id} size="sm" aria-label="Current analyst" className="max-w-32 sm:max-w-48">
          <SelectValue placeholder={loading ? 'Loading analysts' : 'No analysts'} />
        </SelectTrigger>
        <SelectContent>
          {analysts.map((item) => (
            <SelectItem key={item.id} value={String(item.id)}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
