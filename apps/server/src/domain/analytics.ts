import { computeDealAnalytics, slideTimes } from '@mergero/shared'
import type { DealAnalytics, SessionChannel, SlideTime, StoredEvent } from '@mergero/shared'
import type { Db } from '../db/index.ts'
import { listEvents, listSessions } from './events.ts'
import { getTimeline } from './timelines.ts'

export interface SessionInput {
  id: string
  localDay: string
  channel: SessionChannel
  events: StoredEvent[]
  slides: SlideTime[]
}

export interface StoredSessions {
  sessions: SessionInput[]
  slidesOf: (version: number) => SlideTime[]
}

export function storedSessions(db: Db, dealId: number): StoredSessions {
  const cache = new Map<number, SlideTime[]>()
  const slidesOf = (version: number): SlideTime[] => {
    let slides = cache.get(version)
    if (slides === undefined) {
      const row = getTimeline(db, dealId, version)
      if (!row) throw new Error(`Deal ${dealId} has no timeline version ${version}`)
      slides = slideTimes(row.timeline)
      cache.set(version, slides)
    }
    return slides
  }
  const bySession = new Map<string, StoredEvent[]>()
  for (const event of listEvents(db, dealId)) {
    if (event.sessionId !== null) bySession.set(event.sessionId, [...(bySession.get(event.sessionId) ?? []), event])
  }
  const sessions = listSessions(db, dealId).map((item) => ({
    id: item.id,
    localDay: item.localDay,
    channel: item.channel,
    events: bySession.get(item.id) ?? [],
    slides: slidesOf(item.version),
  }))
  return { sessions, slidesOf }
}

export function storedDealAnalytics(db: Db, dealId: number, publishedVersion: number): DealAnalytics {
  const { sessions, slidesOf } = storedSessions(db, dealId)
  return computeDealAnalytics(sessions, slidesOf(publishedVersion))
}
