import { useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { DealRowDto, FigureValue, InboxDto } from '@mergero/shared'
import { DEAL_STATUSES, STAGES, formatDurationS, formatMoney, isClosedStatus } from '@mergero/shared'
import { t } from '@mergero/shared/i18n'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, Search, TriangleAlert } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useDeals, useInbox } from '../api'
import { useCurrentAnalyst } from '../analyst-context'
import { GenerateVideosDialog } from '../components/generate-videos-dialog'
import { InterestBadge } from '../components/interest-badge'
import { MailLink } from '../components/mail-link'
import { PageHeader } from '../components/page-header'
import { EmptyState, QueryState } from '../components/query-state'
import { SegmentedFilter } from '../components/segmented-filter'
import { ShapeIcon } from '../components/shape-icon'
import { StatusText, ToneText } from '../components/state-badge'
import { TodoAction, TodoReason } from '../components/todo-action'
import { VideoThumb } from '../components/video-thumb'
import { BuyerLogo } from '../review/buyers-field'
import { displayName, figureText } from '../lib/brief'
import { companyInitials, formatDate, formatDateTime, formatPercent, pluralize } from '../lib/format'
import { funnelSteps, inFunnelStep, type FunnelKey } from '../lib/funnel'
import { INTEREST_SCORE, STATUS_META, type Shape, type Tone } from '../lib/status'
import { NO_TODO_PRIORITY, dealHref, todoItems, type TodoItem } from '../lib/todo'

type Filter = FunnelKey | 'todo'

const ALL = 'all'
const interestLabels = t('en').interest
const SOURCE_LABELS = { asiakastieto: 'Asiakastieto', form: 'form', calculator: 'calculator' } as const
const RATE_BASES = { all: 'of all', sent: 'of sent', opened: 'of opened' } as const
const TODO_SORTING: SortingState = [{ id: 'sequence', desc: false }]

const FILTER_LABELS: Record<Filter, { label: string; shape: Shape }> = {
  todo: { label: 'To do today', shape: 'circle' },
  all: { label: 'All deals', shape: 'minus' },
  unsent: { label: 'Not sent', shape: 'circle-dashed' },
  link_sent: STATUS_META.link_sent,
  opened: STATUS_META.opened,
  form_sent: STATUS_META.form_sent,
  meeting_booked: STATUS_META.meeting_booked,
  lost: STATUS_META.lost,
}

const companySearch: FilterFn<DealRowDto> = (row, _columnId, value) => {
  const query = String(value).trim().toLowerCase()
  if (query === '') return true
  const deal = row.original
  return deal.company.toLowerCase().includes(query) || deal.ownerName.toLowerCase().includes(query) || String(deal.id) === query
}

function revenueText(figure: FigureValue): string {
  return figure.type === 'exact' && figure.value !== null ? formatMoney(figure.value, 'en') : figureText(figure, 'en')
}

function figureSortValue(deal: DealRowDto): number | undefined {
  const figure = deal.revenue
  return figure === null ? undefined : (figure.value ?? figure.max ?? figure.min ?? undefined)
}

function reachedIndex(deal: DealRowDto): number {
  return STAGES.indexOf(deal.reached as (typeof STAGES)[number])
}

function StageBar({ deal }: { deal: DealRowDto }) {
  const reached = reachedIndex(deal)
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {STAGES.map((stage, index) => (
        <span
          key={stage}
          className={cn('h-1 w-5 rounded-full', index > reached ? 'bg-muted' : isClosedStatus(deal.status) ? 'bg-muted-foreground' : 'bg-primary')}
        />
      ))}
    </span>
  )
}

function sequenceTone(deal: DealRowDto): Tone | null {
  if (deal.nextAction === null) return 'neutral'
  if (deal.status === 'failed') return 'danger'
  if (deal.status === 'review') return 'attention'
  return deal.status === 'meeting_booked' ? 'success' : null
}

