'use client'

/**
 * InstrumentCombobox
 *
 * Search-and-pick combobox for adding instruments to a portfolio.
 *
 * Flow:
 *   1. User types ≥2 chars → debounced 250ms → POST /api/instruments/search
 *   2. Results render grouped by isin || name (groupSearchResults)
 *   3. User expands a group → picks a specific listing (no auto-pick)
 *   4. POST /api/instruments/resolve to obtain { id, meta }
 *   5. Emit onSelect({ instrument_id, ticker, name, exchange, currency,
 *      expense_ratio, dividend_yield }) so the parent can append a row AND
 *      extend its mergedMeta in the same handler.
 *
 * DataError surfacing (per Plan 04 CONTEXT):
 *   rate_limit    → toast.error('Search rate-limited; retry shortly')
 *   transient     → inline 'Search temporarily unavailable'
 *   not_found     → empty results (no UI banner)
 *   invalid_input → inline 'Invalid input'
 */

import * as React from 'react'
import { ChevronRight, ChevronDown, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

import { isDataError } from '@/lib/data/errors'
import type { SearchResult } from '@/lib/data/types'

import { groupSearchResults, type GroupedResult } from './group-search-results'

const DEBOUNCE_MS = 250
const MIN_QUERY_LEN = 2

export type SelectedInstrument = {
  instrument_id: string
  ticker: string
  name: string
  exchange: string
  currency: string
  expense_ratio: number | null
  dividend_yield: number | null
}

export type InstrumentComboboxProps = {
  /** instrument_ids already added to the form — filter them out so they cannot be re-picked. */
  excludeIds?: string[]
  /** Identifier strings of the form `${ticker}.${exchange}` for results-side dedupe before resolve. */
  excludeTickers?: string[]
  onSelect: (result: SelectedInstrument) => void
  disabled?: boolean
}

type ResolveResponse = {
  id: string
  meta: { expense_ratio: number | null; dividend_yield: number | null }
}

export function InstrumentCombobox({
  excludeTickers = [],
  onSelect,
  disabled,
}: InstrumentComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [resolving, setResolving] = React.useState(false)
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null)

  const abortRef = React.useRef<AbortController | null>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel pending fetches on unmount
  React.useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Debounced search effect
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setError(null)

    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([])
      setLoading(false)
      // Cancel any in-flight request when query becomes too short
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      return
    }

    debounceRef.current = setTimeout(() => {
      void runSearch(trimmed)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  async function runSearch(q: string) {
    // Abort any prior in-flight fetch
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    try {
      const r = await fetch('/api/instruments/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 20 }),
        signal: ac.signal,
      })
      const json = (await r.json()) as unknown

      if (isDataError(json)) {
        switch (json.kind) {
          case 'rate_limit':
            toast.error('Search rate-limited; retry shortly')
            setResults([])
            break
          case 'transient':
            setError('Search temporarily unavailable, try again')
            setResults([])
            break
          case 'invalid_input':
            setError('Invalid input')
            setResults([])
            break
          case 'not_found':
            setResults([]) // no error UI
            break
        }
        return
      }

      if (Array.isArray(json)) {
        setResults(json as SearchResult[])
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      setError('Search temporarily unavailable, try again')
      setResults([])
    } finally {
      // Only flip loading off if this controller is still the current one
      if (abortRef.current === ac) {
        setLoading(false)
      }
    }
  }

  async function handlePick(listing: SearchResult) {
    // Close the popover and clear search state IMMEDIATELY so the UI
    // doesn't stick on a stale query when the user opens the combobox
    // again. The async resolve continues in the background; on failure
    // we surface a toast — no need to keep the popover open while
    // /api/instruments/resolve resolves the canonical instrument id.
    setOpen(false)
    setQuery('')
    setResults([])
    setExpandedKey(null)

    setResolving(true)
    try {
      const r = await fetch('/api/instruments/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: listing.ticker,
          exchange: listing.exchange,
          name: listing.name || undefined,
          currency: listing.currency || undefined,
          type: listing.type || undefined,
          isin: listing.isin,
        }),
      })
      const json = (await r.json()) as unknown

      if (isDataError(json)) {
        switch (json.kind) {
          case 'rate_limit':
            toast.error('Service rate-limited; retry shortly')
            break
          case 'transient':
            toast.error('Could not resolve instrument; try again')
            break
          case 'invalid_input':
            toast.error('Invalid instrument data')
            break
          case 'not_found':
            toast.error('Instrument not found')
            break
        }
        return
      }

      const resolved = json as ResolveResponse
      onSelect({
        instrument_id: resolved.id,
        ticker: listing.ticker,
        name: listing.name || `${listing.ticker} (${listing.exchange})`,
        exchange: listing.exchange,
        currency: listing.currency,
        expense_ratio: resolved.meta.expense_ratio,
        dividend_yield: resolved.meta.dividend_yield,
      })
    } catch {
      toast.error('Could not resolve instrument; try again')
    } finally {
      setResolving(false)
    }
  }

  // Filter results before grouping so excluded listings disappear cleanly.
  const filtered = React.useMemo(() => {
    if (excludeTickers.length === 0) return results
    const ex = new Set(excludeTickers)
    return results.filter(r => !ex.has(`${r.ticker}.${r.exchange}`))
  }, [results, excludeTickers])

  const grouped: GroupedResult[] = React.useMemo(
    () => groupSearchResults(filtered),
    [filtered],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Add instrument"
            disabled={disabled}
          >
            <PlusIcon />
            Add instrument
          </Button>
        }
      />
      <PopoverContent
        className="w-[420px] p-0"
        align="start"
        sideOffset={6}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search ticker, name, or ISIN…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            {error ? (
              <div className="px-3 py-2 text-xs text-destructive">{error}</div>
            ) : null}

            {loading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Searching…
              </div>
            ) : null}

            {!loading && query.trim().length >= MIN_QUERY_LEN && grouped.length === 0 && !error ? (
              <CommandEmpty>No matches</CommandEmpty>
            ) : null}

            {!loading && query.trim().length < MIN_QUERY_LEN ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Type at least {MIN_QUERY_LEN} characters to search.
              </div>
            ) : null}

            {grouped.length > 0 ? (
              <CommandGroup>
                {grouped.map(group => {
                  const isExpanded = expandedKey === group.key
                  const hasMultipleListings = group.listings.length > 1
                  return (
                    <React.Fragment key={group.key}>
                      <CommandItem
                        value={group.key}
                        onSelect={() => {
                          if (hasMultipleListings) {
                            setExpandedKey(isExpanded ? null : group.key)
                          } else {
                            void handlePick(group.listings[0])
                          }
                        }}
                        disabled={resolving}
                      >
                        {hasMultipleListings ? (
                          isExpanded ? (
                            <ChevronDown className="size-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0" />
                          )
                        ) : (
                          <span className="size-3.5 shrink-0" />
                        )}
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {group.displayName}
                          </span>
                          {hasMultipleListings ? (
                            <span className="text-xs text-muted-foreground">
                              {group.listings.length} listings
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {group.listings[0].ticker}.{group.listings[0].exchange}
                              {group.listings[0].currency
                                ? ` · ${group.listings[0].currency}`
                                : ''}
                            </span>
                          )}
                        </div>
                      </CommandItem>

                      {isExpanded && hasMultipleListings
                        ? group.listings.map(listing => (
                            <CommandItem
                              key={`${listing.ticker}.${listing.exchange}`}
                              value={`${group.key}__${listing.ticker}.${listing.exchange}`}
                              onSelect={() => void handlePick(listing)}
                              disabled={resolving}
                              className="pl-8"
                            >
                              <div className="flex min-w-0 flex-col">
                                <span className="truncate text-sm">
                                  {listing.ticker}.{listing.exchange}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {listing.currency || '—'}
                                  {listing.type ? ` · ${listing.type}` : ''}
                                </span>
                              </div>
                            </CommandItem>
                          ))
                        : null}
                    </React.Fragment>
                  )
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
