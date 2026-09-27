import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type {
  AlertDto,
  AnalystDto,
  AnalystPatch,
  ApiError,
  Channel,
  ContactPatch,
  DealDetailDto,
  DealRowDto,
  GenerateResultDto,
  InboxDto,
  Lang,
  LiveEvent,
  MetricsDto,
  OutreachDto,
  ProspectDto,
  ProviderStatus,
  QueueItemDto,
  ReviewDto,
  ReviewPatch,
  ReviewReason,
  RecordingEvent,
  SessionEventsDto,
  TemplatePreviewDto,
  VoiceIdBody,
} from '@mergero/shared'
import { ADMIN_REQUEST_HEADER, isClosedStatus } from '@mergero/shared'
import { approvalState } from './lib/review'

export class ApiRequestError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, message: string, detail: unknown = null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.detail = detail
  }
}

type QueryParams = Record<string, string | number | null | undefined>

interface RequestOptions {
  query?: QueryParams
  json?: unknown
  form?: FormData
  signal?: AbortSignal
}

export function apiUrl(path: string, query: QueryParams = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
  }
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && typeof (value as ApiError).error === 'string'
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', [ADMIN_REQUEST_HEADER]: '1' }
  let body: BodyInit | undefined
  if (options.form) body = options.form
  else if (options.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.json)
  }
  let response: Response
  try {
    response = await fetch(apiUrl(path, options.query), { method, headers, body, signal: options.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiRequestError(0, 'The server does not answer. Check that the API runs, then try again.')
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  let data: unknown
  try {
    data = text === '' ? undefined : JSON.parse(text)
  } catch {
    data = undefined
    if (response.ok) throw new ApiRequestError(response.status, 'The server sent a response that is not JSON.')
  }
  if (!response.ok) {
    const apiError = isApiError(data) ? data : null
    throw new ApiRequestError(
      response.status,
      apiError?.error ?? `The request failed with HTTP status ${response.status}.`,
      apiError?.detail ?? null,
    )
  }
  return data as T
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Try again.'
}

export function isReviewReasonList(value: unknown): value is ReviewReason[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'object' && item !== null && typeof (item as ReviewReason).code === 'string')
  )
}

export const queryKeys = {
  status: ['status'] as const,
  analysts: ['analysts'] as const,
  inbox: (analyst: number) => ['inbox', analyst] as const,
  deals: ['deals'] as const,
  prospects: (analyst: number) => ['prospects', analyst] as const,
  ensure: (id: number) => ['ensure', id] as const,
  deal: (id: number) => ['deal', id] as const,
  review: (id: number) => ['review', id] as const,
  outreach: (deal: DealDetailDto, channel: Channel) => ['outreach', deal.id, channel, deal.pageLanguage, deal.expiresAt] as const,
  sessionEvents: (id: string) => ['session-events', id] as const,
  sessionRecording: (id: string) => ['session-recording', id] as const,
  alerts: (analyst: number) => ['alerts', analyst] as const,
  metrics: (from: string, to: string, timeZone: string, source: MetricsSource) => ['metrics', from, to, timeZone, source] as const,
  templates: ['templates'] as const,
  queue: ['queue'] as const,
}

const LIVE_QUERY_ROOTS: ReadonlySet<string> = new Set(['analysts', 'inbox', 'deals', 'deal', 'review', 'alerts', 'queue', 'session-events'])
const LIVE_BATCH_MS = 250

// The server sends an event when the database or Pipedrive changes. Prospects read Pipedrive, so only a Pipedrive event refreshes them.
export function useLiveUpdates(): void {
  const client = useQueryClient()
  useEffect(() => {
    const source = new EventSource('/api/events')
    let timer: number | undefined
    let prospects = false
    let connected = false
    const refresh = (withProspects: boolean) => {
      prospects ||= withProspects
      timer ??= window.setTimeout(() => {
        const root = (key: readonly unknown[]) => String(key[0])
        void client.invalidateQueries({
          predicate: (query) => LIVE_QUERY_ROOTS.has(root(query.queryKey)) || (prospects && root(query.queryKey) === 'prospects'),
        })
        timer = undefined
        prospects = false
      }, LIVE_BATCH_MS)
    }
    source.addEventListener('ready', () => {
      if (connected) refresh(true)
      connected = true
    })
    source.addEventListener('db', () => refresh(false))
    source.addEventListener('pipedrive', (event) => refresh((JSON.parse(event.data as string) as Extract<LiveEvent, { type: 'pipedrive' }>).prospects))
    return () => {
      source.close()
      window.clearTimeout(timer)
    }
  }, [client])
}

export function useProviderStatus() {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: ({ signal }) => request<ProviderStatus>('GET', '/api/status', { signal }),
    staleTime: 5 * 60_000,
  })
}

