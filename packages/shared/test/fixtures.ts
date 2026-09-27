import type { SlideTime } from '../src/analytics.ts'
import type { DealAnalytics, MeetingBrief, Segment, SlideNumber, StoredEvent, Timeline } from '../src/types.ts'

export const SLIDE_TIMES: SlideTime[] = [
  { slide: 1, startS: 0, endS: 30 },
  { slide: 2, startS: 30, endS: 50 },
  { slide: 3, startS: 50, endS: 70 },
  { slide: 4, startS: 70, endS: 90 },
  { slide: 5, startS: 90, endS: 110 },
  { slide: 6, startS: 110, endS: 130 },
  { slide: 7, startS: 130, endS: 150 },
  { slide: 8, startS: 150, endS: 170 },
]

export function slideAt(t: number): SlideNumber {
  return (SLIDE_TIMES.find((s) => t >= s.startS && t < s.endS)?.slide ?? 8) as SlideNumber
}

export function sessionEvents(
  sessionId: string,
  firstId: number,
  specs: [type: StoredEvent['type'], vt: number | null, data?: Record<string, unknown>, slide?: number | null][],
): StoredEvent[] {
  return specs.map(([type, vt, data, slide], index) => ({
    id: firstId + index,
    dealId: 1,
    sessionId,
    seq: index,
    type,
    slide: slide !== undefined ? slide : vt === null ? null : slideAt(vt),
    videoTime: vt,
    channel: 'email',
    clientAt: '2026-09-26T10:00:00.000Z',
    at: '2026-09-26T10:00:00.000Z',
    data: data ?? {},
  }))
}

export function dealEvent(id: number, type: StoredEvent['type']): StoredEvent {
  return {
    id,
    dealId: 1,
    sessionId: null,
    seq: null,
    type,
    slide: null,
    videoTime: null,
    channel: null,
    clientAt: null,
    at: '2026-09-26T12:00:00.000Z',
    data: {},
  }
}

export function analytics(overrides: Partial<DealAnalytics> = {}): DealAnalytics {
  return {
    opens: 1,
    sessions: 1,
    totalWatchS: 120,
    perSlide: SLIDE_TIMES.map((s) => ({ slide: s.slide, watchS: 15, replays: 0 })),
    stopSlide: 6,
    replays: 0,
    completed: false,
    days: 1,
    lastEventId: 10,
    channel: 'email',
    ...overrides,
  }
}

export function timeline(overrides: Partial<Timeline> = {}, withTimes = true): Timeline {
  const segments: Segment[] = [
    {
      slide: 1,
      template: 'facecam',
      variables: { template: 'facecam', videoFile: 'analysts/3/intro-fi.mp4', analystName: 'Johanna Virtanen', transcript: null },
      labels: {},
      durationS: 30,
      startS: withTimes ? 0 : null,
      endS: withTimes ? 30 : null,
    },
    ...SLIDE_TIMES.slice(1).map((s): Segment => {
      const base = {
        labels: {},
        script: `Tämä on dian ${s.slide} käsikirjoitus. Se kertoo omistajalle lyhyesti, mitä ruudulla näkyy ja miksi asia on tärkeä.`,
        scriptSource: 'fallback' as const,
        audio: { file: `deals/1/audio/slide-${s.slide}.v1.mp3`, durationS: 19.6, status: 'ok' as const, error: null },
        durationS: 20,
        startS: withTimes ? s.startS : null,
        endS: withTimes ? s.endS : null,
      }
      switch (s.slide) {
        case 2:
          return { ...base, slide: 2, template: 'who-we-are', variables: { template: 'who-we-are', buyers: [], deals: [], buyerCount: 2200 } }
        case 3:
          return {
            ...base,
            slide: 3,
            template: 'your-company',
            variables: {
              template: 'your-company',
              company: 'Nordic Steel Oy',
              website: 'https://nordicsteel.example',
              lines: ['Valmistaa teräsrakenteita.', 'Toimii Pohjanmaalla.', 'Palvelee rakennusyhtiöitä.'],
              linesSource: 'model',
              screenshotFile: 'deals/1/screenshot.png',
            },
          }
        case 4:
          return {
            ...base,
            slide: 4,
            template: 'your-figures',
            variables: {
              template: 'your-figures',
              mode: 'figures',
              revenue: 4200000,
              profit: 610000,
              revenueText: '4,2 milj. €',
              profitText: '610 t. €',
              fiscalYear: 2025,
            },
          }
        case 5:
          return {
            ...base,
            slide: 5,
            template: 'buyers',
            variables: {
              template: 'buyers',
              buyers: [{ id: 'b1', name: 'Nordic Industrial Partners', focus: 'Metal workshops in the Nordics', website: null, logoFile: null }],
            },
          }
        case 6:
          return { ...base, slide: 6, template: 'what-is-possible', variables: { template: 'what-is-possible', deals: [] } }
        case 7:
          return { ...base, slide: 7, template: 'privacy', variables: { template: 'privacy' } }
        default:
          return {
            ...base,
            slide: 8,
            template: 'book-meeting',
            variables: { template: 'book-meeting', analystName: 'Johanna Virtanen', company: 'Nordic Steel Oy' },
          }
      }
    }),
  ]
  return { dealId: 1, version: 1, language: 'fi', fps: 30, width: 1920, height: 1080, pauseS: 0.4, segments, ...overrides }
}

