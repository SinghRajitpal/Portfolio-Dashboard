/**
 * Idempotent seed script for v1 template tickers.
 *
 * See RESEARCH.md "Pre-Seed Ticker List" for the rationale behind each instrument.
 *
 * ISINs hardcoded for v1 template instruments — verified manually against issuer
 * factsheets. Reduces dependency on OpenFIGI for the well-known seed set.
 *
 * Rate budget: EODHD free tier = 20 calls/day.
 * With 14 instruments and both prices + dividends = 28 calls.
 * Split over 2 days using the `mode` CLI arg:
 *   Day 1: npm run seed:instruments prices   (14 calls)
 *   Day 2: npm run seed:instruments dividends (14 calls)
 *   Full:  npm run seed:instruments both      (28 calls — use only with paid key)
 *
 * Idempotency: if an instrument already has cached prices (first_date is set),
 * the prices fetch step is skipped for 'prices' and 'both' modes. For 'dividends'
 * mode, the instrument must already exist in the DB (seeded on Day 1).
 */
import { createClient } from '@supabase/supabase-js'
import { EODHDProvider } from '@/lib/data/EODHDProvider'
import {
  upsertInstrumentMetadata,
  upsertPrices,
  upsertDividends,
  getInstrumentByTicker,
} from '@/lib/data/cache-prices'
import { isDataError } from '@/lib/data/errors'
import type { InstrumentMetadata } from '@/lib/data/types'

/**
 * v1 template tickers — see RESEARCH.md "Pre-Seed Ticker List".
 * Hand-curated metadata: name/type/currency/exchange. expense_ratio and
 * dividend_yield are left null — populated lazily when EODHD fundamentals
 * lite is in scope (deferred for v1, per CONTEXT.md).
 */
export const SEED: InstrumentMetadata[] = [
  // Classic 60/40
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
    ticker: 'AGG.US',
    name: 'iShares Core U.S. Aggregate Bond ETF',
    isin: 'US4642872265',
    type: 'etf',
    currency: 'USD',
    exchange: 'US',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'VTI.US',
    name: 'Vanguard Total Stock Market ETF',
    isin: 'US9229087690',
    type: 'etf',
    currency: 'USD',
    exchange: 'US',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'BND.US',
    name: 'Vanguard Total Bond Market ETF',
    isin: 'US9219378356',
    type: 'etf',
    currency: 'USD',
    exchange: 'US',
    expense_ratio: null,
    dividend_yield: null,
  },
  // All-World (LSE listings have UCITS structure relevant for Swiss residents)
  {
    ticker: 'VWRL.LSE',
    name: 'Vanguard FTSE All-World UCITS ETF',
    isin: 'IE00B3RBWM25',
    type: 'etf',
    currency: 'USD',
    exchange: 'LSE',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'IWDA.LSE',
    name: 'iShares Core MSCI World UCITS ETF',
    isin: 'IE00B4L5Y983',
    type: 'etf',
    currency: 'USD',
    exchange: 'LSE',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'CSSPX.SW',
    name: 'iShares Core S&P 500 UCITS ETF',
    isin: 'IE00B5BMR087',
    type: 'etf',
    currency: 'CHF',
    exchange: 'SW',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: '500E.SW',
    name: 'Amundi S&P 500 UCITS ETF',
    isin: 'LU1681048804',
    type: 'etf',
    currency: 'CHF',
    exchange: 'SW',
    expense_ratio: null,
    dividend_yield: null,
  },
  // Swiss dividend / EM
  {
    ticker: 'CHDVD.SW',
    name: 'iShares Swiss Dividend ETF',
    isin: 'CH0237935637',
    type: 'etf',
    currency: 'CHF',
    exchange: 'SW',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'IQQA.SW',
    name: 'iShares MSCI EM UCITS ETF',
    isin: 'IE00B0M63177',
    type: 'etf',
    currency: 'USD',
    exchange: 'SW',
    expense_ratio: null,
    dividend_yield: null,
  },
  // Benchmarks
  {
    ticker: 'GLD.US',
    name: 'SPDR Gold Shares',
    isin: 'US78463V1070',
    type: 'etf',
    currency: 'USD',
    exchange: 'US',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'QQQ.US',
    name: 'Invesco QQQ Trust',
    isin: 'US46090E1038',
    type: 'etf',
    currency: 'USD',
    exchange: 'US',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'EEM.US',
    name: 'iShares MSCI Emerging Markets ETF',
    isin: 'US4642872349',
    type: 'etf',
    currency: 'USD',
    exchange: 'US',
    expense_ratio: null,
    dividend_yield: null,
  },
  {
    ticker: 'NOVN.SW',
    name: 'Novartis AG',
    isin: 'CH0012005267',
    type: 'stock',
    currency: 'CHF',
    exchange: 'SW',
    expense_ratio: null,
    dividend_yield: null,
  },
]