export function useAnalysts() {
  return useQuery({
    queryKey: queryKeys.analysts,
    queryFn: ({ signal }) => request<AnalystDto[]>('GET', '/api/analysts', { signal }),
  })
}

function useStoreAnalyst() {
  const client = useQueryClient()
  return (analyst: AnalystDto) =>
    client.setQueryData<AnalystDto[]>(queryKeys.analysts, (list) =>
      list?.map((item) => (item.id === analyst.id ? analyst : item)),
    )
}

export function useUpdateAnalyst(analystId: number) {
  const store = useStoreAnalyst()
  return useMutation({
    mutationFn: (patch: AnalystPatch) => request<AnalystDto>('PATCH', `/api/analysts/${analystId}`, { json: patch }),
    onSuccess: store,
  })
}

export function useSetVoiceId(analystId: number) {
  const store = useStoreAnalyst()
  return useMutation({
    mutationFn: (voiceId: string | null) =>
      request<AnalystDto>('PUT', `/api/analysts/${analystId}/voice-id`, { json: { voiceId } satisfies VoiceIdBody }),
    onSuccess: store,
  })
}

export function useUploadIntro(analystId: number) {
  const store = useStoreAnalyst()
  return useMutation({
    mutationFn: ({ lang, file, transcript }: { lang: Lang; file: Blob; transcript: string }) => {
      const form = new FormData()
      form.append('file', file, file instanceof File ? file.name : `intro-${lang}`)
      if (transcript.trim() !== '') form.append('transcript', transcript.trim())
      return request<AnalystDto>('POST', `/api/analysts/${analystId}/intros/${lang}`, { form })
    },
    onSuccess: store,
  })
}

export function useUploadVoice(analystId: number) {
  const store = useStoreAnalyst()
  return useMutation({
    mutationFn: (file: Blob) => {
      const form = new FormData()
      form.append('file', file, file instanceof File ? file.name : 'voice-sample')
      return request<AnalystDto>('POST', `/api/analysts/${analystId}/voice`, { form })
    },
    onSuccess: store,
  })
}

export function useUploadPhoto(analystId: number) {
  const store = useStoreAnalyst()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file, file.name)
      return request<AnalystDto>('POST', `/api/analysts/${analystId}/photo`, { form })
    },
    onSuccess: store,
  })
}

export function useUploadConsent(analystId: number) {
  const store = useStoreAnalyst()
  return useMutation({
    mutationFn: ({ file, date }: { file: File; date: string }) => {
      const form = new FormData()
      form.append('file', file, file.name)
      form.append('date', date)
      return request<AnalystDto>('POST', `/api/analysts/${analystId}/consent`, { form })
    },
    onSuccess: store,
  })
}

export function useInbox(analystId: number | null) {
  return useQuery({
    queryKey: queryKeys.inbox(analystId ?? 0),
    queryFn: ({ signal }) => request<InboxDto>('GET', '/api/inbox', { query: { analyst: analystId }, signal }),
    enabled: analystId !== null,
    refetchInterval: 60_000,
  })
}

export function useDeals(enabled = true) {
  return useQuery({
    queryKey: queryKeys.deals,
    queryFn: ({ signal }) => request<DealRowDto[]>('GET', '/api/deals', { signal }),
    enabled,
    staleTime: 30_000,
  })
}

export function useProspects(analystId: number | null) {
  return useQuery({
    queryKey: queryKeys.prospects(analystId ?? 0),
    queryFn: ({ signal }) => request<ProspectDto[]>('GET', '/api/prospects', { query: { analyst: analystId }, signal }),
    enabled: analystId !== null,
    staleTime: 60_000,
  })
}

export function useGenerateVideos() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (dealIds: number[]) => request<GenerateResultDto[]>('POST', '/api/deals/generate', { json: { dealIds } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['prospects'] })
      void client.invalidateQueries({ queryKey: ['inbox'] })
      void client.invalidateQueries({ queryKey: queryKeys.deals })
      void client.invalidateQueries({ queryKey: queryKeys.queue })
    },
  })
}

export function useEnsureDeal(dealId: number) {
  return useQuery({
    queryKey: queryKeys.ensure(dealId),
    queryFn: () => request<{ id: number; created: boolean }>('POST', `/api/deals/${dealId}/ensure`),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

export function useDeal(dealId: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.deal(dealId),
    queryFn: ({ signal }) => request<DealDetailDto>('GET', `/api/deals/${dealId}`, { signal }),
    enabled,
  })
}

export function reviewIsWorking(review: ReviewDto | undefined): boolean {
  if (!review || isClosedStatus(review.status) || review.expired) return false
  return review.pipeline.running || review.renderStatus === 'rendering' || approvalState(review) === 'waiting'
}

export function useUpdateContact(dealId: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: ContactPatch) => request<DealDetailDto>('PATCH', `/api/deals/${dealId}/contact`, { json: patch }),
    onSuccess: (deal) => {
      client.setQueryData(queryKeys.deal(dealId), deal)
      void client.invalidateQueries({ queryKey: queryKeys.review(dealId) })
      void client.invalidateQueries({ queryKey: ['prospects'] })
    },
  })
}

