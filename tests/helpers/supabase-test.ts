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
  const tables = ['prices', 'dividends', 'fx_rates', 'isin_lookups', 'instruments']
  for (const t of tables) {
    const { error } = await client
      .from(t)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    // Tolerate "relation does not exist" (isin_lookups added in plan 02)
    if (error && !error.message.includes('does not exist')) throw error
  }
}
