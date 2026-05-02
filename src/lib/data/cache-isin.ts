/**
 * isin_lookups cache helpers.
 *
 * Caches OpenFIGI ISIN resolution results in the `isin_lookups` Supabase table.
 * Per CONTEXT.md: ISIN mappings are permanent for v1 — no TTL, no staleness policy.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DataError } from './errors'
import type { OpenFIGIRecord } from './openfigi'

export type ISINMapping = {
  isin: string
  ticker: string
  exchange: string
  figi: string | null
  security_type: string | null
  currency: string | null
}

export async function readCachedISIN(
  supabase: SupabaseClient,
  isin: string,
): Promise<ISINMapping[] | DataError> {
  const { data, error } = await supabase
    .from('isin_lookups')
    .select('isin, ticker, exchange, figi, security_type, currency')
    .eq('isin', isin)
  if (error) return { kind: 'transient', message: error.message, attempt: 0 }
  return (data ?? []) as ISINMapping[]
}

export async function upsertISINMappings(
  supabase: SupabaseClient,
  isin: string,
  records: OpenFIGIRecord[],
): Promise<{ upserted: number } | DataError> {
  if (records.length === 0) return { upserted: 0 }
  const rows = records.map(r => ({
    isin,
    ticker: r.ticker,
    exchange: r.exchCode,
    figi: r.figi ?? null,
    security_type: r.securityType ?? null,
    currency: r.currency ?? null,
  }))
  const { error } = await supabase
    .from('isin_lookups')
    .upsert(rows, { onConflict: 'isin,ticker,exchange' })
  if (error) return { kind: 'transient', message: error.message, attempt: 0 }
  return { upserted: rows.length }
}
