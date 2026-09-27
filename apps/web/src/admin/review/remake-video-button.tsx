import type { ReviewDto } from '@mergero/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { queryKeys, request } from '../api'
import { needsRemake } from '../lib/review'

export function RemakeVideoButton({ review }: { review: ReviewDto }) {
  const client = useQueryClient()
  const remake = useMutation({
    mutationFn: () => request<ReviewDto>('POST', `/api/deals/${review.dealId}/remake`),
    onSuccess: (next) => {
      client.setQueryData(queryKeys.review(review.dealId), next)
      void client.invalidateQueries({ queryKey: queryKeys.deal(review.dealId) })
      void client.invalidateQueries({ queryKey: ['inbox'] })
      void client.invalidateQueries({ queryKey: queryKeys.deals })
      toast.success('The tool makes the video again from the new Pipedrive data.')
    },
  })

  if (!needsRemake(review.reviewReasons)) return null
  return (
    <Button
      type="button"
      variant="outline"
      aria-disabled={remake.isPending || undefined}
      onClick={() => {
        if (!remake.isPending) remake.mutate()
      }}
      className="justify-self-start aria-disabled:opacity-50"
    >
      <RotateCcw aria-hidden="true" />
      {remake.isPending ? 'Starting the new video' : 'Make the video again'}
    </Button>
  )
}
