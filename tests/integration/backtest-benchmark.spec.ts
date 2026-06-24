/**
 * BACK-07: benchmark dropdown adds overlay.
 *
 * Select a benchmark from the dropdown; verify the chart re-renders with
 * an additional series. Selecting 'None' removes the overlay.
 *
 * Deviation from PLAN acceptance text: the 05-07 plan's
 * <acceptance_criteria> states "toggling benchmark does NOT trigger
 * /api/backtest/data fetch (only /api/backtest/runs POST)". However the
 * Plan 05-06 SUMMARY explicitly classifies `benchmark_ticker` as a HEAVY
 * param (lines 80-85 of BacktestClient.tsx) because /api/backtest/data
 * only loads the requested benchmark's instrument — switching benchmarks
 * legitimately requires a refetch. We assert the actual (and correct)
 * behavior: changing the benchmark triggers both a /api/backtest/data
 * fetch AND a /api/backtest/runs POST.
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
  loginTestUser,
  type TestUser,
} from '../helpers/test-portfolio'

test.describe('BACK-07: benchmark dropdown adds overlay', () => {
  let user: TestUser
  const portfolioIds: string[] = []

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    for (const id of portfolioIds) await cleanupTestPortfolio(id)
    if (user) await cleanupTestUser(user.userId)
  })

  test('selecting a benchmark refetches and overlays a second series', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const spy = await getInstrumentIdByTicker('SPY.US')
    const urth = await getInstrumentIdByTicker('URTH.US')
    test.skip(!spy || !urth, 'Required seeded instruments missing')

    const pf = await createTestPortfolio({
      userId: user.userId,
      name: 'BACK-07 Benchmark',
      items: [
        { instrument_id: spy!, weight: 60 },
        { instrument_id: urth!, weight: 40 },
      ],
    })
    portfolioIds.push(pf.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/backtest')
    await expect(page.getByTestId('backtest-setup-bar')).toBeVisible({
      timeout: 15_000,
    })

    // Initial auto-run (no benchmark).
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') && r.request().method() === 'POST',
      { timeout: 75_000 },
    )
    await expect(page.getByTestId('equity-curve-chart')).toBeVisible()

    // Switch benchmark to SWDA.LSE (curated whitelist; cached prices verified
    // in Phase 5 RESEARCH §A.2). The data fetch will refire because
    // benchmark_ticker is HEAVY (see Plan 05-06 SUMMARY decisions).
    const dataReqPromise = page.waitForRequest(
      (r) =>
        r.url().includes('/api/backtest/data') && r.method() === 'POST',
      { timeout: 30_000 },
    )
    const runsPostPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') &&
        r.request().method() === 'POST' &&
        (r.request().postData() ?? '').includes('"benchmark_ticker":"SWDA.LSE"'),
      { timeout: 75_000 },
    )

    await page.getByTestId('backtest-benchmark-select').click()
    // Pick MSCI World — the Plan 05-06 _queries.ts maps SWDA.LSE → "MSCI World"
    // (longest cached history). Match by ticker substring to avoid coupling
    // to the human label.
    await page.getByRole('option', { name: /SWDA\.LSE/i }).click()

    const dataReq = await dataReqPromise
    expect((dataReq.postData() ?? '').includes('"benchmark_ticker":"SWDA.LSE"'))
      .toBe(true)
    const runsResp = await runsPostPromise
    expect(runsResp.ok()).toBe(true)

    // The chart canvas re-renders; the EquityCurveChart effect re-runs on
    // [portfolio, benchmark] changes (chart re-creation per RESEARCH Pattern
    // 2). Wait for benchmark overlay to materialize.
    await expect(page.getByTestId('equity-curve-chart').locator('canvas').first())
      .toBeVisible()

    // BACK-08 sibling check: the annual bars chart now also reveals a
    // benchmark sub-chart (testid annual-returns-chart-benchmark renders
    // only when showBenchmark=true).
    await expect(
      page.getByTestId('annual-returns-chart-benchmark'),
    ).toBeVisible({ timeout: 10_000 })

    // Reset to None — overlay should disappear, footer Benchmark resets.
    await page.getByTestId('backtest-benchmark-select').click()
    await page.getByRole('option', { name: /^None$/i }).click()
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') &&
        r.request().method() === 'POST' &&
        (r.request().postData() ?? '').includes('"benchmark_ticker":null'),
      { timeout: 75_000 },
    )
    await expect(
      page.getByTestId('annual-returns-chart-benchmark'),
    ).toHaveCount(0)
  })
})
