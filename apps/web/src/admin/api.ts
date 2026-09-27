import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AlertDto,
  AnalystDto,
  AnalystPatch,
  ApiError,
  DealDetailDto,
  DealRowDto,
  InboxDto,
  Lang,
  MetricsDto,
  ProviderStatus,
  ReviewDto,
  ReviewPatch,
  ReviewReason,
  SessionEventsDto,
  TemplatePreviewDto,
} from '@mergero/shared'
import { ADMIN_REQUEST_HEADER } from '@mergero/shared'
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
  ensure: (id: number) => ['ensure', id] as const,
  deal: (id: number) => ['deal', id] as const,
  review: (id: number) => ['review', id] as const,
  sessionEvents: (id: string) => ['session-events', id] as const,
  alerts: (analyst: number) => ['alerts', analyst] as const,
  metrics: (from: string, to: string, timeZone: string) => ['metrics', from, to, timeZone] as const,
  templates: ['templates'] as const,
}

const POLL_MS = 3000

export function useProviderStatus() {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: ({ signal }) => request<ProviderStatus>('GET', '/api/status', { signal }),
    staleTime: 5 * 60_000,
  })
}

function analystsBusy(analysts: AnalystDto[] | undefined): boolean {
  return (
    analysts?.some(
      (analyst) =>
        analyst.voice.cloneStatus === 'pending' ||
        analyst.intros.some((intro) => intro.status === 'processing' || intro.pending?.status === 'processing'),
    ) ?? false
  )
}

export function useAnalysts() {
  return useQuery({
    queryKey: queryKeys.analysts,
    queryFn: ({ signal }) => request<AnalystDto[]>('GET', '/api/analysts', { signal }),
    refetchInterval: (query) => (analystsBusy(query.state.data) ? 5000 : false),
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
    refetchInterval: (query) => (query.state.data?.pipeline.running ? POLL_MS : false),
  })
}

export function reviewNeedsPolling(review: ReviewDto | undefined): boolean {
  if (!review || review.status === 'lost' || review.expired) return false
  return review.pipeline.running || review.renderStatus === 'rendering' || approvalState(review) === 'waiting'
}

export function useReview(dealId: number) {
  return useQuery({
    queryKey: queryKeys.review(dealId),
    queryFn: ({ signal }) => request<ReviewDto>('GET', `/api/deals/${dealId}/review`, { signal }),
    refetchInterval: (query) => (reviewNeedsPolling(query.state.data) ? POLL_MS : false),
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
    refetchInterval: 30_000,
  })
}

export function useMarkAlertsSeen() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (analystId: number) => request<void>('POST', '/api/alerts/seen', { json: { analyst: analystId } }),
    onSuccess: (_result, analystId) => client.invalidateQueries({ queryKey: queryKeys.alerts(analystId) }),
  })
}

export function useMetrics(from: string, to: string, timeZone: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.metrics(from, to, timeZone),
    queryFn: ({ signal }) => request<MetricsDto>('GET', '/api/metrics', { query: { from, to, tz: timeZone }, signal }),
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
