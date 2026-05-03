/**
 * One-shot Stooq bulk-archive seed script.
 *
 * Downloads full daily price history (inception to yesterday) from Stooq
 * for every v1 SEED ticker, then upserts via cache-prices helpers.
 *
 * Stooq is the right fit for the bulk archive because a single CSV download
 * covers 30+ years per ticker; incremental daily refresh is YahooProvider's
 * job (Plan 09 cron change).
 *
 * Idempotency: if an instrument already has first_date populated (i.e. prices
 * were seeded previously), skip it. Re-running after a successful seed is a no-op.
 * Use --force to override and re-fetch all tickers.
 *
 * Usage:
 *   npm run seed:stooq
 *   npm run seed:stooq -- --force
 *
 * Required env (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STOOQ_API_KEY   (obtain from https://stooq.com/q/d/?s=spy.us&get_apikey)
 */
import { createClient } from '@supabase/supabase-js'
import {
  upsertInstrumentMetadata,
  upsertPrices,
  getInstrumentByTicker,
} from '@/lib/data/cache-prices'
import { toStooqSymbol, fetchStooqDailyCsv, parseStooqCsv } from '@/lib/data/stooq'
import { isDataError } from '@/lib/data/errors'
// SEED extracted via one-line `export` added to seed-instruments.ts (non-breaking).
// Plan 09 will move SEED to a shared module if further scripts need it.
import { SEED } from './seed-instruments'

// ── Types ─────────────────────────────────────────────────────────────────────

export type StooqSeedSummary = {
  processed: number
  skipped: number
  prices: number
  errors: string[]
}

// ── Core seed function ────────────────────────────────────────────────────────

/**
 * Run the Stooq bulk-archive seed.
 *
 * @param opts.force - If true, skip the idempotency check and re-fetch all tickers.
 */
export async function runStooqSeed(
  opts: { force?: boolean } = {},
): Promise<StooqSeedSummary> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.STOOQ_API_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  if (!apiKey) throw new Error('STOOQ_API_KEY is not set — obtain from https://stooq.com/q/d/?s=spy.us&get_apikey')

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const summary: StooqSeedSummary = { processed: 0, skipped: 0, prices: 0, errors: [] }

  for (const meta of SEED) {
    // Idempotency check: skip if already seeded (first_date present) and not forcing
    if (!opts.force) {
      const existing = await getInstrumentByTicker(supabase, meta.ticker)
      if (isDataError(existing)) {
        summary.errors.push(`${meta.ticker}: lookup error — ${existing.message}`)
        continue
      }
      if (existing && existing.first_date) {
        console.log(`Skipping ${meta.ticker} — already seeded (first_date: ${existing.first_date})`)
        summary.skipped++
        continue
      }
    }

    // Map to Stooq symbol; throws Error on unknown exchange (programmer error in SEED)
    let stooqSym: string
    try {
      stooqSym = toStooqSymbol(meta.ticker)
    } catch (err) {
      summary.errors.push(`${meta.ticker}: symbol mapping error — ${String(err)}`)
      continue
    }

    // Download CSV from Stooq
    const csv = await fetchStooqDailyCsv(stooqSym, { apiKey })
    if (isDataError(csv)) {
      summary.errors.push(`${meta.ticker}: stooq fetch ${csv.kind} — ${csv.message}`)
      continue
    }

    // Parse CSV to PriceRow[]
    const rows = parseStooqCsv(csv)
    if (isDataError(rows)) {
      summary.errors.push(`${meta.ticker}: csv parse ${rows.kind} — ${rows.message}`)
      continue
    }

    // Ensure instrument row exists (idempotent upsert)
    const upserted = await upsertInstrumentMetadata(supabase, meta)
    if (isDataError(upserted)) {
      summary.errors.push(`${meta.ticker}: metadata upsert ${upserted.kind} — ${upserted.message}`)
      continue
    }

    // Upsert prices
    const r = await upsertPrices(supabase, upserted.id, rows)
    if (isDataError(r)) {
      summary.errors.push(`${meta.ticker}: prices upsert ${r.kind} — ${r.message}`)
      continue
    }

    summary.prices += r.upserted
    summary.processed++
    console.log(
      `Seeded ${meta.ticker} (${stooqSym}) — ${r.upserted} rows ` +
      `[${r.firstDate} → ${r.lastDate}]`,
    )

    // Polite delay to avoid hammering Stooq: 14 tickers × 1.5s ≈ 21s total
    await new Promise(resolve => setTimeout(resolve, 1500))
  }

  return summary
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main() {
  const force = process.argv.includes('--force')
  if (force) {
    console.log('--force flag detected: skipping idempotency check for all tickers')
  }
  const result = await runStooqSeed({ force })
  console.log(JSON.stringify(result, null, 2))
  // Exit 1 only if everything failed (genuine failure)
  // Exit 0 if at least some tickers seeded successfully
  if (result.errors.length > 0 && result.processed === 0) {
    process.exit(1)
  }
}

// ESM equivalent of require.main === module
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('seed-instruments-stooq.ts') ||
    process.argv[1].endsWith('seed-instruments-stooq.js'))

if (isMain) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