export function brief(overrides: Partial<Omit<MeetingBrief, 'questions'>> = {}): Omit<MeetingBrief, 'questions'> {
  return {
    version: 1,
    language: 'en',
    writtenAt: '2026-09-26T08:00:00.000Z',
    header: {
      company: 'Nordic Steel Oy',
      owner: 'Matti Virtanen',
      ownerRole: 'CEO',
      meetingAt: '2026-09-28T09:00:00.000Z',
      timeZone: 'Europe/Helsinki',
      language: 'fi',
      interest: 'medium',
      summary: null,
    },
    company: { lines: ['Valmistaa teräsrakenteita.'], country: 'FI', nace: '25.11', staffCount: 45 },
    figures: {
      revenue: { type: 'exact', min: null, max: null, value: 4200000, source: 'asiakastieto', fiscalYear: 2025 },
      profit: { type: 'exact', min: null, max: null, value: 610000, source: 'asiakastieto', fiscalYear: 2025 },
      valuation: null,
    },
    engagement: {
      opens: 2,
      sessions: 2,
      totalWatchS: 142.4,
      perSlide: SLIDE_TIMES.map((s) => ({ slide: s.slide, watchS: 17.8, replays: 0 })),
      stopSlide: 6,
      replays: 0,
      channels: [{ channel: 'email', device: 'desktop' }],
    },
    signals: [
      {
        key: 'came_back',
        type: 'positive',
        evidenceEventId: 12,
        evidenceText: null,
        evidenceEvent: { type: 'open', at: '2026-09-27T18:10:00.000Z', slide: null, channel: 'email' },
      },
      {
        key: 'tapped_buyer_link',
        type: 'positive',
        evidenceEventId: 9,
        evidenceText: null,
        evidenceEvent: { type: 'buyer_link_tap', at: '2026-09-26T10:03:00.000Z', slide: 5, channel: 'email' },
      },
    ],
    form: {
      answers: [
        { key: 'staff', value: '20-49' },
        { key: 'timing', value: 'in_1_3_years' },
      ],
      custom: [{ question: 'Onko yrityksellä jatkajaa?', answer: 'Ei vielä.' }],
    },
    customQuestions: [{ question: 'Onko yrityksellä jatkajaa?', answer: 'Ei vielä.' }],
    buyers: [{ id: 'b1', name: 'Nordic Industrial Partners', website: null, tapped: true }],
    ...overrides,
  }
}
