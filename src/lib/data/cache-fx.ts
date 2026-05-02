import type { SupabaseClient } from '@supabase/supabase-js'
import type { FrankfurterRow } from './frankfurter'
import type { DataError } from './errors'

const BATCH_SIZE = 500

/**
 * Convert Frankfurter rows (CHF base, multiple quotes per row) into
 * fx_rates table rows (one quote per row), then upsert in 500-row batches.
 *
 * Storage convention: base_currency=CHF, quote_currency=USD/EUR/GBP.
 * Single direction stored; consumers compute reciprocals.
 *
 * onConflict matches the UNIQUE (base_currency, quote_currency, date) constraint
 * from 00001_initial_schema.sql. Required per Pitfall 5 — never use plain insert().
 */
export async function upsertFxRates(
  supabase: SupabaseClient,
  rows: FrankfurterRow[],
): Promise<{ upserted: number } | DataError> {
  const flat: Array<{
    base_currency: string
    quote_currency: string
    date: string
    rate: number
    source: string
  }> = []

  for (const r of rows) {
    for (const [quote, rate] of Object.entries(r.rates)) {
      flat.push({
        base_currency: r.base,
        quote_currency: quote,
        date: r.date,
        rate,
        source: 'frankfurter',
      })
    }
  }

  for (let i = 0; i < flat.length; i += BATCH_SIZE) {
    const batch = flat.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('fx_rates')
      .upsert(batch, { onConflict: 'base_currency,quote_currency,date' })
    if (error) {
      return { kind: 'transient', message: `fx_rates upsert failed: ${error.message}`, attempt: 1 }
    }
  }

  return { upserted: flat.length }
}

/**
 * Read a single FX rate from the cache by base/quote/date.
 * Used by Phase 5 backtest engine (preview/sketch only — full read API arrives in Phase 5).
 *
 * Returns the rate as a number, or a DataError if not found or DB error.
 */
export async function getFxRate(
  supabase: SupabaseClient,
  opts: { base: string; quote: string; date: string },
): Promise<number | DataError> {
  const { data, error } = await supabase
    .from('fx_rates')
    .select('rate')
    .eq('base_currency', opts.base)
    .eq('quote_currency', opts.quote)
    .eq('date', opts.date)
    .maybeSingle()

  if (error) return { kind: 'transient', message: error.message, attempt: 1 }
  if (!data) {
    return {
      kind: 'not_found',
      message: `No FX rate for ${opts.base}/${opts.quote} on ${opts.date}`,
    }
  }

  return data.rate as number
}
