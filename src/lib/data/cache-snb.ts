/**
 * Supabase cache layer for the snb_rates table.
 *
 * Two operations:
 *   * upsertSnbRates — batched (500/batch) idempotent insert, used by both the
 *     one-shot seed script and the quarterly /api/cron/refresh-snb route.
 *   * getSnbRatesRange — read a YYYY-MM range; used by the batch-data endpoint
 *     (Plan 05-04) to assemble the worker payload.
 *
 * Storage convention (00010_snb_rates.sql, CONTEXT D-19):
 *   * `date_month` is TEXT 'YYYY-MM'.
 *   * `rate` is decimal NUMERIC(8,6), e.g. 0.0125 for 1.25%.
 *   * `source` ∈ {'LZ', 'libor_mid'} — discriminates the 2019-06 regime stitch
 *     so the run-summary footer can tell the user "stitched from SNB Libor
 *     midpoint pre-2019-06" (Pitfall 1 mitigation).
 *
 * Numeric coercion: Supabase returns NUMERIC columns as either number or
 * string depending on driver version, so `rate` is defensively coerced
 * through `toNum()` — the same pattern as `src/app/dashboard/portfolios/_queries.ts`
 * lines 25-38.
 *
 * Cite:
 *   * 05-CONTEXT.md D-19
 *   * 05-PATTERNS.md §snb.ts + §Cache-first / batch upsert
 *   * src/lib/data/cache-fx.ts (analog — same shape, different table)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DataError } from './errors'
import type { SnbPoint } from './snb'
import type { SnbRateRow } from '@/lib/backtest/types'

const BATCH_SIZE = 500

/**
 * Coerce a Postgres NUMERIC field (which may arrive as string or number) into
 * a finite number. Mirrors `_queries.ts` toNum() — see file-level comment.
 */
function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : NaN
  }
  return NaN
}

/**
 * Upsert stitched SNB policy-rate rows. Idempotent on (date_month) — re-running
 * the bulk seed will not double-insert; existing rows are overwritten with the
 * latest values (e.g. if SNB publishes a revision).
 *
 * Mirrors `upsertFxRates` shape from cache-fx.ts lines 17-52:
 *   * BATCH_SIZE = 500
 *   * onConflict matches the UNIQUE constraint
 *   * Returns DataError on the first failing batch
 */
export async function upsertSnbRates(
  supabase: SupabaseClient,
  rows: SnbPoint[],
): Promise<{ upserted: number } | DataError> {
  if (rows.length === 0) return { upserted: 0 }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('snb_rates')
      .upsert(batch, { onConflict: 'date_month' })
    if (error) {
      return { kind: 'transient', message: `snb_rates upsert: ${error.message}`, attempt: 1 }
    }
  }

  return { upserted: rows.length }
}

/**
 * Read a YYYY-MM range from snb_rates, ascending. Used by the batch-data
 * endpoint to assemble the worker payload's `snbRates[]`.
 */
export async function getSnbRatesRange(
  supabase: SupabaseClient,
  args: { from: string; to: string },
): Promise<SnbRateRow[] | DataError> {
  const { data, error } = await supabase
    .from('snb_rates')
    .select('date_month, rate, source')
    .gte('date_month', args.from)
    .lte('date_month', args.to)
    .order('date_month', { ascending: true })

  if (error) return { kind: 'transient', message: error.message, attempt: 1 }
  if (!data) return []

  return data.map(row => ({
    date_month: row.date_month as string,
    rate: toNum(row.rate),
    source: row.source as 'LZ' | 'libor_mid',
  }))
}