export function useReview(dealId: number) {
  return useQuery({
    queryKey: queryKeys.review(dealId),
    queryFn: ({ signal }) => request<ReviewDto>('GET', `/api/deals/${dealId}/review`, { signal }),
  })
}

export function usePatchReview(dealId: number, { silent = false } = {}) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: ReviewPatch) => request<ReviewDto>('PATCH', `/api/deals/${dealId}/review`, { json: patch }),
    meta: { silent },
    onSuccess: (review) => {
      client.setQueryData(queryKeys.review(dealId), review)
      void client.invalidateQueries({ queryKey: queryKeys.deal(dealId) })
    },
  })
}

export function useApprove(dealId: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => request<ReviewDto>('POST', `/api/deals/${dealId}/approve`),
    meta: { silent: true },
    onSuccess: (review) => {
      client.setQueryData(queryKeys.review(dealId), review)
      void client.invalidateQueries({ queryKey: queryKeys.deal(dealId) })
      void client.invalidateQueries({ queryKey: ['inbox'] })
      void client.invalidateQueries({ queryKey: queryKeys.deals })
    },
  })
}

export function useSetExpiry(dealId: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (days: number) => request<DealDetailDto>('POST', `/api/deals/${dealId}/expiry`, { json: { days } }),
    onSuccess: (deal) => {
      client.setQueryData(queryKeys.deal(dealId), deal)
      void client.invalidateQueries({ queryKey: queryKeys.review(dealId) })
    },
  })
}

export function useOutreach(deal: DealDetailDto, channel: Channel) {
  return useQuery({
    queryKey: queryKeys.outreach(deal, channel),
    queryFn: ({ signal }) => request<OutreachDto>('POST', `/api/deals/${deal.id}/outreach`, { json: { channel }, signal }),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function useMarkBriefRead(dealId: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => request<void>('POST', `/api/deals/${dealId}/brief/read`),
    meta: { silent: true },
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.deal(dealId) }),
  })
}

export function useSessionEvents(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessionEvents(sessionId ?? ''),
    queryFn: ({ signal }) => request<SessionEventsDto>('GET', `/api/sessions/${encodeURIComponent(sessionId ?? '')}/events`, { signal }),
    enabled: sessionId !== null,
  })
}

export function useSessionRecording(sessionId: string) {
  return useQuery({
    queryKey: queryKeys.sessionRecording(sessionId),
    queryFn: ({ signal }) =>
      request<RecordingEvent[]>('GET', `/api/sessions/${encodeURIComponent(sessionId)}/recording`, { signal }),
  })
}

export function useTaskDone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (taskId: number) => request<void>('POST', `/api/tasks/${taskId}/done`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['deal'] })
      void client.invalidateQueries({ queryKey: ['inbox'] })
      void client.invalidateQueries({ queryKey: queryKeys.deals })
    },
  })
}

export function useRetryJob() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (jobId: number) => request<void>('POST', `/api/jobs/${jobId}/retry`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['deal'] })
      void client.invalidateQueries({ queryKey: ['review'] })
      void client.invalidateQueries({ queryKey: ['inbox'] })
      void client.invalidateQueries({ queryKey: queryKeys.analysts })
    },
  })
}

export function useAlerts(analystId: number | null) {
  return useQuery({
    queryKey: queryKeys.alerts(analystId ?? 0),
    queryFn: ({ signal }) => request<AlertDto[]>('GET', '/api/alerts', { query: { analyst: analystId }, signal }),
    enabled: analystId !== null,
  })
}

export function useMarkAlertsSeen() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (analystId: number) => request<void>('POST', '/api/alerts/seen', { json: { analyst: analystId } }),
    onSuccess: (_result, analystId) => client.invalidateQueries({ queryKey: queryKeys.alerts(analystId) }),
  })
}

export type MetricsSource = 'real' | 'mock'

export function useMetrics(from: string, to: string, timeZone: string, source: MetricsSource, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.metrics(from, to, timeZone, source),
    queryFn: ({ signal }) => request<MetricsDto>('GET', '/api/metrics', { query: { from, to, tz: timeZone, source }, signal }),
    enabled,
    placeholderData: (previous) => previous,
  })
}

export function useTemplates(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: ({ signal }) => request<TemplatePreviewDto[]>('GET', '/api/templates', { signal }),
    enabled,
    staleTime: 10 * 60_000,
  })
}

export function useQueue() {
  return useQuery({
    queryKey: queryKeys.queue,
    queryFn: ({ signal }) => request<QueueItemDto[]>('GET', '/api/queue', { signal }),
  })
}
