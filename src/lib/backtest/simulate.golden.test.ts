/**
 * Golden-master integration test for src/lib/backtest/simulate.ts (Plan 05-02).
 *
 * Fixture: tests/fixtures/backtest/golden-portfolio.json — synthetic
 * 3-instrument CHF/USD/EUR portfolio with flat 1:1 FX and round-number
 * prices, hand-checked equity curve [10000, 10100, 10130, 10250, 10200],
 * totalReturn 0.02. DRIP off, rebalance none.
 *
 * Comparison precision: toBeCloseTo(_, 6) per the fixture's _note.
 *
 * See: 05-RESEARCH.md §Validation Architecture; 05-01-SUMMARY.md.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { simulate } from './simulate'
import { isBacktestError } from './errors'
import type { BacktestInput } from './types'

const fixturePath = resolve(__dirname, '../../../tests/fixtures/backtest/golden-portfolio.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  input: BacktestInput
  expected: {
    equity: { date: string; value: number }[]
    metrics: { totalReturn: number }
  }
}

describe('simulate golden fixture', () => {
  it('synthetic 3-instrument portfolio matches expected curve toBeCloseTo(_, 6)', () => {
    const result = simulate(fixture.input)
    if (isBacktestError(result)) {
      throw new Error(`simulate returned BacktestError: ${result.kind} — ${result.message}`)
    }
    expect(result.equity).toHaveLength(fixture.expected.equity.length)
    for (let i = 0; i < fixture.expected.equity.length; i++) {
      expect(result.equity[i].date).toBe(fixture.expected.equity[i].date)
      expect(result.equity[i].value).toBeCloseTo(fixture.expected.equity[i].value, 6)
    }
  })
})
