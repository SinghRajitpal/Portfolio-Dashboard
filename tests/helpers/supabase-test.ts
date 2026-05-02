import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createTestSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  // Use service role for tests to bypass RLS during truncate
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function truncateMarketData(client: SupabaseClient): Promise<void> {
  // Order matters: child tables first.
  // isin_lookups has a composite PK (no id column) — delete by matching a column that's always NOT NULL.
  const tablesWithId = ['prices', 'dividends', 'fx_rates', 'instruments']
  for (const t of tablesWithId) {
    const { error } = await client
      .from(t)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (error && !error.message.includes('does not exist')) throw error
  }

  // isin_lookups has composite PK — delete by matching isin NOT NULL
  const { error: isinError } = await client
    .from('isin_lookups')
    .delete()
    .not('isin', 'is', null)
  // Tolerate "relation does not exist" until migration 00002 is applied
  if (isinError && !isinError.message.includes('does not exist')) throw isinError
}