function Sequence({ deal, todo, timeZone, onRetried }: { deal: DealRowDto; todo?: TodoItem; timeZone?: string; onRetried: () => void }) {
  if (!todo) {
    const tone = sequenceTone(deal)
    const text = deal.nextAction ?? 'No next step'
    return (
      <div title={text} className="grid gap-0.5">
        {tone === null ? (
          <span className="truncate text-sm">{text}</span>
        ) : (
          <ToneText tone={tone} className="truncate text-sm">{text}</ToneText>
        )}
        <span className="font-mono text-xs text-muted-foreground">{formatDate(deal.updatedAt)}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="grid min-w-0 justify-items-start gap-1">
        <TodoReason item={todo} timeZone={timeZone} />
        <span className="truncate text-xs text-muted-foreground" title={todo.row.context}>{todo.row.context}</span>
        {todo.row.meetingEmail ? <MailLink email={todo.row.meetingEmail} /> : null}
      </div>
      <TodoAction row={todo.row} onRetried={onRetried} />
    </div>
  )
}

function videoNote(deal: DealRowDto): string {
  if (reachedIndex(deal) < 0) return deal.status === 'failed' ? 'Failed' : deal.video ? 'Draft, needs review' : 'Draft'
  if (deal.completed) return 'Watched to the end'
  if (deal.watchS === 0) return 'Not opened'
  const duration = deal.video?.durationS ?? 0
  if (duration > 0) return `${Math.min(100, Math.round((deal.watchS / duration) * 100))} % watched`
  return deal.stopSlide === null ? 'Watched' : `Stop at slide ${deal.stopSlide}`
}

function CompanyLogo({ deal }: { deal: DealRowDto }) {
  const [failed, setFailed] = useState(false)
  if (deal.logoUrl && !failed) {
    return (
      <img
        src={deal.logoUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-8 shrink-0 rounded-lg border bg-white object-contain p-0.5"
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-xs font-semibold text-link"
    >
      {companyInitials(deal.company)}
    </span>
  )
}

const BUYER_DOTS = ['bg-primary', 'bg-primary/60', 'bg-primary/30']

function Buyers({ deal }: { deal: DealRowDto }) {
  const { buyers } = deal
  if (buyers === null) return <span className="text-sm text-muted-foreground">Not read yet</span>
  const label = pluralize(buyers.length, 'buyer', 'buyers')
  if (buyers.length === 0) return <span className="text-sm text-muted-foreground">{label}</span>
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${label} for ${deal.company}`}
        className="-mx-1 inline-flex items-center gap-2 rounded px-1 text-sm whitespace-nowrap underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true" className="flex">
          {BUYER_DOTS.slice(0, Math.min(buyers.length, BUYER_DOTS.length)).map((dot) => (
            <span key={dot} className={cn('-mr-1.5 size-4 rounded-full border-2 border-card', dot)} />
          ))}
        </span>
        <span className="ml-1.5">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0" onClick={(event) => event.stopPropagation()}>
        <p className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{`MGX buyers for ${deal.company}`}</p>
        <ul className="grid grid-cols-1 gap-2 px-3 pb-3">
          {buyers.map((buyer) => (
            <li key={buyer.id} className="flex items-center gap-3">
              <BuyerLogo buyer={buyer} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{buyer.name}</p>
                <p className="text-xs text-muted-foreground">{buyer.focus}</p>
              </div>
              <Button type="button" variant="outline" size="xs" aria-label={`Open ${buyer.name} in MGX`} className="shrink-0">
                Open in MGX
                <ExternalLink aria-hidden="true" data-icon="inline-end" />
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function dealColumns(todos: Map<number, TodoItem>, timeZone: string | undefined, onRetried: () => void): ColumnDef<DealRowDto>[] {
  return [
    {
      id: 'company',
      size: 200,
      accessorKey: 'company',
      header: 'Prospect',
      cell: ({ row }) => {
        const deal = row.original
        const owner = [deal.ownerName, deal.ownerRole].filter(Boolean).join(', ') || 'No contact person'
        return (
          <div className="flex items-center gap-3">
            <CompanyLogo deal={deal} />
            <div className="grid min-w-0 gap-0.5">
              <Link
                to={dealHref(deal.id, deal.status, todos.get(deal.id)?.row.action)}
                title={deal.company}
                className="truncate font-medium underline-offset-2 hover:underline"
              >
                {deal.company}
              </Link>
              <span title={owner} className="truncate text-xs text-muted-foreground">{owner}</span>
            </div>
          </div>
        )
      },
    },
    {
      id: 'market',
      size: 110,
      accessorKey: 'country',
      header: 'Market',
      cell: ({ row }) => (
        <div className="grid gap-0.5">
          <span className="font-mono text-sm font-medium">{row.original.country}</span>
          <span className="truncate text-xs text-muted-foreground">{displayName('en-US', 'language', row.original.language)}</span>
        </div>
      ),
    },
    {
      id: 'figures',
      size: 170,
      accessorFn: figureSortValue,
      header: 'Company data',
      sortUndefined: 'last',
      cell: ({ row }) => {
        const deal = row.original
        const source = deal.revenue ? SOURCE_LABELS[deal.revenue.source] : deal.askInForm ? 'ask in form' : 'not read yet'
        return (
          <div className="grid gap-0.5">
            <span className={cn('truncate text-sm', deal.revenue === null && 'text-muted-foreground')}>
              {deal.revenue ? revenueText(deal.revenue) : 'No figures'}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {`${deal.staffCount === null ? 'Staff unknown' : `${deal.staffCount} staff`} · ${source}`}
            </span>
          </div>
        )
      },
    },
    {
      id: 'buyers',
      size: 115,
      accessorFn: (deal) => deal.buyers?.length,
      header: 'Buyers',
      sortUndefined: 'last',
      cell: ({ row }) => <Buyers deal={row.original} />,
    },
    {
      id: 'stage',
      size: 140,
      accessorFn: (deal) => DEAL_STATUSES.indexOf(deal.status),
      header: 'Stage',
      cell: ({ row }) => (
        <div className="grid justify-items-start gap-1.5">
          <StatusText status={row.original.status} />
          <StageBar deal={row.original} />
        </div>
      ),
    },
    {
      id: 'interest',
      size: 115,
      accessorFn: (deal) => (deal.interest === null ? undefined : INTEREST_SCORE[deal.interest]),
      header: 'Interest',
      sortUndefined: 'last',
      cell: ({ row }) => {
        const { interest } = row.original
        return interest ? (
          <InterestBadge level={interest} label={interestLabels[interest]} />
        ) : (
          <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
            <span aria-hidden="true" className="size-5 rounded-md border-[1.5px] border-dashed border-muted-foreground/50" />
            No data
          </span>
        )
      },
    },
    {
      id: 'video',
      size: 180,
      accessorKey: 'watchS',
      header: 'Video',
      cell: ({ row }) => {
        const deal = row.original
        const sent = reachedIndex(deal) >= 0
        return (
          <div className="flex items-center gap-3">
            <VideoThumb
              posterUrl={deal.video?.posterUrl ?? null}
              href={dealHref(deal.id, deal.status, todos.get(deal.id)?.row.action)}
              company={deal.company}
            />
            <div className="grid min-w-0 gap-0.5">
              <span className="font-mono text-sm font-medium tabular-nums whitespace-nowrap">
                {sent ? formatDurationS(deal.watchS) : 'Not sent'}
              </span>
              <span className="truncate text-xs text-muted-foreground">{videoNote(deal)}</span>
            </div>
          </div>
        )
      },
    },
    {
      id: 'activity',
      size: 150,
      accessorFn: (deal) => deal.lastActivity?.at,
      header: 'Last activity',
      sortUndefined: 'last',
      cell: ({ row }) => {
        const activity = row.original.lastActivity
        if (activity === null) return <span className="text-sm text-muted-foreground">No sessions yet</span>
        return (
          <div className="grid gap-0.5">
            <span className="text-sm whitespace-normal">{activity.text}</span>
            <span className="font-mono text-xs text-muted-foreground">{formatDateTime(activity.at, timeZone)}</span>
          </div>
        )
      },
    },
    {
      id: 'sequence',
      size: 260,
      accessorFn: (deal) => todos.get(deal.id)?.priority ?? (deal.nextAction === null ? undefined : NO_TODO_PRIORITY),
      header: 'Sequence',
      sortUndefined: 'last',
      cell: ({ row }) => <Sequence deal={row.original} todo={todos.get(row.original.id)} timeZone={timeZone} onRetried={onRetried} />,
    },
    {
      id: 'analyst',
      size: 110,
      accessorKey: 'analystName',
      header: 'Analyst',
    },
  ]
}

interface CardProps {
  filter: Filter
  count: number
  note: string | null
  share: number | null
  active: boolean
  onSelect: () => void
}

function FilterCard({ filter, count, note, share, active, onSelect }: CardProps) {
  const meta = FILTER_LABELS[filter]
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'grid content-start gap-1.5 rounded-xl border bg-card px-3.5 py-3 text-left outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring',
        active && 'border-primary ring-1 ring-primary',
        filter === 'todo' && 'bg-primary/5',
      )}
    >
      <span className={cn('flex items-center gap-1.5 text-xs font-medium', filter === 'todo' ? 'text-link' : 'text-muted-foreground')}>
        <ShapeIcon shape={meta.shape} />
        {meta.label}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl leading-none font-semibold tabular-nums">{count}</span>
        {note ? <span className="text-xs whitespace-nowrap text-muted-foreground">{note}</span> : null}
      </span>
      {share === null ? null : (
        <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-1 bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
        </span>
      )}
    </button>
  )
}

function OtherTodos({ items, onRetried }: { items: TodoItem[]; onRetried: () => void }) {
  if (items.length === 0) return null
  return (
    <Alert variant="destructive" role="status">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{`${pluralize(items.length, 'job', 'jobs')} outside a deal failed`}</AlertTitle>
      <AlertDescription>
        <ul className="grid w-full gap-2">
          {items.map(({ row }) => (
            <li key={row.key} className="flex flex-wrap items-center justify-between gap-2">
              <span>{`${row.company}: ${row.context}`}</span>
              <TodoAction row={row} onRetried={onRetried} />
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function DealsView({ deals, inbox, analystId, timeZone }: { deals: DealRowDto[]; inbox: InboxDto | null; analystId: number | null; timeZone?: string }) {
  const navigate = useNavigate()
  const status = useRef<HTMLParagraphElement>(null)
  const [mine, setMine] = useState(analystId !== null)
  const [filter, setFilter] = useState<Filter>(inbox === null ? 'all' : 'todo')
  const [search, setSearch] = useState('')
  const [country, setCountry] = useState(ALL)
  const [sorting, setSorting] = useState<SortingState>([])
  const searchId = useId()
  const countryId = useId()

  const todos = useMemo(() => todoItems(inbox), [inbox])
  const scoped = useMemo(() => deals.filter((deal) => !mine || deal.analystId === analystId), [deals, mine, analystId])
  const steps = useMemo(() => funnelSteps(scoped), [scoped])
  const todoCount = scoped.filter((deal) => todos.byDeal.has(deal.id)).length
  const countries = useMemo(() => [...new Set(deals.map((deal) => deal.country))].sort(), [deals])
  const data = useMemo(
    () =>
      scoped.filter(
        (deal) =>
          (filter === 'todo' ? todos.byDeal.has(deal.id) : inFunnelStep(deal, filter)) && (country === ALL || deal.country === country),
      ),
    [scoped, filter, todos, country],
  )
  const columns = useMemo(() => dealColumns(todos.byDeal, timeZone, () => status.current?.focus()), [todos, timeZone])
  const activeSorting = filter === 'todo' && sorting.length === 0 ? TODO_SORTING : sorting
  const columnVisibility = useMemo(() => ({ analyst: !mine }), [mine])

  // eslint-disable-next-line react-hooks/incompatible-library -- the app does not use the React Compiler
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter: search, sorting: activeSorting, columnVisibility },
    onSortingChange: setSorting,
    globalFilterFn: companySearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows
  const filtered = search !== '' || country !== ALL
  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, deal: DealRowDto) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return
    void navigate(dealHref(deal.id, deal.status, todos.byDeal.get(deal.id)?.row.action))
  }
  const empty =
    scoped.length === 0
      ? 'No deals with a video yet. Use Generate videos to start.'
      : filter === 'todo' && !filtered
        ? 'Nothing needs an action today. Select All deals to see the pipeline.'
        : 'No deals match the filters.'

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <OtherTodos items={todos.other} onRetried={() => status.current?.focus()} />
      {analystId !== null ? (
        <SegmentedFilter
          label="Analyst"
          value={mine ? 'mine' : ALL}
          onChange={(value) => setMine(value === 'mine')}
          items={[
            { value: 'mine', label: 'My deals' },
            { value: ALL, label: 'All analysts' },
          ]}
        />
      ) : null}
      <div role="group" aria-label="Show" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {inbox === null ? null : (
          <FilterCard
            filter="todo"
            count={todoCount}
            note={todoCount === 0 ? 'all done' : 'need an action'}
            share={null}
            active={filter === 'todo'}
            onSelect={() => setFilter('todo')}
          />
        )}
        {steps.map((step) => (
          <FilterCard
            key={step.key}
            filter={step.key}
            count={step.count}
            note={step.base !== null && step.rate !== null ? `${formatPercent(step.rate)} ${RATE_BASES[step.base]}` : null}
            share={step.base !== null ? step.share : null}
            active={filter === step.key}
            onSelect={() => setFilter(filter === step.key && step.key !== 'all' ? 'all' : step.key)}
          />
        ))}
      </div>
      <div role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Search deals
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            type="search"
            placeholder="Company, owner or deal ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64 pl-8"
          />
        </div>
        <label htmlFor={countryId} className="sr-only">
          Country
        </label>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger id={countryId} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All countries</SelectItem>
            {countries.map((code) => (
              <SelectItem key={code} value={code}>{`${displayName('en-US', 'region', code)} (${code})`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setCountry(ALL)
            }}
          >
            Clear filters
          </Button>
        ) : null}
        <p ref={status} tabIndex={-1} aria-live="polite" className="ml-auto text-xs text-muted-foreground outline-none">
          {`${pluralize(rows.length, 'deal', 'deals')} of ${scoped.length}`}
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <div className="min-w-0 rounded-xl border bg-card">
          <Table className="table-fixed" style={{ minWidth: table.getTotalSize() }}>
            <caption className="sr-only">Deals. Select a company name to open the deal page.</caption>
            <colgroup>
              {table.getVisibleLeafColumns().map((column) => (
                <col key={column.id} style={{ width: column.getSize() }} />
              ))}
            </colgroup>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    return (
                      <TableHead
                        key={header.id}
                        scope="col"
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                      >
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp aria-hidden="true" className="size-3" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown aria-hidden="true" className="size-3" />
                          ) : (
                            <ChevronsUpDown aria-hidden="true" className="size-3 opacity-40" />
                          )}
                        </button>
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} onClick={(event) => onRowClick(event, row.original)} className="cursor-pointer">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="overflow-hidden">{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

export function DealsPage() {
  const deals = useDeals()
  const { analyst, analystId, loading } = useCurrentAnalyst()
  const inbox = useInbox(analystId)
  const view = (data: DealRowDto[], box: InboxDto | null) => (
    <DealsView key={analystId ?? ALL} deals={data} inbox={box} analystId={analystId} timeZone={analyst?.timeZone} />
  )
  return (
    <>
      <PageHeader
        title="Deals"
        description="Start with To do today. The other cards show the outreach pipeline. Select a row to open the deal."
        actions={<GenerateVideosDialog analystId={analystId} />}
      />
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading the analysts.
        </p>
      ) : (
        <QueryState query={deals} label="the deals">
          {(data) =>
            analystId === null ? (
              view(data, null)
            ) : (
              <QueryState query={inbox} label="the to-do list">
                {(box) => view(data, box)}
              </QueryState>
            )
          }
        </QueryState>
      )}
    </>
  )
}
