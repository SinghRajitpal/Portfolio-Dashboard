import type { SupabaseClient } from '@supabase/supabase-js'
import type { PriceRow, DividendRow, InstrumentMetadata } from './types'
import type { DataError } from './errors'

const BATCH_SIZE = 500 // RESEARCH.md Pattern 3

/**
 * Upsert instrument metadata to get (or create) the instrument_id.
 * Uses ticker as the conflict target so re-seeding is idempotent.
 */
export async function upsertInstrumentMetadata(
  supabase: SupabaseClient,
  meta: InstrumentMetadata,
): Promise<{ id: string } | DataError> {
  const { data, error } = await supabase
    .from('instruments')
    .upsert(
      {
        ticker: meta.ticker,
        name: meta.name,
        isin: meta.isin,
        type: meta.type,
        currency: meta.currency,
        exchange: meta.exchange,
        expense_ratio: meta.expense_ratio,
        dividend_yield: meta.dividend_yield,
        data_source: 'eodhd',
      },
      { onConflict: 'ticker' },
    )
    .select('id')
    .single()
  if (error) return { kind: 'transient', message: error.message, attempt: 1 }
  return { id: data.id as string }
}

/**
 * Upsert price rows for an instrument in batches of BATCH_SIZE.
 * Also updates instruments.first_date / last_date after successful upsert.
 */
export async function upsertPrices(
  supabase: SupabaseClient,
  instrumentId: string,
  rows: PriceRow[],
): Promise<{ upserted: number; firstDate: string | null; lastDate: string | null } | DataError> {
  if (rows.length === 0) return { upserted: 0, firstDate: null, lastDate: null }

  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const mapped = sorted.map(r => ({
    instrument_id: instrumentId,
    date: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    adjusted_close: r.adjusted_close,
    volume: r.volume,
  }))

  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('prices')
      .upsert(batch, { onConflict: 'instrument_id,date' })
    if (error) return { kind: 'transient', message: `prices upsert: ${error.message}`, attempt: 1 }
  }

  const firstDate = sorted[0].date
  const lastDate = sorted[sorted.length - 1].date

  // Update instruments.first_date/last_date — first full fetch defines the coverage range
  const { error: updErr } = await supabase
    .from('instruments')
    .update({ first_date: firstDate, last_date: lastDate })
    .eq('id', instrumentId)
  if (updErr) return { kind: 'transient', message: `instruments update: ${updErr.message}`, attempt: 1 }

  return { upserted: mapped.length, firstDate, lastDate }
}

/**
 * Upsert dividend rows for an instrument in batches of BATCH_SIZE.
 */
export async function upsertDividends(
  supabase: SupabaseClient,
  instrumentId: string,
  rows: DividendRow[],
): Promise<{ upserted: number } | DataError> {
  if (rows.length === 0) return { upserted: 0 }
  const mapped = rows.map(r => ({
    instrument_id: instrumentId,
    ex_date: r.ex_date,
    amount: r.amount,
    currency: r.currency,
  }))
  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('dividends')
      .upsert(batch, { onConflict: 'instrument_id,ex_date' })
    if (error) return { kind: 'transient', message: `dividends upsert: ${error.message}`, attempt: 1 }
  }
  return { upserted: mapped.length }
}

/**
 * Retrieve all cached price rows for an instrument ordered by date ascending.
 */
export async function getCachedPrices(
  supabase: SupabaseClient,
  instrumentId: string,
): Promise<PriceRow[] | DataError> {
  const { data, error } = await supabase
    .from('prices')
    .select('date, open, high, low, close, adjusted_close, volume')
    .eq('instrument_id', instrumentId)
    .order('date', { ascending: true })
  if (error) return { kind: 'transient', message: error.message, attempt: 1 }
  return (data ?? []) as PriceRow[]
}

/**
 * Look up an instrument row by ticker.
 * Returns null when the ticker doesn't exist yet.
 */
export async function getInstrumentByTicker(
  supabase: SupabaseClient,
  ticker: string,
): Promise<{ id: string; first_date: string | null; last_date: string | null } | null | DataError> {
  const { data, error } = await supabase
    .from('instruments')
    .select('id, first_date, last_date')
    .eq('ticker', ticker)
    .maybeSingle()
  if (error) return { kind: 'transient', message: error.message, attempt: 1 }
  return data
}
