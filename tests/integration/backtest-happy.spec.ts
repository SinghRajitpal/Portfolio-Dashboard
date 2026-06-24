/**
 * BACK-01: select portfolio + range, run, render curve.
 *
 * Happy-path spec — load /dashboard/backtest with a seeded portfolio, verify
 * the setup bar renders, the auto-run on mount produces an equity-curve
 * canvas + a 5-stat metrics strip, and the run summary footer carries the
 * D-17 idealized-backtest disclosure.
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

test.describe('BACK-01: select portfolio + range, run, render curve', () => {
  let user: TestUser
  const portfolioIds: string[] = []

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    for (const id of portfolioIds) await cleanupTestPortfolio(id)
    if (user) await cleanupTestUser(user.userId)
  })

  test('runs backtest and renders equity curve + metrics + idealized footer @smoke', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    // SPY + URTH are the curated instruments with correct `instruments.first_date`
    // metadata in the live DB (most other tickers' first_date got stamped at
    // row-creation time and would force defaultParams() to a 1-day window).
    const spy = await getInstrumentIdByTicker('SPY.US')
    const urth = await getInstrumentIdByTicker('URTH.US')
    test.skip(
      !spy || !urth,
      'SPY.US/URTH.US required seeded instruments missing',
    )

    const pf = await createTestPortfolio({
      userId: user.userId,
      name: 'BACK-01 Happy',
      items: [
        { instrument_id: spy!, weight: 60 },
        { instrument_id: urth!, weight: 40 },
      ],
    })
    portfolioIds.push(pf.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/backtest')

    // 1. Setup bar visible
    await expect(page.getByTestId('backtest-setup-bar')).toBeVisible({
      timeout: 15_000,
    })

    // 2. The default-params effect auto-fires a fetch + worker run on mount.
    //    URTH.US constrains earliestAllowedStart to 2012-01-12 so the 10y
    //    default window resolves to (today-10y, today) — a real multi-year
    //    range with valid prices.
    const runsResponse = await page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') && r.request().method() === 'POST',
      { timeout: 75_000 },
    )
    if (!runsResponse.ok()) {
      // eslint-disable-next-line no-console
      console.error(
        'POST /api/backtest/runs FAILED:',
        runsResponse.status(),
        await runsResponse.text(),
      )
    }
    expect(runsResponse.ok()).toBe(true)

    // 3. Equity curve canvas
    const equityChart = page.getByTestId('equity-curve-chart')
    await expect(equityChart).toBeVisible({ timeout: 15_000 })
    await expect(equityChart.locator('canvas').first()).toBeVisible()

    // 4. Metrics strip with exactly 5 stat children
    const strip = page.getByTestId('metrics-strip')
    await expect(strip).toBeVisible()
    await expect(strip.getByTestId('metrics-strip-stat')).toHaveCount(5)

    // 5. Run summary footer contains the D-17 idealized disclosure
    const footer = page.getByTestId('run-summary-footer')
    await expect(footer).toBeVisible()
    await expect(footer).toContainText(/Idealized/i)
  })
})
