/**
 * POST /api/backtest/runs — write a completed backtest run.
 * GET  /api/backtest/runs?portfolio_id=… — list runs for the history drawer.
 *
 * Both endpoints use the SSR cookies-bound Supabase client; RLS on
 * backtest_runs (migration 00009) scopes every read/write to
 * auth.uid() = user_id. There is no UPDATE path — recompute writes a
 * new row (CONTEXT D-08: runs are immutable).
 *
 * Threats mitigated:
 *   * T-5-04-RUN-LEAK — RLS SELECT policy filters list responses to the
 *     calling user only.
 *   * T-5-04-COLL — inputs_hash is SHA-256; UNIQUE(portfolio_id, inputs_hash)
 *     turns identical-input writes into idempotent upserts (deduped: true).
 *
 * Cite:
 *   * .planning/phases/05-backtesting-engine/05-CONTEXT.md (D-08, D-09)
 *   * .planning/phases/05-backtesting-engine/05-PATTERNS.md §api/backtest/runs/route.ts
 *   * supabase/migrations/00009_backtest_runs.sql (UNIQUE + RLS)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DataError } from '@/lib/data/errors'
import { BacktestRunWriteSchema } from '@/lib/backtest/api-schemas'

export async function POST(request: NextRequest) {
  // 1. Parse JSON
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { kind: 'invalid_input', message: 'Body must be valid JSON' } satisfies DataError,
      { status: 400 },
    )
  }

  // 2. Zod-validate
  const parsed = BacktestRunWriteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        kind: 'invalid_input',
        message: parsed.error.issues.map((i) => i.message).join('; '),
      } satisfies DataError,
      { status: 400 },
    )
  }
  const { portfolio_id, params, inputsHash, pricesVersion, output } = parsed.data

  // 3. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { kind: 'invalid_input', message: 'Not authenticated' } satisfies DataError,
      { status: 401 },
    )
  }

  // 4. Dedup pre-check — capture whether an identical-input row already exists
  //    so we can surface { deduped: true } to the caller. When a row exists we
  //    return its id immediately and skip the upsert entirely — migration
  //    00009_backtest_runs.sql intentionally omits an UPDATE policy
  //    (backtest_runs are immutable), and the prior strategy of issuing an
  //    UPSERT with ignoreDuplicates:false would have Postgres execute its
  //    ON CONFLICT DO UPDATE branch which RLS rejects with "new row violates
  //    row-level security policy (USING expression)". Returning the existing
  //    id here preserves the deterministic-dedup contract (D-08) without
  //    needing an UPDATE policy. — Plan 05-07 Rule 1 fix.
  const { data: previousRow, error: dedupErr } = await supabase
    .from('backtest_runs')
    .select('id')
    .eq('portfolio_id', portfolio_id)
    .eq('inputs_hash', inputsHash)
    .maybeSingle()
  if (dedupErr) {
    return NextResponse.json(
      { kind: 'transient', message: dedupErr.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  if (previousRow !== null) {
    return NextResponse.json({
      id: (previousRow as { id: string }).id,
      deduped: true,
    })
  }

  // 5. Upsert. RLS WITH CHECK enforces user_id = auth.uid() — we must include
  //    user_id in the row even though RLS would otherwise reject the INSERT.
  //    The cast through `unknown` mirrors `_queries.ts` lines 65, 128 — the
  //    Database type hasn't been regenerated against the new backtest_runs
  //    table (Plan 05-01 added it), so the typed builder narrows to `never`.
  type BacktestRunInsertRow = {
    user_id: string
    portfolio_id: string
    inputs_hash: string
    params_json: unknown
    equity_curve_json: unknown
    annual_bars_json: unknown
    metrics_json: unknown
    warnings_json: unknown
    prices_version: number
  }
  const row: BacktestRunInsertRow = {
    user_id: user.id,
    portfolio_id,
    inputs_hash: inputsHash,
    params_json: params,
    equity_curve_json: output.equity,
    annual_bars_json: output.annualBars,
    metrics_json: output.metrics,
    warnings_json: output.warnings,
    prices_version: pricesVersion,
  }
  const { data: upserted, error: upsertErr } = await (
    supabase.from('backtest_runs') as unknown as {
      upsert: (
        r: BacktestRunInsertRow,
        opts: { onConflict: string; ignoreDuplicates: boolean },
      ) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: { id: string } | null
            error: { message: string } | null
          }>
        }
      }
    }
  )
    // ignoreDuplicates:true mirrors the no-UPDATE-policy invariant — if a
    // concurrent request beats us to the INSERT (race after the dedup
    // pre-check above), Postgres treats it as a no-op rather than firing
    // the unsupported UPDATE branch. The subsequent .select() returns the
    // existing row's id via the (portfolio_id, inputs_hash) UNIQUE lookup
    // pattern we already used at step 4 (we return deduped:false here
    // because the pre-check was clean — only racing requests can land
    // here, and they're rare in practice).
    .upsert(row, { onConflict: 'portfolio_id,inputs_hash', ignoreDuplicates: true })
    .select('id')
    .single()
  if (upsertErr) {
    // PGRST116 ('Cannot coerce the result to a single JSON object' / 0 rows)
    // can fire when ignoreDuplicates:true elides the conflict row. Recover
    // by reading the row that won the race.
    const errCode = (upsertErr as { code?: string }).code
    if (errCode === 'PGRST116') {
      const { data: existing } = await supabase
        .from('backtest_runs')
        .select('id')
        .eq('portfolio_id', portfolio_id)
        .eq('inputs_hash', inputsHash)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({
          id: (existing as { id: string }).id,
          deduped: true,
        })
      }
    }
    return NextResponse.json(
      { kind: 'transient', message: upsertErr.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }
  const upsertedRow = upserted as unknown as { id: string }

  return NextResponse.json({ id: upsertedRow.id, deduped: false })
}

export async function GET(request: NextRequest) {
  // 1. Optional portfolio_id query filter
  //    URL-constructor pattern from refresh-prices/route.ts — works in
  //    Next.js runtime AND vitest unit tests (NextRequest.nextUrl is
  //    runtime-only).
  const portfolioId = new URL(request.url).searchParams.get('portfolio_id')

  // 2. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { kind: 'invalid_input', message: 'Not authenticated' } satisfies DataError,
      { status: 401 },
    )
  }

  // 3. RLS-scoped SELECT (auth.uid() = user_id auto-applied by policy)
  let query = supabase
    .from('backtest_runs')
    .select('id, portfolio_id, params_json, metrics_json, prices_version, computed_at')
    .order('computed_at', { ascending: false })

  if (portfolioId) {
    query = query.eq('portfolio_id', portfolioId)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json(
      { kind: 'transient', message: error.message, attempt: 0 } satisfies DataError,
      { status: 503 },
    )
  }

  return NextResponse.json(data ?? [])
}
