/**
 * BACK-08: annual bars render.
 *
 * After running a backtest with span > 1 year the annual-returns chart
 * canvas is visible. When a benchmark is selected, a second (benchmark)
 * histogram appears below the portfolio histogram per RESEARCH Pattern 3
 * recommendation (a) — two stacked charts.
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

test.describe('BACK-08: annual bars render', () => {
  let user: TestUser
  const portfolioIds: string[] = []

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    for (const id of portfolioIds) await cleanupTestPortfolio(id)
    if (user) await cleanupTestUser(user.userId)
  })

  test('renders annual-returns chart and adds benchmark sub-chart on overlay', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const spy = await getInstrumentIdByTicker('SPY.US')
    const urth = await getInstrumentIdByTicker('URTH.US')
    test.skip(!spy || !urth, 'Required seeded instruments missing')

    const pf = await createTestPortfolio({
      userId: user.userId,
      name: 'BACK-08 Annual',
      items: [
        { instrument_id: spy!, weight: 60 },
        { instrument_id: urth!, weight: 40 },
      ],
    })
    portfolioIds.push(pf.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/backtest')

    // Wait for the default 10-year run to settle (spans well over 1 year).
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') && r.request().method() === 'POST',
      { timeout: 75_000 },
    )

    const annual = page.getByTestId('annual-returns-chart')
    await expect(annual).toBeVisible({ timeout: 15_000 })
    // Portfolio sub-chart canvas always present; benchmark only when overlay on.
    await expect(page.getByTestId('annual-returns-chart-portfolio')).toBeVisible()
    await expect(page.getByTestId('annual-returns-chart-benchmark')).toHaveCount(0)

    // Switch on a benchmark; expect the second (benchmark) histogram canvas
    // to render below the portfolio one.
    await page.getByTestId('backtest-benchmark-select').click()
    await page.getByRole('option', { name: /SWDA\.LSE/i }).click()
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') &&
        r.request().method() === 'POST' &&
        (r.request().postData() ?? '').includes('"benchmark_ticker":"SWDA.LSE"'),
      { timeout: 75_000 },
    )

    await expect(
      page.getByTestId('annual-returns-chart-benchmark'),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByTestId('annual-returns-chart-benchmark').locator('canvas').first(),
    ).toBeVisible()
  })
})
