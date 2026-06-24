'use client'

/**
 * BacktestClient — top-level client orchestrator for /dashboard/backtest.
 *
 * Owns the state machine (per CONTEXT D-02, D-08, D-09):
 *   idle → fetching → running → done
 *           ↑         ↑      ↓
 *           └─ heavy ─┘      └─ cheap (worker only)
 *
 * Heavy params (trigger /api/backtest/data refetch + worker restart):
 *   portfolio_id, start, end, benchmark_ticker
 *
 *   Note: benchmark_ticker is classified as heavy because the batch-data
 *   endpoint only includes the benchmark's instrument when explicitly
 *   asked for it (verified against `src/app/api/backtest/data/route.ts`
 *   lines 145-187 — only the requested benchmark is added to allIds).
 *   Switching benchmarks requires fresh data.
 *
 * Cheap params (worker rerun on cached batchData; no network round-trip):
 *   drip, rebalance
 *
 * After the worker resolves on a fresh run, the result is POSTed to
 * /api/backtest/runs and the row id is captured. Identical-input POSTs
 * dedup server-side (the route returns { id, deduped: true }) so toggling
 * back-and-forth doesn't bloat the runs table.
 *
 * loadHistoricalRun(runId): fetches /api/backtest/runs/[id] and seeds the
 * UI state from the cached result. Sets `isStale` if the server flagged it.
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-01, D-02, D-03, D-08, D-09)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §BacktestClient
 */
import * as React from 'react'
import { toast } from 'sonner'

import { BacktestResults } from '@/components/backtest/BacktestResults'
import { BacktestSetupBar } from '@/components/backtest/BacktestSetupBar'
import { RunHistoryDrawer } from '@/components/backtest/RunHistoryDrawer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBacktestWorker } from '@/lib/backtest/use-backtest-worker'
import type {
  BacktestOutput,
  BacktestParams,
  RebalanceFrequency,
} from '@/lib/backtest/types'

import type { BacktestPortfolioRow, BenchmarkOption } from './_queries'

export type BacktestClientProps = {
  portfolios: BacktestPortfolioRow[]
  benchmarks: BenchmarkOption[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date()
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function tenYearsAgoIso(): string {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - 10)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Earliest-allowed-start per CONTEXT D-03: the LATEST first_date across the
 *  portfolio's instruments — the youngest instrument constrains the run. */
function computeEarliestAllowedStart(
  portfolio: BacktestPortfolioRow | undefined,
): { date: string | null; ticker: string | null } {
  if (!portfolio || portfolio.instruments.length === 0) {
    return { date: null, ticker: null }
  }
  let best: { date: string; ticker: string } | null = null
  for (const inst of portfolio.instruments) {
    if (!inst.first_date) continue
    if (!best || inst.first_date > best.date) {
      best = { date: inst.first_date, ticker: inst.ticker }
    }
  }
  return { date: best?.date ?? null, ticker: best?.ticker ?? null }
}

function defaultParams(
  portfolio: BacktestPortfolioRow | undefined,
): BacktestParams {
  const earliest = computeEarliestAllowedStart(portfolio)
  const today = todayIso()
  const tenYearsBack = tenYearsAgoIso()
  const start =
    earliest.date && earliest.date > tenYearsBack ? earliest.date : tenYearsBack
  const rebalance: RebalanceFrequency = 'annual'
  return {
    portfolio_id: portfolio?.id ?? '',
    start,
    end: today,
    drip: false,
    rebalance,
    benchmark_ticker: null,
  }
}

// ── Batch data response shape (mirrors api/backtest/data/route.ts) ───────────

type BatchDataResponse = {
  items: Array<{
    id: string
    ticker: string
    currency: string
    weight: number
    first_date: string | null
  }>
  benchmark: {
    id: string
    ticker: string
    currency: string
    weight: number
    first_date: string | null
  } | null
  prices: Array<{
    instrument_id: string
    date: string
    adjusted_close: number
    close: number
  }>
  dividends: Array<{
    instrument_id: string
    ex_date: string
    amount: number
    currency: string
  }>
  fxRates: Array<{ quote_currency: string; date: string; rate: number }>
  snbRates: Array<{ date_month: string; rate: number; source: 'LZ' | 'libor_mid' }>
  pricesVersion: number
  investmentAmount: number
}

type DataErrorEnvelope = { kind: string; message: string }

function looksLikeDataError(v: unknown): v is DataErrorEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    'kind' in v &&
    typeof (v as { kind: unknown }).kind === 'string' &&
    'message' in v &&
    typeof (v as { message: unknown }).message === 'string'
  )
}

// Heavy/cheap discrimination —
function isHeavyChange(prev: BacktestParams, next: BacktestParams): boolean {
  return (
    prev.portfolio_id !== next.portfolio_id ||
    prev.start !== next.start ||
    prev.end !== next.end ||
    prev.benchmark_ticker !== next.benchmark_ticker
  )
}

