/**
 * D-09: stale prices_version surfaces badge.
 *
 * Plan 05-07 Task 0 DECISION (resolved): this spec uses **direct DB mutation
 * via a Node-side Supabase service-role client** to bump `prices.created_at`
 * for one instrument in the test portfolio. We do NOT invoke
 * /api/cron/refresh-prices. Rationale:
 *   a) More reliable — no Vercel cron dependency in local CI
 *   b) Deterministic — the UPSERT is atomic; the new created_at is known
 *   c) No auth dance — service-role key stays in the Node-side test helper,
 *      never crosses to the browser context
 *
 * The /api/backtest/runs/[id] route computes `currentPricesVersion` as the
 * max of `prices.created_at`, `dividends.created_at`, and `fx_rates.created_at`
 * across the run's instrument + benchmark + date window. A run is `stale=true`
 * when this current value exceeds the stored `prices_version`. So bumping
 * `prices.created_at` for any instrument in the run's window is sufficient
 * to flip the stale flag. See src/app/api/backtest/runs/[id]/route.ts lines
 * 129-181.
 *
 * Required env (asserted by tests/integration/_setup/backtest-prereqs.ts):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (Node-side only — used here to bump created_at)
 *   - CRON_SECRET                (kept in env for the SNB seed precondition)
 *
 * Implemented by Plan 05-07 Task 1 below.
 */
import { test } from '@playwright/test'

test.skip('D-09: stale prices_version surfaces badge — placeholder for Task 1', () => {
  // Implementation lives in Task 1 (full spec below).
})
