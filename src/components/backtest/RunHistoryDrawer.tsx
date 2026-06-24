'use client'

/**
 * RunHistoryDrawer — Dialog-based right-side drawer listing prior runs.
 *
 * CONTEXT D-05: right-side drawer triggered from the setup bar area; lists
 * prior runs newest-first; clicking a row reloads its inputs+result into
 * the BacktestClient and closes the drawer.
 *
 * CONTEXT D-09 stale-on-view: the actual stale flag is computed by the
 * /api/backtest/runs/[id] endpoint when the user opens a specific run.
 * The list view here just shows the cached metric + relative timestamp.
 *
 * Implementation note (PATTERNS.md §RunHistoryDrawer trade-off): the
 * codebase ships a shadcn Dialog primitive (centered modal) but not a
 * dedicated Sheet/Drawer. We adopt Dialog with right-anchored Tailwind
 * positioning to approximate a right-side sheet — the visual affordance
 * is reasonable for v1, and switching to a true Sheet later is a CSS-only
 * change.
 *
 * Cite:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-05, D-09)
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §RunHistoryDrawer
 *   - src/app/dashboard/portfolios/_client/PortfoliosListClient.tsx (formatRelative pattern)
 */
import * as React from 'react'
import { toast } from 'sonner'

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { BacktestParams, BacktestMetrics } from '@/lib/backtest/types'

import type { BacktestPortfolioRow } from '@/app/dashboard/backtest/_queries'

// ── Relative-time formatter — copied verbatim from PortfoliosListClient ─────

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const now = Date.now()
  const diffMs = then - now
  const diffSec = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const abs = Math.abs(diffSec)
  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 86400 * 365)
    return rtf.format(Math.round(diffSec / (86400 * 30)), 'month')
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year')
}

const pctFmt = new Intl.NumberFormat('de-CH', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatPct(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return pctFmt.format(v)
}

// ── Wire-format from GET /api/backtest/runs ─────────────────────────────────

type RunListItem = {
  id: string
  portfolio_id: string
  params_json: BacktestParams
  metrics_json: BacktestMetrics
  prices_version: number | string
  computed_at: string
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

// ── Component ───────────────────────────────────────────────────────────────

export type RunHistoryDrawerProps = {
  portfolioId: string | null
  currentRunId: string | null
  portfolios: BacktestPortfolioRow[]
  open: boolean
  onOpenChange: (next: boolean) => void
  onSelectRun: (id: string) => void
  /** Bumped by the parent after a successful run write to force a refetch. */
  refreshKey: number
}

export function RunHistoryDrawer({
  portfolioId,
  currentRunId,
  portfolios,
  open,
  onOpenChange,
  onSelectRun,
  refreshKey,
}: RunHistoryDrawerProps) {
  const [runs, setRuns] = React.useState<RunListItem[]>([])
  const [isLoading, setIsLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setIsLoading(true)
    void (async () => {
      try {
        const url = portfolioId
          ? `/api/backtest/runs?portfolio_id=${encodeURIComponent(portfolioId)}`
          : '/api/backtest/runs'
        const res = await fetch(url, { signal: controller.signal })
        const json: unknown = await res.json()
        if (!res.ok) {
          if (looksLikeDataError(json)) {
            toast.error(`Load history failed: ${json.message}`)
          } else {
            toast.error(`Load history failed (HTTP ${res.status})`)
          }
          setRuns([])
          return
        }
        setRuns((json as RunListItem[]) ?? [])
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return
        const message = err instanceof Error ? err.message : 'Network error'
        toast.error(`Load history failed: ${message}`)
        setRuns([])
      } finally {
        setIsLoading(false)
      }
    })()
    return () => {
      controller.abort()
    }
  }, [open, portfolioId, refreshKey])

  const portfolioLookup = React.useMemo(() => {
    const map = new Map<string, BacktestPortfolioRow>()
    for (const p of portfolios) map.set(p.id, p)
    return map
  }, [portfolios])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          // Override the default centered-modal positioning with a right-anchored
          // panel. Trade-off documented in the file-level comment.
          'fixed inset-y-0 right-0 left-auto top-0 z-50 m-0 grid h-full w-full max-w-md',
          'translate-x-0 translate-y-0 rounded-none rounded-l-xl border-l',
          'data-open:slide-in-from-right-4 data-closed:slide-out-to-right-4',
        )}
      >
        <div className="flex flex-col gap-3 overflow-y-auto pt-2">
          <h2 className="text-base font-medium">Run history</h2>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No prior runs for this portfolio.
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {runs.map((r) => {
                const isCurrent = r.id === currentRunId
                const portfolioName =
                  portfolioLookup.get(r.portfolio_id)?.name ?? '—'
                return (
                  <li
                    key={r.id}
                    className={cn(
                      'group relative grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-3 px-2 py-3 text-sm transition-colors hover:bg-muted/40',
                      isCurrent && 'bg-muted/40',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectRun(r.id)
                        onOpenChange(false)
                      }}
                      aria-label={`Load run from ${formatRelative(r.computed_at)}`}
                      className="absolute inset-0 z-0 rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                    />
                    <span className="pointer-events-none relative z-10 min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {portfolioName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground tabular-nums">
                        {r.params_json.start} → {r.params_json.end}
                      </span>
                    </span>
                    <span
                      className="pointer-events-none relative z-10 text-muted-foreground tabular-nums"
                      title="Total return"
                    >
                      {formatPct(r.metrics_json.totalReturn)}
                    </span>
                    <span className="pointer-events-none relative z-10 text-xs text-muted-foreground">
                      {formatRelative(r.computed_at)}
                    </span>
                    <span className="pointer-events-none relative z-10 text-xs">
                      {isCurrent ? (
                        <span className="rounded bg-foreground/10 px-1.5 py-0.5">
                          current
                        </span>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
