/**
 * Audit the D-22 benchmark candidates' price-history coverage and top-up
 * any ticker that is missing from `instruments` or has < 10 years of data.
 *
 * Candidate tickers (CONTEXT D-22):
 *   * URTH.US   — MSCI World (USD listing)
 *   * SWDA.LSE  — MSCI World (LSE/UCITS listing)
 *   * SSAC.SW   — MSCI ACWI All Country World (CHF-listed UCITS)
 *   * SPY.US    — S&P 500
 *   * CSSMI.SW  — Swiss Market Index ETF
 *
 * Provider choice (Rule 1 deviation discovered at first run):
 * Phase 3 wired Stooq as the bulk-archive seeder, but at the time this
 * script ran Stooq served an anti-bot JS-challenge page for every CSV
 * request (with or without apikey, with or without a browser User-Agent
 * header). YahooProvider's `getEod()` returns the same PriceRow[] shape
 * and covers the D-22 candidates from 2010-2012 onward, so the audit
 * uses YahooProvider as the seed source. The migration of the broader
 * bulk-seed pipeline to Yahoo is already captured in Phases 03-07/03-09.
 *
 * Resolution rule for the MSCI World pair (RESOLVED Open Question 1):
 * after audit, the variant (URTH.US vs SWDA.LSE) with the earlier
 * `first_date` becomes the canonical entry for the dropdown — logged to
 * stdout so Plan 05-06's `loadBenchmarkInstruments` can match the choice.
 *
 * Usage:
 *   npm run audit:benchmarks
 *
 * Required env (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Exit code:
 *   0  every benchmark has >= 10y coverage (URTH/SWDA pair: at least one
 *      member satisfies the condition)
 *   1  any required benchmark is still under-covered after the seed step
 */
import { createClient } from '@supabase/supabase-js'
import {
  upsertInstrumentMetadata,
  upsertPrices,
  upsertDividends,
  getInstrumentByTicker,
} from '@/lib/data/cache-prices'
import { YahooProvider } from '@/lib/data/YahooProvider'
import { isDataError } from '@/lib/data/errors'
import type { InstrumentMetadata } from '@/lib/data/types'

// ── Benchmark metadata ────────────────────────────────────────────────────────

const CANDIDATES: InstrumentMetadata[] = [
  {
    ticker: 'URTH.US',
    name: 'iShares MSCI World ETF',
    isin: 'US46434V6213',
    type: 'etf',
    currency: 'USD',
    exchange: 'US',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'SWDA.LSE',
    name: 'iShares Core MSCI World UCITS ETF',
    isin: 'IE00B4L5Y983',
    type: 'etf',
    currency: 'USD',
    exchange: 'LSE',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'SSAC.SW',
    name: 'iShares MSCI ACWI UCITS ETF (CHF)',
    isin: 'IE00B6R52259',
    type: 'etf',
    currency: 'CHF',
    exchange: 'SW',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'SPY.US',
    name: 'SPDR S&P 500 ETF Trust',
    isin: 'US78462F1030',
    type: 'etf',
    currency: 'USD',
    exchange: 'US',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'CSSMI.SW',
    name: 'iShares Core SMI ETF (CH)',
    isin: 'CH0237935652',
    type: 'etf',
    currency: 'CHF',
    exchange: 'SW',
    expense_ratio: null,
    dividend_yield: null,
  },
]

const MSCI_WORLD_PAIR = new Set(['URTH.US', 'SWDA.LSE'])
const MIN_YEARS_COVERAGE = 10
const SEED_FROM = '2010-01-01' // earliest fetch start; older = better
const MS_PER_DAY = 86400 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

type AuditStatus = 'ok' | 'seeded' | 'failed'

