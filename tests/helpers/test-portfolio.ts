// Wave 0 stubs for Plan 04 integration helpers.
// Full implementations land in Plan 03 (server actions / RPC) and Plan 05 (login flow).
// These stubs satisfy the file-existence contract from 04-VALIDATION.md so downstream
// `<verify>` blocks have real import targets.
import { createClient as createServiceClient } from '@supabase/supabase-js'

type Service = ReturnType<typeof createServiceClient>

export function getServiceClient(): Service {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createServiceClient(url, key, { auth: { persistSession: false } })
}

export type SeedPortfolioInput = {
  userId: string
  name: string
  investmentAmount?: number
  // Aligned with Plan 03's final contract: callers seed by instrument_id (UUID),
  // not ticker. Wave 0 stubs throw, so this only constrains the type signature
  // downstream plans implement against.
  items?: { instrument_id: string; weight: number }[]
}

export async function createTestPortfolio(_input: SeedPortfolioInput): Promise<{ id: string }> {
  throw new Error('createTestPortfolio not yet implemented (Wave 0 stub)')
}

export async function cleanupTestPortfolio(portfolioId: string): Promise<void> {
  const sb = getServiceClient()
  await sb.from('portfolios').delete().eq('id', portfolioId)
}

export async function loginTestUser(
  _page: import('@playwright/test').Page,
): Promise<{ userId: string; email: string }> {
  // Reuse Phase 1 auth flow. Implementation in Plan 05; stub for Wave 0.
  throw new Error('loginTestUser not yet implemented (Wave 0 stub)')
}
