import 'server-only'

// Server-only DB reads for the portfolio builder.
// All functions create a user-scoped Supabase client (RLS enforces ownership for portfolio
// rows; templates are visible to any authenticated user via 00004 RLS policy).
//
// NUMERIC handling: Supabase JS may return Postgres NUMERIC columns as either string or
// number depending on driver/version. Every numeric field is wrapped via toNum() defensively.
//
// Per RESEARCH "Pitfall 9": this module is server-only. The 'server-only' import throws
// at build/runtime if a client component imports it.

import { createClient } from '@/lib/supabase/server'
import type { PortfolioInput } from './_schema'

export type PortfolioListRow = {
  id: string
  name: string
  updated_at: string
  instrument_count: number
  weighted_ter: number | null
  weighted_yield: number | null
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function toNumOrZero(v: unknown): number {
  const n = toNum(v)
  return n ?? 0
}

type ListPortfolioRow = {
  id: string
  name: string
  updated_at: string
  portfolio_instruments: Array<{
    weight: number | string
    instruments: {
      expense_ratio: number | string | null
      dividend_yield: number | string | null
    } | null
  }>
}

export async function listPortfolios(): Promise<PortfolioListRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('portfolios')
    .select(
      'id, name, updated_at, portfolio_instruments(weight, instruments(expense_ratio, dividend_yield))',
    )
    .eq('is_template', false)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`listPortfolios: ${error.message}`)

  const rows = (data ?? []) as unknown as ListPortfolioRow[]
  return rows.map((p) => {
    const items = p.portfolio_instruments ?? []
    let terNumerator = 0
    let terAnyNonNull = false
    let yieldNumerator = 0
    let yieldAnyNonNull = false

    for (const it of items) {
      const w = toNumOrZero(it.weight)
      const ter = toNum(it.instruments?.expense_ratio ?? null)
      const dy = toNum(it.instruments?.dividend_yield ?? null)
      if (ter !== null) {
        terAnyNonNull = true
        terNumerator += w * ter
      }
      if (dy !== null) {
        yieldAnyNonNull = true
        yieldNumerator += w * dy
      }
    }

    return {
      id: p.id,
      name: p.name,
      updated_at: p.updated_at,
      instrument_count: items.length,
      // ter / yield are stored as fractions (e.g. 0.0007). The "weighted" form scales by
      // weight (a percent 0..100) and divides by 100 to keep the result in fraction form.
      weighted_ter: terAnyNonNull ? terNumerator / 100 : null,
      weighted_yield: yieldAnyNonNull ? yieldNumerator / 100 : null,
    }
  })
}

type EditPortfolioRow = {
  id: string
  name: string
  description: string | null
  investment_amount: number | string | null
  portfolio_instruments: Array<{
    weight: number | string
    instruments: {
      id: string
      ticker: string
      name: string
    } | null
  }>
}

export async function getPortfolioForEdit(id: string): Promise<PortfolioInput | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('portfolios')
    .select(
      'id, name, description, investment_amount, portfolio_instruments(weight, instruments(id, ticker, name))',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`getPortfolioForEdit: ${error.message}`)
  if (!data) return null

  const row = data as unknown as EditPortfolioRow
  const items = (row.portfolio_instruments ?? [])
    .filter((it) => it.instruments !== null)
    .map((it) => ({
      instrument_id: it.instruments!.id,
      ticker: it.instruments!.ticker,
      name: it.instruments!.name,
      weight: toNumOrZero(it.weight),
    }))

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    investment_amount: toNumOrZero(row.investment_amount),
    items,
  }
}

export type TemplateRow = {
  id: string
  name: string
  description: string | null
  items: { instrument_id: string; ticker: string; name: string; weight: number }[]
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('portfolios')
    .select(
      'id, name, description, portfolio_instruments(weight, instruments(id, ticker, name))',
    )
    .eq('is_template', true)
    .order('name', { ascending: true })

  if (error) throw new Error(`listTemplates: ${error.message}`)

  type TplRow = {
    id: string
    name: string
    description: string | null
    portfolio_instruments: Array<{
      weight: number | string
      instruments: { id: string; ticker: string; name: string } | null
    }>
  }
  const rows = (data ?? []) as unknown as TplRow[]
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    items: (p.portfolio_instruments ?? [])
      .filter((it) => it.instruments !== null)
      .map((it) => ({
        instrument_id: it.instruments!.id,
        ticker: it.instruments!.ticker,
        name: it.instruments!.name,
        weight: toNumOrZero(it.weight),
      })),
  }))
}

export async function getInstrumentMetaMap(
  ids: string[],
): Promise<Map<string, { expense_ratio: number | null; dividend_yield: number | null }>> {
  const map = new Map<string, { expense_ratio: number | null; dividend_yield: number | null }>()
  if (ids.length === 0) return map

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instruments')
    .select('id, expense_ratio, dividend_yield')
    .in('id', ids)

  if (error) throw new Error(`getInstrumentMetaMap: ${error.message}`)

  // Cast through unknown — Database.public.Tables has Row types but the chained
  // .select(string) overload returns `never` until Postgres types are regenerated.
  type MetaRow = { id: string; expense_ratio: number | string | null; dividend_yield: number | string | null }
  const rows = (data ?? []) as unknown as MetaRow[]
  for (const row of rows) {
    map.set(row.id, {
      expense_ratio: toNum(row.expense_ratio),
      dividend_yield: toNum(row.dividend_yield),
    })
  }
  return map
}

export type InstrumentLookupRow = {
  id: string
  ticker: string
  name: string
  exchange: string | null
  currency: string
  expense_ratio: number | null
  dividend_yield: number | null
}

export async function getInstrumentByTicker(
  ticker: string,
  exchange?: string,
): Promise<InstrumentLookupRow | null> {
  const supabase = await createClient()
  let query = supabase
    .from('instruments')
    .select('id, ticker, name, exchange, currency, expense_ratio, dividend_yield')
    .eq('ticker', ticker)

  if (exchange) {
    query = query.eq('exchange', exchange)
  }

  const { data, error } = await query.limit(1).maybeSingle()
  if (error) throw new Error(`getInstrumentByTicker: ${error.message}`)
  if (!data) return null

  type RawInstrumentRow = {
    id: string
    ticker: string
    name: string
    exchange: string | null
    currency: string
    expense_ratio: number | string | null
    dividend_yield: number | string | null
  }
  const row = data as unknown as RawInstrumentRow
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    currency: row.currency,
    expense_ratio: toNum(row.expense_ratio),
    dividend_yield: toNum(row.dividend_yield),
  }
}