type AuditRow = {
  ticker: string
  first_date: string | null
  last_date: string | null
  years_coverage: number
  status: AuditStatus
  error?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function yearsBetween(fromIso: string | null, toIso: string | null): number {
  if (!fromIso || !toIso) return 0
  const from = new Date(fromIso).getTime()
  const to = new Date(toIso).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return (to - from) / MS_PER_DAY / 365.25
}

function yearsFromTodayBack(fromIso: string | null): number {
  if (!fromIso) return 0
  return yearsBetween(fromIso, new Date().toISOString().split('T')[0])
}

// ── Core audit + seed-on-demand ───────────────────────────────────────────────

export async function runAudit(): Promise<{
  rows: AuditRow[]
  mscWorldPick: 'URTH.US' | 'SWDA.LSE' | null
  allOk: boolean
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const provider = new YahooProvider()
  const rows: AuditRow[] = []

  for (const meta of CANDIDATES) {
    console.log(`\n→ Auditing ${meta.ticker}`)
    const row: AuditRow = {
      ticker: meta.ticker,
      first_date: null,
      last_date: null,
      years_coverage: 0,
      status: 'failed',
    }

    const existing = await getInstrumentByTicker(supabase, meta.ticker)
    if (isDataError(existing)) {
      row.error = `lookup error — ${existing.message}`
      rows.push(row)
      continue
    }

    if (existing) {
      row.first_date = existing.first_date
      row.last_date = existing.last_date
      row.years_coverage = yearsFromTodayBack(existing.first_date)
    }

    const meetsCoverage = row.years_coverage >= MIN_YEARS_COVERAGE
    if (meetsCoverage) {
      row.status = 'ok'
      console.log(
        `  ok — first_date=${row.first_date} (${row.years_coverage.toFixed(1)}y coverage)`,
      )
      rows.push(row)
      continue
    }

    // Either missing or under-covered — seed from Yahoo.
    console.log(
      `  needs seed — first_date=${row.first_date ?? '(none)'} years=${row.years_coverage.toFixed(1)}`,
    )

    const priceRows = await provider.getEod(meta.ticker, { from: SEED_FROM })
    if (isDataError(priceRows)) {
      row.error = `yahoo getEod ${priceRows.kind} — ${priceRows.message}`
      rows.push(row)
      continue
    }
    if (priceRows.length === 0) {
      row.error = 'yahoo returned 0 rows'
      rows.push(row)
      continue
    }

    // Ensure metadata row exists; this also gives us an instrument id.
    const upserted = await upsertInstrumentMetadata(supabase, meta)
    if (isDataError(upserted)) {
      row.error = `metadata upsert ${upserted.kind} — ${upserted.message}`
      rows.push(row)
      continue
    }

    const r = await upsertPrices(supabase, upserted.id, priceRows)
    if (isDataError(r)) {
      row.error = `prices upsert ${r.kind} — ${r.message}`
      rows.push(row)
      continue
    }

    row.first_date = r.firstDate
    row.last_date = r.lastDate
    row.years_coverage = yearsFromTodayBack(r.firstDate)
    row.status = row.years_coverage >= MIN_YEARS_COVERAGE ? 'seeded' : 'failed'
    if (row.status !== 'seeded') {
      row.error = `coverage still ${row.years_coverage.toFixed(1)}y after seed`
    }
    console.log(
      `  seeded — first_date=${row.first_date} last_date=${row.last_date} (${row.years_coverage.toFixed(1)}y, ${r.upserted} rows)`,
    )

    // Also seed dividends so total-return math is honest from day 1.
    const divs = await provider.getDividends(meta.ticker, { from: SEED_FROM })
    if (!isDataError(divs) && divs.length > 0) {
      const divResult = await upsertDividends(supabase, upserted.id, divs)
      if (!isDataError(divResult)) {
        console.log(`  + ${divResult.upserted} dividend rows`)
      }
    }

    rows.push(row)

    // Polite delay between Yahoo fetches
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  // MSCI World pair resolution (RESOLVED Open Question 1)
  const urth = rows.find(r => r.ticker === 'URTH.US')
  const swda = rows.find(r => r.ticker === 'SWDA.LSE')
  let mscWorldPick: 'URTH.US' | 'SWDA.LSE' | null = null
  if (urth?.first_date && swda?.first_date) {
    mscWorldPick = urth.first_date <= swda.first_date ? 'URTH.US' : 'SWDA.LSE'
  } else if (urth?.first_date) {
    mscWorldPick = 'URTH.US'
  } else if (swda?.first_date) {
    mscWorldPick = 'SWDA.LSE'
  }

  // Coverage gate: every non-MSCI-World candidate must be ok/seeded; the
  // MSCI World pair counts if at least one of URTH/SWDA meets coverage.
  const allOk = rows.every(r => {
    if (MSCI_WORLD_PAIR.has(r.ticker)) {
      const other = rows.find(o => MSCI_WORLD_PAIR.has(o.ticker) && o.ticker !== r.ticker)
      return r.status !== 'failed' || (other && other.status !== 'failed')
    }
    return r.status !== 'failed'
  })

  return { rows, mscWorldPick, allOk }
}

// ── CLI entry point ───────────────────────────────────────────────────────────

function printSummary(rows: AuditRow[], mscWorldPick: 'URTH.US' | 'SWDA.LSE' | null) {
  console.log('\n══════════════════════════════════════════════════════════════════')
  console.log('Benchmark history audit — summary')
  console.log('══════════════════════════════════════════════════════════════════')
  console.log(
    'ticker'.padEnd(12) +
      'first_date'.padEnd(14) +
      'last_date'.padEnd(14) +
      'years'.padEnd(8) +
      'status',
  )
  console.log('─'.repeat(66))
  for (const r of rows) {
    console.log(
      r.ticker.padEnd(12) +
        (r.first_date ?? '(none)').padEnd(14) +
        (r.last_date ?? '(none)').padEnd(14) +
        r.years_coverage.toFixed(1).padEnd(8) +
        r.status +
        (r.error ? `  (${r.error})` : ''),
    )
  }
  console.log('─'.repeat(66))
  if (mscWorldPick) {
    console.log(`MSCI World canonical pick (D-22 resolution): ${mscWorldPick}`)
  } else {
    console.log('MSCI World canonical pick: (unresolved — neither URTH.US nor SWDA.LSE has coverage)')
  }
}

async function main() {
  const { rows, mscWorldPick, allOk } = await runAudit()
  printSummary(rows, mscWorldPick)
  if (!allOk) {
    console.error('\nFAIL: not every D-22 benchmark meets the >=10y coverage requirement.')
    process.exit(1)
  }
  console.log('\nPASS: all D-22 benchmarks meet the >=10y coverage requirement.')
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('audit-benchmark-history.ts') ||
    process.argv[1].endsWith('audit-benchmark-history.js'))

if (isMain) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

export default runAudit
