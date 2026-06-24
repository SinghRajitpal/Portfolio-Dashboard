/**
 * Pure backtest simulation core.
 *
 * Implements the deterministic loop the Web Worker runs. No DOM, no network,
 * no Next.js / Supabase imports — same inputs always produce same outputs.
 *
 * Locked conventions (CONTEXT D-13..D-23):
 *   D-13  Date grid = union of all instruments' trading days + FX days
 *         (delegated to buildUnionDateGrid).
 *   D-14  Missing data → forward-fill last close; per-instrument fillCount
 *         surfaced as BacktestWarning kind='forward_fill'.
 *   D-15  DRIP reinvests dividends on ex_date into the paying instrument at
 *         adjusted_close on that date. DRIP=false drops the dividend
 *         (cash sleeve = zero per v1 CONTEXT).
 *   D-16  Rebalance fires on the first trading day on/after the calendar
 *         boundary (Jan 1 / Apr 1 / Jul 1 / Oct 1), not on the boundary
 *         itself when it falls on a weekend or holiday.
 *   D-23  Benchmark is just another instrument — runs as a parallel
 *         1-instrument sub-portfolio (no special-case branch).
 *
 * Error paths (BacktestError):
 *   - no_overlap: every instrument's first_date is later than endDate, OR
 *     the truncated start (Pitfall 3) leaves no grid days.
 *
 * See:
 *   - .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-13..D-23)
 *   - .planning/phases/05-backtesting-engine/05-RESEARCH.md
 *     §Architecture Patterns + §Pitfalls 3, 4, 5, 7
 *   - .planning/phases/05-backtesting-engine/05-PATTERNS.md §simulate.ts
 */
import type {
  AnnualBar,
  BacktestInput,
  BacktestWarning,
  DividendRow,
  EquityPoint,
  FxRateRow,
  InstrumentInput,
  PriceRow,
  RebalanceFrequency,
} from './types'
import type { BacktestError } from './errors'
import { buildUnionDateGrid } from './date-grid'
import { forwardFillSeries } from './forward-fill'

const MS_PER_DAY = 86400000
const FX_LOOKBACK_DAYS = 4 // Pitfall 5: Friday → Sun + 3-day holiday weekend

type SimulateResult = {
  equity: EquityPoint[]
  benchmarkEquity: EquityPoint[] | null
  annualBars: AnnualBar[]
  warnings: BacktestWarning[]
}

