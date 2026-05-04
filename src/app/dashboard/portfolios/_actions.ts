'use server'

// Server Actions for portfolio persistence.
// - savePortfolio: validates payload with PortfolioSchema, calls save_portfolio RPC (Plan 03 migration 00006).
// - deletePortfolio: standard RLS-scoped DELETE with re-query verification.
// Neither action calls redirect() — clients (Plan 04 builder) own navigation.
//
// FormData contract:
//   savePortfolio: formData.get('payload') = JSON.stringify(PortfolioInput)
//   deletePortfolio: formData.get('id') = string UUID
//
// Per RESEARCH "Pitfall 5": validate FIRST; never wrap redirect in try/catch.
// Per AGENTS.md / Next.js 16: cookies() is async, so createClient() is awaited.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PortfolioSchema, type PortfolioInput } from './_schema'

type SaveResult = { ok: true; id: string } | { ok: false; error: string }
type DeleteResult = { ok: true } | { ok: false; error: string }

export async function savePortfolio(_prev: unknown, formData: FormData): Promise<SaveResult> {
  const supabase = await createClient()

  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Step 1 — extract + parse JSON payload.
  const rawField = formData.get('payload')
  if (typeof rawField !== 'string' || rawField.length === 0) {
    return { ok: false, error: 'Missing payload' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(rawField)
  } catch {
    return { ok: false, error: 'Invalid payload JSON' }
  }

  // Step 2 — Zod validation. Surface the first issue's message (mirrors form UI).
  const parsed = PortfolioSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: first?.message ?? 'Validation failed' }
  }
  const input: PortfolioInput = parsed.data

  // Step 3 — call atomic RPC. Pass null id for new portfolios.
  // Cast args via `as never` because Database.public.Functions is empty in src/types/database.ts;
  // the RPC was added in migration 00006 and runtime call shape is verified by the round-trip
  // test in tests/unit/save-portfolio-rpc.test.ts.
  const rpcArgs = {
    p_id: input.id ?? null,
    p_user_id: user.id,
    p_name: input.name,
    p_description: input.description ?? null,
    p_investment_amount: input.investment_amount,
    p_items: input.items.map((it) => ({
      instrument_id: it.instrument_id,
      weight: it.weight,
    })),
  }
  const { data: portfolioId, error: rpcError } = await supabase.rpc('save_portfolio', rpcArgs as never)

  if (rpcError) return { ok: false, error: rpcError.message }
  if (typeof portfolioId !== 'string') {
    return { ok: false, error: 'Save returned no portfolio id' }
  }

  revalidatePath('/dashboard/portfolios')
  revalidatePath(`/dashboard/portfolios/${portfolioId}/edit`)
  return { ok: true, id: portfolioId }
}

export async function deletePortfolio(formData: FormData): Promise<DeleteResult> {
  const supabase = await createClient()

  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) return { ok: false, error: 'Not authenticated' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing id' }

  const { error } = await supabase.from('portfolios').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Re-query: RLS DELETE silently returns 0 rows for non-owners. If the row still
  // exists after the call, the delete was blocked.
  const { data: stillThere } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (stillThere) {
    return { ok: false, error: 'Delete blocked (not owner or RLS)' }
  }

  revalidatePath('/dashboard/portfolios')
  return { ok: true }
}