export type SeedSummary = {
  processed: number
  skipped: number
  prices: number
  dividends: number
  errors: string[]
}

/**
 * Run the seed operation.
 *
 * @param opts.mode  - 'prices' | 'dividends' | 'both'. Controls which EODHD
 *                    calls are made per instrument. Use 'prices' on Day 1 and
 *                    'dividends' on Day 2 to stay within 20/day free tier budget.
 */
export async function runSeed(
  opts: { mode: 'prices' | 'dividends' | 'both' } = { mode: 'both' },
): Promise<SeedSummary> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const apiKey = process.env.EODHD_API_KEY!
  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const provider = new EODHDProvider(apiKey)

  const summary: SeedSummary = { processed: 0, skipped: 0, prices: 0, dividends: 0, errors: [] }

  for (const meta of SEED) {
    // Idempotency: if instrument already has prices, skip the prices step.
    // For 'dividends' mode we skip the existence check (instrument must already exist).
    const existing = await getInstrumentByTicker(supabase, meta.ticker)
    if (isDataError(existing)) {
      summary.errors.push(`${meta.ticker}: lookup ${existing.message}`)
      continue
    }
    if (existing && existing.first_date && opts.mode !== 'dividends') {
      console.log(`Skipping ${meta.ticker} — already has prices`)
      summary.skipped++
      continue
    }

    // Upsert metadata — creates or updates the instruments row, returns instrument_id
    const upserted = await upsertInstrumentMetadata(supabase, meta)
    if (isDataError(upserted)) {
      summary.errors.push(`${meta.ticker}: metadata ${upserted.message}`)
      continue
    }

    if (opts.mode === 'prices' || opts.mode === 'both') {
      const prices = await provider.getEod(meta.ticker)
      if (isDataError(prices)) {
        summary.errors.push(`${meta.ticker}: prices ${prices.kind} ${prices.message}`)
        continue
      }
      const r = await upsertPrices(supabase, upserted.id, prices)
      if (isDataError(r)) {
        summary.errors.push(`${meta.ticker}: prices upsert ${r.message}`)
        continue
      }
      summary.prices += r.upserted
    }

    if (opts.mode === 'dividends' || opts.mode === 'both') {
      const divs = await provider.getDividends(meta.ticker)
      if (isDataError(divs)) {
        // Some instruments have no dividends — kind='not_found' is acceptable (e.g., GLD)
        if (divs.kind !== 'not_found') {
          summary.errors.push(`${meta.ticker}: dividends ${divs.kind} ${divs.message}`)
        }
      } else {
        const r = await upsertDividends(supabase, upserted.id, divs)
        if (isDataError(r)) {
          summary.errors.push(`${meta.ticker}: dividends upsert ${r.message}`)
          continue
        }
        summary.dividends += r.upserted
      }
    }

    summary.processed++
    console.log(
      `Seeded ${meta.ticker} — prices: ${opts.mode !== 'dividends'}, divs: ${opts.mode !== 'prices'}`,
    )
  }

  return summary
}

/**
 * CLI entry point.
 * Usage:
 *   npm run seed:instruments [prices|dividends|both]
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EODHD_API_KEY
 */
async function main() {
  const mode = (process.argv[2] as 'prices' | 'dividends' | 'both') ?? 'both'
  if (!['prices', 'dividends', 'both'].includes(mode)) {
    console.error('Usage: tsx src/scripts/seed-instruments.ts [prices|dividends|both]')
    process.exit(1)
  }
  const result = await runSeed({ mode })
  console.log(JSON.stringify(result, null, 2))
  if (result.errors.length > 0) process.exit(1)
}

// Only run main() when this file is executed directly as the CLI entry point.
// When imported as a module, runSeed() is called directly.
// ESM equivalent of `if (require.main === module)`.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('seed-instruments.ts') || process.argv[1].endsWith('seed-instruments.js'))

if (isMain) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
