'use client'

/**
 * CsvPreviewClient
 *
 * Hydrates from sessionStorage[`portfolioforge:csv-import:${csvKey}`] (written
 * by CsvImportDialog) and renders the CSV preview screen.
 *
 * Two-phase UX:
 *   1. While ANY row is ambiguous or unresolved, render an "X rows need
 *      attention" banner with per-row controls:
 *        - ambiguous   → <select> of alternatives (all venues from API)
 *        - unresolved  → <InstrumentCombobox> for search/replace
 *      The PortfolioBuilder is hidden during this phase.
 *   2. Once all rows are matched, render <PortfolioBuilder mode="preview"
 *      initialData={...} /> so the visual + validation surface is identical
 *      to the manual create flow. Save calls savePortfolio Server Action.
 *
 * Per CONTEXT-locked decision: NO auto-pick on ambiguity. The user MUST pick.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  PortfolioBuilder,
  type InstrumentMetaMap,
} from '@/components/portfolio/PortfolioBuilder'
import {
  InstrumentCombobox,
  type SelectedInstrument,
} from '@/components/portfolio/InstrumentCombobox'
import type { PortfolioInput } from '../_schema'
import { savePortfolio } from '../_actions'
import type {
  CsvResolution,
  CsvResolveAlternative,
} from '@/app/api/instruments/csv-resolve/route'
import { CSV_IMPORT_STORAGE_PREFIX } from './CsvImportDialog'

export type CsvPreviewClientProps = {
  csvKey: string
}

type StagedPayload = {
  resolved: CsvResolution[]
  parseErrors?: string[]
}

type ReadyRow = {
  ticker: string
  weight: number
  instrument: CsvResolveAlternative
}

const PREVIEW_DEFAULT_AMOUNT = 10_000

function isReady(r: CsvResolution): r is Extract<CsvResolution, { status: 'matched' }> {
  return r.status === 'matched'
}

export function CsvPreviewClient({ csvKey }: CsvPreviewClientProps) {
  const router = useRouter()

  const [hydrated, setHydrated] = React.useState(false)
  const [resolutions, setResolutions] = React.useState<CsvResolution[]>([])
  const [parseErrors, setParseErrors] = React.useState<string[]>([])
  const [missing, setMissing] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  // Hydrate once on mount; clear the key so re-mounts (or back navigation)
  // can't reuse stale CSV state.
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const storageKey = `${CSV_IMPORT_STORAGE_PREFIX}${csvKey}`
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(storageKey)
    } catch {
      raw = null
    }
    if (!raw) {
      setMissing(true)
      setHydrated(true)
      return
    }
    try {
      const parsed = JSON.parse(raw) as StagedPayload
      setResolutions(parsed.resolved ?? [])
      setParseErrors(parsed.parseErrors ?? [])
    } catch {
      setMissing(true)
    }
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      /* noop */
    }
    setHydrated(true)
  }, [csvKey])

  const setRowMatched = React.useCallback(
    (ticker: string, alt: CsvResolveAlternative) => {
      setResolutions((prev) =>
        prev.map((r) =>
          r.ticker === ticker
            ? {
                ticker: r.ticker,
                weight: r.weight,
                status: 'matched',
                instrument: alt,
              }
            : r,
        ),
      )
    },
    [],
  )

  const handleAmbiguousPick = React.useCallback(
    (ticker: string, altId: string, alternatives: CsvResolveAlternative[]) => {
      const alt = alternatives.find((a) => a.id === altId)
      if (alt) setRowMatched(ticker, alt)
    },
    [setRowMatched],
  )

  const handleUnresolvedPick = React.useCallback(
    (ticker: string, sel: SelectedInstrument) => {
      // Convert SelectedInstrument (combobox payload) into the same
      // CsvResolveAlternative shape used by ambiguous rows.
      setRowMatched(ticker, {
        id: sel.instrument_id,
        ticker: sel.ticker,
        name: sel.name,
        exchange: sel.exchange || null,
        currency: sel.currency,
        expense_ratio: sel.expense_ratio,
        dividend_yield: sel.dividend_yield,
        isin: null,
        type: 'etf',
      })
    },
    [setRowMatched],
  )

  const needsAttention = React.useMemo(
    () => resolutions.filter((r) => r.status !== 'matched'),
    [resolutions],
  )

  const readyRows: ReadyRow[] = React.useMemo(
    () =>
      resolutions.filter(isReady).map((r) => ({
        ticker: r.ticker,
        weight: r.weight,
        instrument: r.instrument,
      })),
    [resolutions],
  )

  const allReady = needsAttention.length === 0 && readyRows.length > 0

  const initialData: PortfolioInput | undefined = React.useMemo(() => {
    if (!allReady) return undefined
    return {
      name: '',
      investment_amount: PREVIEW_DEFAULT_AMOUNT,
      items: readyRows.map((r) => ({
        instrument_id: r.instrument.id,
        ticker: r.instrument.ticker,
        name: r.instrument.name,
        weight: r.weight,
      })),
    }
  }, [allReady, readyRows])

  const instrumentsMeta: InstrumentMetaMap = React.useMemo(() => {
    const map: InstrumentMetaMap = {}
    for (const r of readyRows) {
      map[r.instrument.id] = {
        expense_ratio: r.instrument.expense_ratio,
        dividend_yield: r.instrument.dividend_yield,
      }
    }
    return map
  }, [readyRows])

  const handleSubmit = React.useCallback(
    async (data: PortfolioInput) => {
      setErrorMessage(null)
      await new Promise<void>((resolve) => {
        startTransition(async () => {
          const fd = new FormData()
          fd.append('payload', JSON.stringify(data))
          const r = await savePortfolio(null, fd)
          if (r.ok) {
            toast.success('Portfolio created')
            router.push('/dashboard/portfolios')
          } else {
            setErrorMessage(r.error)
            toast.error(r.error)
          }
          resolve()
        })
      })
    },
    [router],
  )

  const handleCancelImport = React.useCallback(() => {
    router.push('/dashboard/portfolios')
  }, [router])

  if (!hydrated) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading CSV preview…
      </div>
    )
  }

  if (missing || resolutions.length === 0) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          CSV preview state is missing or expired. Restart the import.
        </p>
        <Button type="button" variant="outline" onClick={handleCancelImport}>
          Back to portfolios
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-medium tracking-tight">
          Review imported portfolio
        </h1>
        <p className="text-xs text-muted-foreground">
          Investment amount defaults to CHF 10&rsquo;000 — change before saving.
        </p>
      </header>

      {parseErrors.length > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <p className="mb-1 font-medium">CSV parse errors:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {parseErrors.slice(0, 6).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {parseErrors.length > 6 ? (
              <li>…and {parseErrors.length - 6} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {needsAttention.length > 0 ? (
        <section
          aria-label="Rows needing attention"
          className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4"
        >
          <p className="text-sm font-medium">
            {needsAttention.length} row
            {needsAttention.length === 1 ? '' : 's'} need
            {needsAttention.length === 1 ? 's' : ''} attention before save.
          </p>
          <ul className="space-y-3">
            {needsAttention.map((r) => (
              <li
                key={r.ticker}
                className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm">{r.ticker}</p>
                  <p className="text-xs text-muted-foreground">
                    Weight {r.weight}%
                    {r.status === 'ambiguous'
                      ? ' · multiple listings — pick one'
                      : ' · no match — search a replacement'}
                  </p>
                </div>
                <div className="sm:w-72">
                  {r.status === 'ambiguous' ? (
                    <Select
                      onValueChange={(value) =>
                        handleAmbiguousPick(
                          r.ticker,
                          String(value),
                          r.alternatives,
                        )
                      }
                    >
                      <SelectTrigger
                        aria-label={`Pick listing for ${r.ticker}`}
                      >
                        <SelectValue placeholder="Choose a listing" />
                      </SelectTrigger>
                      <SelectContent>
                        {r.alternatives.map((alt) => (
                          <SelectItem key={alt.id} value={alt.id}>
                            {alt.exchange ?? '—'}
                            {alt.currency ? ` (${alt.currency})` : ''}
                            {alt.name ? ` · ${alt.name}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <InstrumentCombobox
                      onSelect={(sel) =>
                        handleUnresolvedPick(r.ticker, sel)
                      }
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {allReady && initialData ? (
        <PortfolioBuilder
          mode="preview"
          initialData={initialData}
          instrumentsMeta={instrumentsMeta}
          onSubmit={handleSubmit}
          onCancel={handleCancelImport}
          saving={isPending}
          errorMessage={errorMessage}
          submitLabel="Save imported portfolio"
        />
      ) : (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={handleCancelImport}>
            Cancel import
          </Button>
        </div>
      )}
    </div>
  )
}
