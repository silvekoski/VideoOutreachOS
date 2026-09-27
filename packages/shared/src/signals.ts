import { SIGNAL_KEYS } from './types.ts'
import type {
  DealAnalytics,
  EvidenceEventType,
  FormAnswers,
  InterestLevel,
  SessionChannel,
  Signal,
  SignalKey,
  StoredEvent,
} from './types.ts'

export interface SignalInput {
  analytics: DealAnalytics
  events: StoredEvent[]
  form: FormAnswers | null
  sessionDays: { sessionId: string; localDay: string }[]
}

type Evidence = Pick<Signal, 'evidenceEventId' | 'evidenceText' | 'evidenceEvent'>

const NEGATIVE = new Set<SignalKey>(['stopped_early', 'short_watch'])
const SHORT_WATCH_S = 30
const EARLY_STOP_BEFORE = 4
const NO_EVIDENCE: Evidence = { evidenceEventId: null, evidenceText: null, evidenceEvent: null }

const byText = (text: string): Evidence => ({ ...NO_EVIDENCE, evidenceText: text })

function byEvent(event: StoredEvent, type: EvidenceEventType): Evidence {
  return {
    evidenceEventId: event.id,
    evidenceText: null,
    evidenceEvent: {
      type,
      at: event.clientAt ?? event.at,
      slide: event.slide,
      channel: event.channel as SessionChannel | null,
    },
  }
}

function pick(
  events: StoredEvent[],
  type: EvidenceEventType,
  options: { newest?: boolean; where?: (event: StoredEvent) => boolean } = {},
): Evidence | null {
  let found: StoredEvent | null = null
  for (const event of events) {
    if (event.type !== type || (options.where && !options.where(event))) continue
    if (found === null || (options.newest ? event.id > found.id : event.id < found.id)) found = event
  }
  return found ? byEvent(found, type) : null
}

function replayEvent(events: StoredEvent[], slides: Set<number>): StoredEvent | null {
  const sessions = new Map<string, StoredEvent[]>()
  for (const event of events) {
    if (event.sessionId === null || event.type !== 'slide_start' || event.slide === null) continue
    sessions.set(event.sessionId, [...(sessions.get(event.sessionId) ?? []), event])
  }
  let found: StoredEvent | null = null
  for (const list of sessions.values()) {
    const started = new Set<number>()
    for (const event of list.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
      const slide = event.slide as number
      if (started.has(slide) && slides.has(slide)) {
        if (found === null || event.id < found.id) found = event
        break
      }
      started.add(slide)
    }
  }
  return found
}

function cameBack(input: SignalInput): Evidence | null {
  const distinct = [...new Set(input.sessionDays.map((d) => d.localDay))].sort()
  const second = distinct[1]
  if (second === undefined) return null
  const sessions = new Set(input.sessionDays.filter((d) => d.localDay === second).map((d) => d.sessionId))
  const where = (event: StoredEvent) => event.sessionId !== null && sessions.has(event.sessionId)
  return pick(input.events, 'open', { where }) ?? byText(distinct.join(', '))
}

function formEvidence(events: StoredEvent[]): Evidence {
  return pick(events, 'form_sent', { newest: true }) ?? NO_EVIDENCE
}

function evidenceFor(key: SignalKey, input: SignalInput): Evidence | null {
  const { analytics, events, form } = input
  switch (key) {
    case 'watched_to_end':
      return pick(events, 'complete')
    case 'replayed_figures_or_buyers': {
      const replayed = analytics.perSlide.filter((s) => (s.slide === 4 || s.slide === 5) && s.replays > 0)
      if (replayed.length === 0) return null
      const event = replayEvent(events, new Set([4, 5]))
      return event === null ? byText(replayed.map((s) => s.slide).join(', ')) : byEvent(event, 'slide_start')
    }
    case 'tapped_buyer_link':
      return pick(events, 'buyer_link_tap')
    case 'used_calculator':
      return pick(events, 'calculator_result')
    case 'gave_exact_figures':
      return form?.revenue?.kind === 'exact' || form?.profit?.kind === 'exact' ? formEvidence(events) : null
    case 'forwarded_link':
      return pick(events, 'forward')
    case 'came_back':
      return cameBack(input)
    case 'answered_custom_questions':
      return form?.custom.some((c) => c.answer.trim() !== '') ? formEvidence(events) : null
    case 'stopped_early':
      return analytics.stopSlide !== null && analytics.stopSlide < EARLY_STOP_BEFORE
        ? byText(String(analytics.stopSlide))
        : null
    case 'short_watch':
      return analytics.totalWatchS < SHORT_WATCH_S ? byText(String(Math.floor(analytics.totalWatchS))) : null
  }
}

export function computeSignals(input: SignalInput): Signal[] {
  const signals: Signal[] = []
  for (const key of SIGNAL_KEYS) {
    const evidence = evidenceFor(key, input)
    if (evidence) signals.push({ key, type: NEGATIVE.has(key) ? 'negative' : 'positive', ...evidence })
  }
  return signals
}

export function interestLevel(signals: Signal[]): InterestLevel {
  const positive = signals.filter((s) => s.type === 'positive').length
  const negative = signals.length - positive
  if (positive >= 4 && negative === 0) return 'high'
  if (positive === 0 || negative >= 2) return 'low'
  return 'medium'
}
