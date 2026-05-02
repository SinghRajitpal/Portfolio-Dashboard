import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchFrankfurterRates } from '@/lib/data/frankfurter'
import { upsertFxRates } from '@/lib/data/cache-fx'
import { isDataError } from '@/lib/data/errors'

const SEED_START_DATE = '1999-01-04'
const BASE_CURRENCY = 'CHF'
const QUOTE_CURRENCIES = ['USD', 'EUR', 'GBP']

/**
 * Seed or top-up the fx_rates table with Frankfurter FX history.
 *
 * Idempotent: checks the latest cached date and fetches only from that
 * day + 1 forward. If the cache is empty, fetches from 1999-01-04 (ECB start).
 *
 * Called by the CLI main() with a real Supabase client, or by integration
 * tests with a test client (no env-var dependency in the logic itself).
 */
export async function runSeed(supabase: SupabaseClient): Promise<void> {
  // Find the latest cached date for CHF base — determines the start of the fetch window.
  const { data: latest } = await supabase
    .from('fx_rates')
    .select('date')
    .eq('base_currency', BASE_CURRENCY)
    .order('date', { ascending: false })
    .limit(1)

  const startDate =
    latest && latest.length > 0
      ? new Date(new Date(latest[0].date).getTime() + 86400000).toISOString().split('T')[0]
      : SEED_START_DATE

  const today = new Date().toISOString().split('T')[0]

  if (startDate > today) {
    console.log('FX cache up to date')
    return
  }

  console.log(`Fetching Frankfurter rates ${startDate} -> ${today}`)
  const rows = await fetchFrankfurterRates({
    from: startDate,
    to: today,
    base: BASE_CURRENCY,
    quotes: QUOTE_CURRENCIES,
  })

  if (isDataError(rows)) {
    throw new Error(`Fetch failed: ${rows.kind} — ${rows.message}`)
  }

  console.log(`Parsed ${rows.length} daily rows`)

  const result = await upsertFxRates(supabase, rows)

  if (isDataError(result)) {
    throw new Error(`Upsert failed: ${result.kind} — ${result.message}`)
  }

  console.log(`Upserted ${result.upserted} fx_rate rows`)
}

/**
 * CLI entry point.
 * Usage: npx tsx src/scripts/seed-fx.ts
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  await runSeed(supabase)
}

// Only run main() when this file is executed directly as the CLI entry point.
// When imported as a module (e.g., by integration tests), runSeed() is called directly.
// ESM equivalent of `if (require.main === module)`.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('seed-fx.ts') || process.argv[1].endsWith('seed-fx.js'))

if (isMain) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
