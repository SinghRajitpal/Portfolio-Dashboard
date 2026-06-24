/**
 * One-shot bulk seed of the snb_rates table.
 *
 * Pulls the full SNB CHF policy-rate history (libor_mid midpoint stitched
 * with the post-2019-06 LZ series — see src/lib/data/snb.ts) and writes
 * the rows into Supabase via the service-role client. Subsequent quarterly
 * top-ups are handled by /api/cron/refresh-snb; this script exists for the
 * initial backfill and for manual re-runs from a developer machine.
 *
 * Idempotent: relies on `upsertSnbRates`'s onConflict='date_month' to avoid
 * double-inserts. Re-running the script overwrites existing rows with the
 * latest published values (SNB occasionally revises historical figures).
 *
 * Usage:
 *   npm run seed:snb
 *
 * Required env (loaded from .env.local via the `--env-file` flag):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchSnbPolicyRate } from '@/lib/data/snb'
import { upsertSnbRates } from '@/lib/data/cache-snb'
import { isDataError } from '@/lib/data/errors'

/**
 * Library-style entry point. Tests can import and call runSeed() with a
 * mocked Supabase client; main() is the CLI wrapper that builds the real
 * service-role client from env.
 */
export async function runSeed(supabase: SupabaseClient): Promise<void> {
  console.log('Fetching SNB policy-rate history from data.snb.ch …')
  const points = await fetchSnbPolicyRate()

  if (isDataError(points)) {
    throw new Error(`SNB fetch failed: ${points.kind} — ${points.message}`)
  }

  const lzCount = points.filter(p => p.source === 'LZ').length
  const liborCount = points.filter(p => p.source === 'libor_mid').length
  console.log(`Stitched ${points.length} rows (${liborCount} libor_mid + ${lzCount} LZ)`)

  const result = await upsertSnbRates(supabase, points)

  if (isDataError(result)) {
    throw new Error(`Upsert failed: ${result.kind} — ${result.message}`)
  }

  console.log(`Upserted ${result.upserted} snb_rates rows`)
}

/**
 * CLI entry point.
 * Usage: node --env-file=.env.local --import tsx src/scripts/seed-snb.ts
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
// ESM equivalent of `if (require.main === module)`. Mirrors the seed-fx.ts
// pattern (lines 84-95).
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('seed-snb.ts') || process.argv[1].endsWith('seed-snb.js'))

if (isMain) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
