import { useId, useMemo, useState, type MouseEvent } from 'react'
import type { DealRowDto, DealStatus } from '@mergero/shared'
import { DEAL_STATUSES, formatDurationS } from '@mergero/shared'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDeals } from '../api'
import { useCurrentAnalyst } from '../analyst-context'
import { PageHeader } from '../components/page-header'
import { EmptyState, QueryState } from '../components/query-state'
import { StatusBadge } from '../components/state-badge'
import { displayName } from '../lib/brief'
import { pluralize } from '../lib/format'
import { STATUS_META } from '../lib/status'

const ALL = 'all'
const STATUS_ORDER = new Map<DealStatus, number>(DEAL_STATUSES.map((status, index) => [status, index]))

const equalsValue: FilterFn<DealRowDto> = (row, columnId, value) => String(row.getValue(columnId)) === String(value)

const companySearch: FilterFn<DealRowDto> = (row, _columnId, value) => {
  const query = String(value).trim().toLowerCase()
  if (query === '') return true
  const deal = row.original
  return deal.company.toLowerCase().includes(query) || String(deal.id) === query
}

const columns: ColumnDef<DealRowDto>[] = [
  {
    accessorKey: 'company',
    header: 'Company',
    cell: ({ row }) => (
      <Link
        to={`/deals/${row.original.id}`}
        className="rounded-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {row.original.company}
      </Link>
    ),
  },
  {
    accessorKey: 'country',
    header: 'Country',
    filterFn: equalsValue,
  },
  {
    id: 'analyst',
    accessorFn: (deal) => deal.analystName,
    header: 'Analyst',
    filterFn: (row, _columnId, value) => String(row.original.analystId) === String(value),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    filterFn: equalsValue,
    sortingFn: (a, b) =>
      (STATUS_ORDER.get(a.original.status) ?? 0) - (STATUS_ORDER.get(b.original.status) ?? 0),
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'watchS',
    header: 'Watch time',
    cell: ({ row }) => <span className="tabular-nums">{formatDurationS(row.original.watchS)}</span>,
  },
  {
    accessorKey: 'nextAction',
    header: 'Next action',
    sortUndefined: 'last',
    cell: ({ row }) => row.original.nextAction ?? <span className="text-muted-foreground">None</span>,
  },
]

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function DealsTable({ deals, defaultAnalyst }: { deals: DealRowDto[]; defaultAnalyst: string }) {
  const navigate = useNavigate()
  const { analysts } = useCurrentAnalyst()
  const [search, setSearch] = useState('')
  const [analyst, setAnalyst] = useState(defaultAnalyst)
  const [country, setCountry] = useState(ALL)
  const [status, setStatus] = useState(ALL)
  const [sorting, setSorting] = useState<SortingState>([])
  const searchId = useId()

  const columnFilters = useMemo<ColumnFiltersState>(
    () =>
      [
        { id: 'analyst', value: analyst },
        { id: 'country', value: country },
        { id: 'status', value: status },
      ].filter((filter) => filter.value !== ALL),
    [analyst, country, status],
  )

  const countries = useMemo(() => [...new Set(deals.map((deal) => deal.country))].sort(), [deals])
  const analystOptions = useMemo(() => {
    const known = new Map(analysts.map((item) => [item.id, item.name]))
    for (const deal of deals) if (!known.has(deal.analystId)) known.set(deal.analystId, deal.analystName)
    return [...known].map(([id, name]) => ({ value: String(id), label: name })).sort((a, b) => a.label.localeCompare(b.label))
  }, [analysts, deals])

  // eslint-disable-next-line react-hooks/incompatible-library -- the app does not use the React Compiler
  const table = useReactTable({
    data: deals,
    columns,
    state: { columnFilters, globalFilter: search, sorting },
    onSortingChange: setSorting,
    globalFilterFn: companySearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows
  const filtered = search !== '' || columnFilters.length > 0
  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, id: number) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return
    void navigate(`/deals/${id}`)
  }

  return (
    <div className="grid gap-3">
      <div role="search" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={searchId} className="text-xs">
            Search
          </Label>
          <Input
            id={searchId}
            type="search"
            placeholder="Company name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-7 w-56"
          />
        </div>
        <FilterSelect
          label="Analyst"
          value={analyst}
          onChange={setAnalyst}
          options={[{ value: ALL, label: 'All analysts' }, ...analystOptions]}
        />
        <FilterSelect
          label="Country"
          value={country}
          onChange={setCountry}
          options={[
            { value: ALL, label: 'All countries' },
            ...countries.map((code) => ({ value: code, label: `${displayName('en-US', 'region', code)} (${code})` })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: ALL, label: 'All statuses' },
            ...DEAL_STATUSES.map((value) => ({ value, label: STATUS_META[value].label })),
          ]}
        />
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setAnalyst(ALL)
              setCountry(ALL)
              setStatus(ALL)
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {`${pluralize(rows.length, 'deal', 'deals')} of ${deals.length}`}
      </p>
      {rows.length === 0 ? (
        <EmptyState>{deals.length === 0 ? 'No deals with a video yet.' : 'No deals match the filters.'}</EmptyState>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <caption className="sr-only">Deals. Select a company name to open the deal page.</caption>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => {
                    const sorted = header.column.getIsSorted()
                    return (
                      <TableHead
                        key={header.id}
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
                <TableRow key={row.id} onClick={(event) => onRowClick(event, row.original.id)} className="cursor-pointer">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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
  const { analystId, loading } = useCurrentAnalyst()
  return (
    <>
      <PageHeader title="Deals" description="All deals with a video." />
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading the analysts.
        </p>
      ) : (
        <QueryState query={deals} label="the deals">
          {(data) => (
            <DealsTable key={analystId ?? ALL} deals={data} defaultAnalyst={analystId === null ? ALL : String(analystId)} />
          )}
        </QueryState>
      )}
    </>
  )
}