export function simulate(input: BacktestInput): SimulateResult | BacktestError {
  const warnings: BacktestWarning[] = []

  // 1) Build the full union grid before any truncation. The grid is the
  //    backbone for every per-instrument forward-fill below.
  const fullGrid = buildUnionDateGrid({
    prices: input.prices,
    fxRates: input.fxRates,
    startDate: input.start,
    endDate: input.end,
  })

  // 2) Truncate to the latest instrument first_date (Pitfall 3). If every
  //    instrument's first_date is null, fall back to the requested start.
  const instrumentFirstDates = input.instruments
    .map(i => i.first_date)
    .filter((d): d is string => d !== null)
  const inferredFirst = instrumentFirstDates.length > 0 ? maxString(instrumentFirstDates) : input.start
  const effectiveStart = inferredFirst > input.start ? inferredFirst : input.start
  if (effectiveStart > input.start) {
    warnings.push({
      kind: 'truncated_start',
      message: `Run truncated to ${effectiveStart} (constrained by latest instrument first_date).`,
    })
  }
  if (effectiveStart > input.end) {
    return {
      kind: 'no_overlap',
      message: `No overlapping trading window: effective start ${effectiveStart} is after end ${input.end}.`,
    }
  }
  const grid = fullGrid.filter(d => d >= effectiveStart)
  if (grid.length === 0) {
    return {
      kind: 'no_overlap',
      message: `No trading days in [${effectiveStart}, ${input.end}] across the supplied price/FX series.`,
    }
  }

  // 3) Per-instrument price maps (forward-filled across the grid). Emit a
  //    forward_fill warning per instrument that needed any fills.
  const priceMaps = new Map<string, Map<string, number>>()
  for (const inst of input.instruments) {
    const filled = forwardFillForInstrument(grid, input.prices, inst.id)
    priceMaps.set(inst.id, filled.values)
    if (filled.fillCount > 0) {
      warnings.push({
        kind: 'forward_fill',
        message: `Forward-filled ${filled.fillCount} day(s) for ${inst.ticker}.`,
        instrument_id: inst.id,
        count: filled.fillCount,
      })
    }
  }

  // 4) FX lookup per (currency, date) with ≤ 4-day lookback (Pitfall 5).
  const fxByCurrency = bucketFxByCurrency(input.fxRates)
  const fxLookup = buildFxLookup(grid, fxByCurrency)

  // 5) Per-instrument dividend ex-date map (only ex_dates inside the grid).
  const dividendMaps = bucketDividends(input.dividends, grid)

  // 6) Initial allocation. CHF value at start day = price × FX(currency→CHF).
  const sharesByInstrument = new Map<string, number>()
  const startDay = grid[0]
  for (const inst of input.instruments) {
    const chfPrice = chfPriceFor(inst, startDay, priceMaps, fxLookup)
    if (chfPrice === null || chfPrice <= 0) {
      // Instrument has no price at the effective start → skip allocation
      // (will contribute 0 to the curve). Surface a forward_fill-style
      // warning so the footer flags it.
      warnings.push({
        kind: 'forward_fill',
        message: `No CHF price available at start ${startDay} for ${inst.ticker}; allocation skipped.`,
        instrument_id: inst.id,
        count: 0,
      })
      sharesByInstrument.set(inst.id, 0)
      continue
    }
    const targetChfValue = input.investmentAmount * (inst.weight / 100)
    sharesByInstrument.set(inst.id, targetChfValue / chfPrice)
  }

  // 7) Compute rebalance dates (D-16) across the user-requested [start, end]
  //    window. Boundaries strictly before `input.start` (e.g., the Jan-1 of
  //    a prior calendar year when the user picks a start in late December)
  //    do NOT fire, even though the grid's first day might satisfy
  //    "first-on-or-after" trivially.
  const rebalanceDates = computeRebalanceDates(grid, input.rebalance, input.start, input.end)

  // 8) Main daily loop. Apply dividends (DRIP toggle), apply rebalance,
  //    snapshot CHF value to the equity curve.
  const equity: EquityPoint[] = []
  for (let i = 0; i < grid.length; i++) {
    const day = grid[i]

    // Dividends — D-15: applied at ex_date, BEFORE we mark the value so the
    // reinvested shares show up in today's snapshot.
    if (input.drip) {
      for (const inst of input.instruments) {
        const divsForInst = dividendMaps.get(inst.id)
        if (!divsForInst) continue
        const dueToday = divsForInst.get(day)
        if (dueToday === undefined || dueToday <= 0) continue
        const priceMap = priceMaps.get(inst.id)
        if (!priceMap) continue
        const px = priceMap.get(day)
        if (px === undefined || px <= 0) continue
        const currentShares = sharesByInstrument.get(inst.id) ?? 0
        // dueToday is per-share in the instrument currency. shares += amount/price
        // gives a result independent of FX (the conversion to CHF and back
        // cancels out for share-count reinvestment, per D-15).
        const newShares = currentShares + (currentShares * dueToday) / px
        sharesByInstrument.set(inst.id, newShares)
        // Pitfall 7: if today was a forward-filled day for this instrument,
        // flag the DRIP application.
        if (isForwardFilledDay(input.prices, inst.id, day)) {
          warnings.push({
            kind: 'drip_on_filled',
            message: `DRIP applied on ${day} for ${inst.ticker} using forward-filled price.`,
            instrument_id: inst.id,
          })
        }
      }
    }

    // Rebalance — D-16: at boundary's first trading day, snap shares so each
    // instrument's CHF value matches its target weight.
    if (rebalanceDates.has(day)) {
      const totalCHF = portfolioCHF(input.instruments, sharesByInstrument, priceMaps, fxLookup, day)
      for (const inst of input.instruments) {
        const chfPrice = chfPriceFor(inst, day, priceMaps, fxLookup)
        if (chfPrice === null || chfPrice <= 0) continue
        const targetCHF = totalCHF * (inst.weight / 100)
        sharesByInstrument.set(inst.id, targetCHF / chfPrice)
      }
      warnings.push({
        kind: 'rebalance',
        message: `Rebalance fired on ${day}.`,
      })
    }

    // Snapshot today's CHF value.
    const value = portfolioCHF(input.instruments, sharesByInstrument, priceMaps, fxLookup, day)
    equity.push({ date: day, value })
  }

  // 9) Benchmark — treat as a parallel 1-instrument sub-portfolio (D-23).
  let benchmarkEquity: EquityPoint[] | null = null
  if (input.benchmark_ticker) {
    benchmarkEquity = simulateBenchmark(input, grid, fxLookup, warnings)
  }

  // 10) Annual bars — (end_of_year / start_of_year) - 1 per calendar year,
  //     for both portfolio and benchmark.
  const annualBars = computeAnnualBars(equity, benchmarkEquity)

  return { equity, benchmarkEquity, annualBars, warnings }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function maxString(xs: string[]): string {
  let m = xs[0]
  for (const x of xs) if (x > m) m = x
  return m
}

function forwardFillForInstrument(
  grid: string[],
  prices: PriceRow[],
  instrumentId: string,
): ReturnType<typeof forwardFillSeries> {
  const rows = prices
    .filter(p => p.instrument_id === instrumentId)
    .map(p => ({ date: p.date, value: p.adjusted_close }))
  return forwardFillSeries({ grid, rows })
}

function bucketFxByCurrency(fxRates: FxRateRow[]): Map<string, FxRateRow[]> {
  const m = new Map<string, FxRateRow[]>()
  for (const f of fxRates) {
    const arr = m.get(f.quote_currency)
    if (arr) arr.push(f)
    else m.set(f.quote_currency, [f])
  }
  // Sort each per-currency series so lookback can binary-walk if needed.
  for (const [k, arr] of m) {
    m.set(k, [...arr].sort((a, b) => a.date.localeCompare(b.date)))
  }
  return m
}

/**
 * For each (currency, grid_date) pair, find the most recent published FX
 * within ≤ FX_LOOKBACK_DAYS calendar days. Hard-fail (skip with NaN) beyond
 * that. The lookup table is keyed by `${currency}|${date}`.
 *
 * CHF is implicitly always rate=1 — callers handle this via `chfPriceFor`.
 */
function buildFxLookup(grid: string[], fxByCurrency: Map<string, FxRateRow[]>): Map<string, number> {
  const lookup = new Map<string, number>()
  for (const [currency, rows] of fxByCurrency) {
    const dateRateMap = new Map<string, number>()
    for (const r of rows) dateRateMap.set(r.date, r.rate)
    let lastDate: string | null = null
    let lastRate = 0
    for (const day of grid) {
      const exact = dateRateMap.get(day)
      if (exact !== undefined) {
        lastDate = day
        lastRate = exact
        lookup.set(`${currency}|${day}`, exact)
      } else if (lastDate !== null) {
        const diff = (new Date(day).getTime() - new Date(lastDate).getTime()) / MS_PER_DAY
        if (diff <= FX_LOOKBACK_DAYS) {
          lookup.set(`${currency}|${day}`, lastRate)
        }
        // else: no entry → callers see undefined and skip the instrument
      }
    }
  }
  return lookup
}

function bucketDividends(dividends: DividendRow[], grid: string[]): Map<string, Map<string, number>> {
  const gridSet = new Set(grid)
  const m = new Map<string, Map<string, number>>()
  for (const d of dividends) {
    if (!gridSet.has(d.ex_date)) continue
    let inst = m.get(d.instrument_id)
    if (!inst) {
      inst = new Map<string, number>()
      m.set(d.instrument_id, inst)
    }
    // If multiple dividends on the same ex_date (rare), sum them.
    inst.set(d.ex_date, (inst.get(d.ex_date) ?? 0) + d.amount)
  }
  return m
}

function chfPriceFor(
  inst: InstrumentInput,
  day: string,
  priceMaps: Map<string, Map<string, number>>,
  fxLookup: Map<string, number>,
): number | null {
  const priceMap = priceMaps.get(inst.id)
  if (!priceMap) return null
  const px = priceMap.get(day)
  if (px === undefined) return null
  if (inst.currency === 'CHF') return px
  const rate = fxLookup.get(`${inst.currency}|${day}`)
  if (rate === undefined || rate <= 0) return null
  return px * rate
}

function portfolioCHF(
  instruments: InstrumentInput[],
  shares: Map<string, number>,
  priceMaps: Map<string, Map<string, number>>,
  fxLookup: Map<string, number>,
  day: string,
): number {
  let total = 0
  for (const inst of instruments) {
    const sh = shares.get(inst.id) ?? 0
    if (sh === 0) continue
    const chfPx = chfPriceFor(inst, day, priceMaps, fxLookup)
    if (chfPx === null) continue
    total += sh * chfPx
  }
  return total
}

function isForwardFilledDay(prices: PriceRow[], instrumentId: string, day: string): boolean {
  // True iff no real row exists for (instrumentId, day) — the value at `day`
  // in the price map came from forward-fill.
  for (const p of prices) {
    if (p.instrument_id === instrumentId && p.date === day) return false
  }
  return true
}

const QUARTERLY_MONTHS = ['01', '04', '07', '10'] as const
const SEMI_ANNUAL_MONTHS = ['01', '07'] as const
const ANNUAL_MONTHS = ['01'] as const

function computeRebalanceDates(
  grid: string[],
  freq: RebalanceFrequency,
  requestedStart: string,
  requestedEnd: string,
): Set<string> {
  if (freq === 'none' || grid.length === 0) return new Set()
  const months =
    freq === 'quarterly' ? QUARTERLY_MONTHS : freq === 'semi-annual' ? SEMI_ANNUAL_MONTHS : ANNUAL_MONTHS

  // Boundaries to consider: every (year, month) pair whose calendar boundary
  // falls within [requestedStart, requestedEnd]. Only those produce rebalances.
  const firstYear = parseInt(requestedStart.slice(0, 4), 10)
  const lastYear = parseInt(requestedEnd.slice(0, 4), 10)
  const rebalanceDates = new Set<string>()
  for (let y = firstYear; y <= lastYear; y++) {
    for (const m of months) {
      const boundary = `${y}-${m}-01`
      if (boundary < requestedStart || boundary > requestedEnd) continue
      // First trading day on/after boundary, within the grid.
      const firstOnOrAfter = grid.find(d => d >= boundary)
      if (firstOnOrAfter !== undefined) rebalanceDates.add(firstOnOrAfter)
    }
  }
  return rebalanceDates
}

function simulateBenchmark(
  input: BacktestInput,
  grid: string[],
  fxLookup: Map<string, number>,
  warnings: BacktestWarning[],
): EquityPoint[] | null {
  // Treat benchmark as a synthetic 100% instrument with the same start
  // capital and DRIP setting. Find the instrument matching benchmark_ticker
  // — if not present in `input.instruments`, we can't price it.
  const benchInst = input.instruments.find(i => i.ticker === input.benchmark_ticker)
  if (!benchInst) return null

  const priceRows = input.prices.filter(p => p.instrument_id === benchInst.id)
  const filled = forwardFillSeries({
    grid,
    rows: priceRows.map(p => ({ date: p.date, value: p.adjusted_close })),
  })
  if (filled.values.size === 0) return null

  const startDay = grid[0]
  const priceMaps = new Map<string, Map<string, number>>([[benchInst.id, filled.values]])
  const startChfPrice = chfPriceFor(benchInst, startDay, priceMaps, fxLookup)
  if (startChfPrice === null || startChfPrice <= 0) return null

  let shares = input.investmentAmount / startChfPrice
  // Benchmark dividends respect DRIP per D-23.
  const divsForBench = bucketDividends(input.dividends, grid).get(benchInst.id)

  const out: EquityPoint[] = []
  for (const day of grid) {
    if (input.drip && divsForBench) {
      const due = divsForBench.get(day)
      const px = filled.values.get(day)
      if (due !== undefined && due > 0 && px !== undefined && px > 0) {
        shares += (shares * due) / px
      }
    }
    const chfPx = chfPriceFor(benchInst, day, priceMaps, fxLookup)
    out.push({ date: day, value: chfPx === null ? 0 : shares * chfPx })
  }
  // Surface a single 'rebalance'-style audit? Benchmark is not rebalanced
  // (it's a single instrument). Nothing else to emit beyond the curve.
  void warnings
  return out
}

function computeAnnualBars(equity: EquityPoint[], benchmark: EquityPoint[] | null): AnnualBar[] {
  if (equity.length === 0) return []
  const byYear = new Map<number, { firstP: number; lastP: number; firstB: number | null; lastB: number | null }>()
  for (let i = 0; i < equity.length; i++) {
    const year = parseInt(equity[i].date.slice(0, 4), 10)
    const bVal = benchmark?.[i]?.value ?? null
    const entry = byYear.get(year)
    if (!entry) {
      byYear.set(year, { firstP: equity[i].value, lastP: equity[i].value, firstB: bVal, lastB: bVal })
    } else {
      entry.lastP = equity[i].value
      entry.lastB = bVal
    }
  }
  const bars: AnnualBar[] = []
  for (const [year, e] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    const portfolioRet = e.firstP > 0 ? e.lastP / e.firstP - 1 : 0
    const benchmarkRet =
      e.firstB !== null && e.firstB > 0 && e.lastB !== null ? e.lastB / e.firstB - 1 : null
    bars.push({ year, portfolio: portfolioRet, benchmark: benchmarkRet })
  }
  return bars
}