function isCheapChange(prev: BacktestParams, next: BacktestParams): boolean {
  return (
    !isHeavyChange(prev, next) &&
    (prev.drip !== next.drip || prev.rebalance !== next.rebalance)
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export function BacktestClient({ portfolios, benchmarks }: BacktestClientProps) {
  const [params, setParams] = React.useState<BacktestParams>(() =>
    defaultParams(portfolios[0]),
  )
  const [batchData, setBatchData] = React.useState<BatchDataResponse | null>(null)
  const [output, setOutput] = React.useState<BacktestOutput | null>(null)
  const [runId, setRunId] = React.useState<string | null>(null)
  const [isStale, setIsStale] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  // History list refresh nonce — bumped after a successful run write.
  const [historyVersion, setHistoryVersion] = React.useState(0)

  // Tracks the params for which batchData was fetched. Used to decide whether
  // the next change can ride the cached payload (cheap) or needs a refetch.
  const lastHeavyParamsRef = React.useRef<BacktestParams | null>(null)
  // Tracks the AbortController for the in-flight fetch so heavy-param changes
  // mid-flight cancel the previous request cleanly.
  const fetchAbortRef = React.useRef<AbortController | null>(null)
  // Suppress effect-driven runs when we just hydrated state from a historical
  // run row (which already contains the result — no recompute needed).
  const suppressNextRunRef = React.useRef(false)

  const { run, terminate, isRunning } = useBacktestWorker()

  const selectedPortfolio = React.useMemo(
    () => portfolios.find((p) => p.id === params.portfolio_id) ?? null,
    [portfolios, params.portfolio_id],
  )
  const earliest = React.useMemo(
    () =>
      computeEarliestAllowedStart(
        selectedPortfolio ?? portfolios[0] ?? undefined,
      ),
    [selectedPortfolio, portfolios],
  )
  const investmentAmount = selectedPortfolio?.investment_amount ?? 0

  // ── Side-effects ─────────────────────────────────────────────────────────

  const fetchBatchData = React.useCallback(
    async (forParams: BacktestParams): Promise<BatchDataResponse | null> => {
      // Cancel any prior in-flight fetch.
      fetchAbortRef.current?.abort()
      const controller = new AbortController()
      fetchAbortRef.current = controller
      try {
        const res = await fetch('/api/backtest/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portfolio_id: forParams.portfolio_id,
            benchmark_ticker: forParams.benchmark_ticker,
            start: forParams.start,
            end: forParams.end,
          }),
          signal: controller.signal,
        })
        const json: unknown = await res.json()
        if (!res.ok) {
          if (looksLikeDataError(json)) {
            toast.error(`Data fetch failed: ${json.message}`)
          } else {
            toast.error(`Data fetch failed (HTTP ${res.status})`)
          }
          return null
        }
        return json as BatchDataResponse
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return null
        const message = err instanceof Error ? err.message : 'Network error'
        toast.error(`Data fetch failed: ${message}`)
        return null
      } finally {
        if (fetchAbortRef.current === controller) {
          fetchAbortRef.current = null
        }
      }
    },
    [],
  )

  const writeRun = React.useCallback(
    async (
      forParams: BacktestParams,
      pricesVersion: number,
      out: BacktestOutput,
      inputsHash: string,
    ): Promise<string | null> => {
      try {
        const res = await fetch('/api/backtest/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            portfolio_id: forParams.portfolio_id,
            params: forParams,
            inputsHash,
            pricesVersion,
            output: out,
          }),
        })
        const json: unknown = await res.json()
        if (!res.ok) {
          if (looksLikeDataError(json)) {
            toast.error(`Run write failed: ${json.message}`)
          } else {
            toast.error(`Run write failed (HTTP ${res.status})`)
          }
          return null
        }
        const body = json as { id: string; deduped: boolean }
        return body.id
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error'
        toast.error(`Run write failed: ${message}`)
        return null
      }
    },
    [],
  )

  const runSimulation = React.useCallback(
    async (forParams: BacktestParams, data: BatchDataResponse) => {
      try {
        const { result, inputsHash } = await run({
          ...forParams,
          instruments: data.items,
          prices: data.prices,
          dividends: data.dividends,
          fxRates: data.fxRates,
          snbRates: data.snbRates,
          investmentAmount: data.investmentAmount,
        })
        setOutput(result)
        setIsStale(false)
        const newId = await writeRun(
          forParams,
          data.pricesVersion,
          result,
          inputsHash,
        )
        if (newId) {
          setRunId(newId)
          setHistoryVersion((v) => v + 1)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Worker error'
        toast.error(`Backtest failed: ${message}`)
      }
    },
    [run, writeRun],
  )

  // Heavy-param effect: refetch batch data + rerun worker.
  React.useEffect(() => {
    if (!params.portfolio_id) return
    if (suppressNextRunRef.current) {
      suppressNextRunRef.current = false
      // Treat the just-hydrated params as the new "heavy" baseline so the
      // next genuine cheap-param change rides the cache (but since we have
      // no cache after a history load, it will fall through to heavy and
      // refetch — which is correct).
      lastHeavyParamsRef.current = params
      return
    }

    const prev = lastHeavyParamsRef.current
    const isHeavy = prev === null || isHeavyChange(prev, params)
    if (!isHeavy) return // cheap-param effect handles it

    let cancelled = false
    setIsLoading(true)
    setOutput(null)
    void (async () => {
      const data = await fetchBatchData(params)
      if (cancelled) return
      if (!data) {
        setIsLoading(false)
        return
      }
      setBatchData(data)
      lastHeavyParamsRef.current = params
      await runSimulation(params, data)
      if (!cancelled) setIsLoading(false)
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params.portfolio_id,
    params.start,
    params.end,
    params.benchmark_ticker,
  ])

  // Cheap-param effect: worker rerun on cached batchData (no network).
  React.useEffect(() => {
    if (!batchData) return
    if (suppressNextRunRef.current) return
    const prev = lastHeavyParamsRef.current
    if (!prev) return
    if (!isCheapChange(prev, params)) return
    // Reuse cached batch data.
    setIsLoading(true)
    void (async () => {
      await runSimulation(params, batchData)
      // Update the "last heavy params" snapshot to absorb the cheap-param edit
      // so subsequent identical changes don't retrigger.
      lastHeavyParamsRef.current = params
      setIsLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.drip, params.rebalance])

  // Unmount cleanup.
  React.useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort()
      terminate()
    }
  }, [terminate])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleParamsChange = React.useCallback((next: BacktestParams) => {
    setParams(next)
  }, [])

  const handleRun = React.useCallback(() => {
    // Force-heavy: clear the heavy-params ref so the next effect tick refetches
    // even if params didn't change. This is the explicit "I want fresh data"
    // user gesture.
    lastHeavyParamsRef.current = null
    setParams((p) => ({ ...p })) // create a new reference to retrigger effects
  }, [])

  const handleRecompute = React.useCallback(() => {
    setIsStale(false)
    handleRun()
  }, [handleRun])

  const loadHistoricalRun = React.useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/backtest/runs/${id}`)
        const json: unknown = await res.json()
        if (!res.ok) {
          if (looksLikeDataError(json)) {
            toast.error(`Load run failed: ${json.message}`)
          } else {
            toast.error(`Load run failed (HTTP ${res.status})`)
          }
          return
        }
        type HistoricalRow = {
          id: string
          params_json: BacktestParams
          equity_curve_json: BacktestOutput['equity']
          annual_bars_json: BacktestOutput['annualBars']
          metrics_json: BacktestOutput['metrics']
          warnings_json: BacktestOutput['warnings']
          prices_version: number
          stale: boolean
        }
        const row = json as HistoricalRow
        const reconstructed: BacktestOutput = {
          equity: row.equity_curve_json,
          // Server doesn't store benchmarkEquity separately; we lose the
          // overlay until a fresh run. This is acceptable for v1 — the
          // critical metrics + warnings + portfolio curve are all preserved.
          benchmarkEquity: null,
          annualBars: row.annual_bars_json,
          metrics: row.metrics_json,
          warnings: row.warnings_json,
          pricesVersion: row.prices_version,
        }
        suppressNextRunRef.current = true
        setOutput(reconstructed)
        setRunId(row.id)
        setIsStale(row.stale)
        // Seed params from the stored row so the setup bar reflects the
        // historical inputs.
        setParams(row.params_json)
        // Wipe cached batchData — the historical run's window may differ
        // from the current cache.
        setBatchData(null)
        lastHeavyParamsRef.current = row.params_json
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error'
        toast.error(`Load run failed: ${message}`)
      }
    },
    [],
  )

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <BacktestSetupBar
          value={params}
          onChange={handleParamsChange}
          onRun={handleRun}
          portfolios={portfolios}
          benchmarks={benchmarks}
          isLoading={isLoading || isRunning}
          earliestAllowedStart={earliest.date}
          earliestConstrainingTicker={earliest.ticker}
          className="flex-1"
        />
        <Button
          variant="outline"
          onClick={() => setHistoryOpen(true)}
          aria-label="Open run history"
          className="mt-7 shrink-0"
        >
          History
        </Button>
      </div>

      {output ? (
        <BacktestResults
          output={output}
          params={params}
          isStale={isStale}
          onRecompute={handleRecompute}
          investmentAmount={investmentAmount}
          portfolio={selectedPortfolio}
        />
      ) : isLoading || isRunning ? (
        <div className="space-y-4">
          <Skeleton className="h-[360px] w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      ) : null}

      <RunHistoryDrawer
        portfolioId={params.portfolio_id || null}
        currentRunId={runId}
        portfolios={portfolios}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onSelectRun={(id) => {
          void loadHistoricalRun(id)
        }}
        refreshKey={historyVersion}
      />
    </div>
  )
}
