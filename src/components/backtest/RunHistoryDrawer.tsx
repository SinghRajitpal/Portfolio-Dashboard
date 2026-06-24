'use client'

/**
 * RunHistoryDrawer — Task 3 stub. Filled in by Plan 05-06 Task 3.
 * Exports the symbol so BacktestClient typechecks at Task 2 verify.
 */
import type { BacktestPortfolioRow } from '@/app/dashboard/backtest/_queries'

export type RunHistoryDrawerProps = {
  portfolioId: string | null
  currentRunId: string | null
  portfolios: BacktestPortfolioRow[]
  open: boolean
  onOpenChange: (next: boolean) => void
  onSelectRun: (id: string) => void
  refreshKey: number
}

export function RunHistoryDrawer(_props: RunHistoryDrawerProps) {
  return null
}
