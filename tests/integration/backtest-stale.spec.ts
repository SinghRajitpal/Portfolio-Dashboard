/**
 * D-09: stale prices_version surfaces badge.
 *
 * Plan 05-07 Task 0 DECISION (resolved): this spec uses **direct DB mutation
 * via a Node-side Supabase service-role client** to bump `prices.created_at`
 * for one instrument in the test portfolio. We do NOT invoke
 * /api/cron/refresh-prices. Rationale:
 *   a) More reliable — no Vercel cron dependency in local CI
 *   b) Deterministic — the UPDATE is atomic; the new created_at is known
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
 * Plan 05-07 Task 1.
 */
import { test, expect } from '@playwright/test'
import {
  cleanupTestPortfolio,
  cleanupTestUser,
  createTestPortfolio,
  createTestUser,
  getInstrumentIdByTicker,
  getServiceClient,
  loginTestUser,
  type TestUser,
} from '../helpers/test-portfolio'

test.describe('D-09: stale prices_version surfaces badge', () => {
  let user: TestUser
  const portfolioIds: string[] = []
  // Track which prices rows we mutated so afterAll can revert their
  // created_at (defensive — service-role mutation, even on test data).
  const bumpedPriceIds: string[] = []

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    if (bumpedPriceIds.length > 0) {
      const sb = getServiceClient()
      // Reset the bumped rows' created_at to a stable in-the-past value so a
      // future run of this spec is deterministic.
      await sb
        .from('prices')
        // The Database type narrows the update payload to `never` for the
        // shared prices table; cast through unknown to match the codebase
        // pattern (see src/app/api/backtest/runs/route.ts lines 86-96).
        .update({ created_at: '2024-01-01T00:00:00Z' } as unknown as never)
        .in('id', bumpedPriceIds)
    }
    for (const id of portfolioIds) await cleanupTestPortfolio(id)
    if (user) await cleanupTestUser(user.userId)
  })

  test('stale badge appears when prices refresh after a saved run', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const spy = await getInstrumentIdByTicker('SPY.US')
    const urth = await getInstrumentIdByTicker('URTH.US')
    test.skip(!spy || !urth, 'Required seeded instruments missing')

    const pf = await createTestPortfolio({
      userId: user.userId,
      name: 'D-09 Stale',
      items: [
        { instrument_id: spy!, weight: 60 },
        { instrument_id: urth!, weight: 40 },
      ],
    })
    portfolioIds.push(pf.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/backtest')

    // 1. Wait for the initial auto-run to settle and capture the run id.
    const firstResp = await page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') && r.request().method() === 'POST',
      { timeout: 75_000 },
    )
    expect(firstResp.ok()).toBe(true)
    const { id: runId } = (await firstResp.json()) as { id: string }

    // 2. Direct DB mutation: bump one SPY prices row's created_at to NOW so
    //    currentPricesVersion > stored prices_version → stale=true.
    const sb = getServiceClient()
    const { data: oneRow } = await sb
      .from('prices')
      .select('id')
      .eq('instrument_id', spy!)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    expect(oneRow).not.toBeNull()
    const priceId = (oneRow as { id: string }).id
    const newCreatedAt = new Date().toISOString()
    const { error: updErr } = await sb
      .from('prices')
      .update({ created_at: newCreatedAt } as unknown as never)
      .eq('id', priceId)
    expect(updErr).toBeNull()
    bumpedPriceIds.push(priceId)

    // 3. Open the run history drawer and click the captured run id. The
    //    /api/backtest/runs/[id] route recomputes currentPricesVersion at
    //    fetch time and returns stale:true.
    const loadPromise = page.waitForResponse(
      (r) => r.url().includes(`/api/backtest/runs/${runId}`),
      { timeout: 30_000 },
    )
    await page.getByTestId('open-history-button').click()
    await expect(page.getByTestId('run-history-drawer')).toBeVisible()

    // Find the row for our run id and click its inner button. The row uses
    // a button.absolute[data-run-id=…] overlay (see RunHistoryDrawer.tsx).
    await page.locator(`button[data-run-id="${runId}"]`).click()
    const loadResp = await loadPromise
    expect(loadResp.ok()).toBe(true)
    const loadBody = (await loadResp.json()) as { stale: boolean }
    expect(loadBody.stale).toBe(true)

    // Wait for the drawer to fully close before interacting with the
    // recompute button — shadcn Dialog leaves a portal overlay during
    // close animations that can swallow clicks on underlying elements.
    await expect(page.getByTestId('run-history-drawer')).toHaveCount(0, {
      timeout: 5_000,
    })

    // 4. The BacktestResults component renders the stale-badge banner when
    //    isStale=true.
    await expect(page.getByTestId('stale-badge')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('stale-recompute-button')).toBeVisible()
    await expect(page.getByTestId('stale-recompute-button')).toBeEnabled()

    // 5. Click Recompute — the BacktestClient handler triggers a fresh
    //    /api/backtest/data POST (worker is rebuilt because batchData was
    //    nulled on loadHistoricalRun) and writes a new /api/backtest/runs
    //    row (deduped if inputs_hash matches; new row otherwise).
    const dataReqPromise = page.waitForRequest(
      (r) =>
        r.url().includes('/api/backtest/data') && r.method() === 'POST',
      { timeout: 30_000 },
    )
    const newRunsPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') && r.request().method() === 'POST',
      { timeout: 75_000 },
    )
    // Force the click via dispatch so any stray portal overlay (Dialog's
    // close animation can leave a transient aria-hidden div in the tree)
    // doesn't swallow the pointer event.
    await page.getByTestId('stale-recompute-button').click({ force: true })
    await dataReqPromise
    const recomputed = await newRunsPromise
    expect(recomputed.ok()).toBe(true)
  })
})
