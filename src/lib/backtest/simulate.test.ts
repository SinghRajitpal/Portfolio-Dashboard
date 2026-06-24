/**
 * Stub reservations for src/lib/backtest/simulate.ts (Plan 05-02).
 *
 * `it.todo` keeps the vitest runner green while reserving the canonical test
 * names called out in 05-RESEARCH.md §Validation Architecture. Plan 05-02
 * implements simulate.ts and replaces these stubs with real assertions.
 */
import { describe, it } from 'vitest'

describe('simulate (BACK-01, BACK-02, BACK-03)', () => {
  it.todo('FX point-in-time vs spot-rate diverges in known window')
  it.todo('DRIP on vs off produces different curve')
  it.todo('rebalance boundary fires Jan 1 falling on Saturday case (2022-01-03)')
  it.todo('rebalance cadence quarterly fires 4 events in 12-month window')
  it.todo('rebalance cadence none fires 0 events after initial allocation')
  it.todo('forward-fill increments warning count')
  it.todo('no overlap returns BacktestError')
})
