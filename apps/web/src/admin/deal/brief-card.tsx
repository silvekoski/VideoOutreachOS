import { useEffect, useRef } from 'react'
import type { MeetingBrief } from '@mergero/shared'
import { Card, CardContent } from '@/components/ui/card'
import { useMarkBriefRead } from '../api'
import { BriefView } from '../components/brief-view'
import { reportBriefRead } from '../lib/brief'

interface BriefCardProps {
  dealId: number
  brief: MeetingBrief
  meetingEmail: string | null
  timeZone: string
}

export function BriefCard({ dealId, brief, meetingEmail, timeZone }: BriefCardProps) {
  const { mutate } = useMarkBriefRead(dealId)
  const reported = useRef<string | null>(null)

  useEffect(() => {
    reportBriefRead(reported, `${dealId}:${brief.version}`, (onError) => mutate(undefined, { onError }))
  }, [dealId, brief.version, mutate])

  return (
    <Card id="meeting-brief" size="sm" className="print:bg-transparent print:ring-0">
      <CardContent>
        <BriefView brief={brief} meetingEmail={meetingEmail} timeZone={timeZone} />
      </CardContent>
    </Card>
  )
}
