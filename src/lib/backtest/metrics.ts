/**
 * Pure metrics: Total Return, CAGR, Max Drawdown, Sharpe (SNB-based), Vol.
 *
 * Locked conventions (CONTEXT D-18..D-21):
 *   D-18 Total Return = (end − start) / start; CAGR exact-day basis using 365.25.
 *   D-19 Sharpe = mean(excess) / stdev(excess) × √252, where excess uses the
 *        SNB daily rate derived from the most recent ≤ equity_date_month
 *        snb_rates row (stitched LZ + libor_mid handled upstream in Plan 03).
 *   D-20 Volatility = stdev(daily returns) × √252 on a trading-days basis.
 *   D-21 Max Drawdown = min((value − running_max) / running_max). The peak
 *        date is the running_max-achieving date AT THE TIME the min is hit
 *        (not the global peak). Trough is the value-achieving date.
 *
 * No rounding — display formatting is the caller's job (mirrors
 * src/lib/portfolio/compute-metrics.ts contract).
 * No external deps — population stdev computed inline per RESEARCH
 * "Don't Hand-Roll" §Statistics.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-18..D-21)
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md Pitfalls 1, 8
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §metrics.ts
 */
import type { BacktestMetrics, EquityPoint, SnbRateRow } from './types'

const TRADING_DAYS_PER_YEAR = 252
const CALENDAR_DAYS_PER_YEAR = 365.25
const MS_PER_DAY = 86400000

/**
 * Compute the 5 backtest metrics from an equity curve and an SNB rate series.
 *
 * Defensive behavior on degenerate inputs:
 *   - equity.length < 2 → all returns/vol/sharpe = 0; drawdown = 0 with both
 *     dates = first equity date (or empty string if equity is empty).
 *   - start value ≤ 0 → totalReturn = NaN, cagr = NaN (callers must validate).
 *   - stdev = 0 (flat curve or excess === 0) → sharpe = 0 (D-19 NaN-guard).
 */
export function computeMetrics(args: {
  equity: EquityPoint[]
  snbRates: SnbRateRow[]
  startDate: string
  endDate: string
}): BacktestMetrics {
  const { equity, snbRates, startDate, endDate } = args

  // ── Total return + CAGR ────────────────────────────────────────────────────
  if (equity.length === 0) {
    return {
      totalReturn: 0,
      cagr: 0,
      maxDrawdown: 0,
      mddPeakDate: '',
      mddTroughDate: '',
      sharpe: 0,
      vol: 0,
    }
  }

  const startValue = equity[0].value
  const endValue = equity[equity.length - 1].value
  const totalReturn = startValue > 0 ? (endValue - startValue) / startValue : NaN

  // Exact calendar-day basis per D-18.
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / MS_PER_DAY
  const cagr =
    startValue > 0 && days > 0
      ? Math.pow(endValue / startValue, CALENDAR_DAYS_PER_YEAR / days) - 1
      : NaN

  // ── Max Drawdown (D-21) ────────────────────────────────────────────────────
  let runningMax = equity[0].value
  let runningMaxDate = equity[0].date
  let maxDrawdown = 0
  let mddPeakDate = equity[0].date
  let mddTroughDate = equity[0].date
  for (const pt of equity) {
    if (pt.value > runningMax) {
      runningMax = pt.value
      runningMaxDate = pt.date
    }
    if (runningMax > 0) {
      const dd = (pt.value - runningMax) / runningMax
      if (dd < maxDrawdown) {
        maxDrawdown = dd
        mddPeakDate = runningMaxDate
        mddTroughDate = pt.date
      }
    }
  }

  // ── Daily returns ──────────────────────────────────────────────────────────
  const dailyReturns: number[] = []
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].value
    if (prev > 0) dailyReturns.push(equity[i].value / prev - 1)
    else dailyReturns.push(0)
  }

  // ── Volatility (D-20) — population stdev × √252 ───────────────────────────
  const vol = dailyReturns.length === 0 ? 0 : populationStdev(dailyReturns) * Math.sqrt(TRADING_DAYS_PER_YEAR)

  // ── Sharpe (D-19) — uses SNB daily rate per equity-month lookup ───────────
  let sharpe = 0
  if (dailyReturns.length > 0) {
    // Sort SNB rates by date_month so the lookback step is monotonic.
    const sortedSnb = [...snbRates].sort((a, b) => a.date_month.localeCompare(b.date_month))
    const excess: number[] = []
    for (let i = 0; i < dailyReturns.length; i++) {
      const equityDate = equity[i + 1].date // matches dailyReturns[i]
      const month = equityDate.slice(0, 7) // 'YYYY-MM'
      const snbAnnual = findMostRecentSnb(sortedSnb, month)
      const snbDaily = Math.pow(1 + snbAnnual, 1 / TRADING_DAYS_PER_YEAR) - 1
      excess.push(dailyReturns[i] - snbDaily)
    }
    const excessStdev = populationStdev(excess)
    if (excessStdev > 0) {
      sharpe = (mean(excess) / excessStdev) * Math.sqrt(TRADING_DAYS_PER_YEAR)
    } else {
      sharpe = 0 // D-19 NaN-guard
    }
  }

  return {
    totalReturn,
    cagr,
    maxDrawdown,
    mddPeakDate,
    mddTroughDate,
    sharpe,
    vol,
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

function populationStdev(xs: number[]): number {
  if (xs.length === 0) return 0
  const m = mean(xs)
  let sq = 0
  for (const x of xs) {
    const d = x - m
    sq += d * d
  }
  return Math.sqrt(sq / xs.length)
}

/**
 * Find the most recent snb_rate row whose date_month is ≤ `month`. Returns 0
 * if no row qualifies (callers see Sharpe-near-zero rather than NaN). Plan 03
 * stitches LZ + libor_mid upstream so the engine sees a single contiguous
 * series; this lookup just handles the "use most-recent published" rule.
 */
function findMostRecentSnb(sortedSnb: SnbRateRow[], month: string): number {
  let chosen = 0
  for (const row of sortedSnb) {
    if (row.date_month <= month) chosen = row.rate
    else break
  }
  return chosen
}
