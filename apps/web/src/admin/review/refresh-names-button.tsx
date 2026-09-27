import type { EnsureDealDto } from '@mergero/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { queryKeys, request } from '../api'

export function RefreshNamesButton({ dealId }: { dealId: number }) {
  const client = useQueryClient()
  const refresh = useMutation({
    mutationFn: () => request<EnsureDealDto>('POST', `/api/deals/${dealId}/ensure`),
    onSuccess: async (result) => {
      if (result.refreshError !== null) {
        toast.error(result.refreshError)
        return
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.review(dealId) }),
        client.invalidateQueries({ queryKey: queryKeys.deal(dealId) }),
      ])
      if (result.refreshed) toast.success('The deal was read from Pipedrive again. Check the review reasons.')
      else toast.info('The link is published. The names of the video stay as they are.')
    },
  })

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-disabled={refresh.isPending || undefined}
      onClick={() => {
        if (!refresh.isPending) refresh.mutate()
      }}
      className="aria-disabled:opacity-50"
    >
      <RefreshCw aria-hidden="true" />
      {refresh.isPending ? 'Reading from Pipedrive' : 'Read from Pipedrive again'}
    </Button>
  )
}
