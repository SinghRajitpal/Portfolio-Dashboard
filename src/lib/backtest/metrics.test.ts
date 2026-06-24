/**
 * Stub reservations for src/lib/backtest/metrics.ts (Plan 05-02 / 05-03).
 * See: 05-RESEARCH.md §Validation Architecture.
 */
import { describe, it } from 'vitest'

describe('metrics (BACK-04)', () => {
  it.todo('Total return formula (end-start)/start')
  it.todo('CAGR exact-day basis (365.25 days basis)')
  it.todo('MDD sequence [100,120,90,110] returns -0.25 with peak=index1 trough=index2')
  it.todo('Sharpe with zero excess returns ≈ 0')
  it.todo('Volatility = stdev × sqrt(252)')
})
