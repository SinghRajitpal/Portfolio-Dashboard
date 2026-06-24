/**
 * BACK-05: equity chart renders with crosshair.
 *
 * Hover over the equity chart canvas; verify a tooltip appears with a CHF
 * value and an ISO date. The EquityCurveChart's tooltip is a custom HTML
 * div appended inside the chart container (see src/components/backtest/
 * EquityCurveChart.tsx lines 121-164) so we can query its text content
 * directly.
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

test.describe('BACK-05: equity chart renders with crosshair', () => {
  let user: TestUser
  const portfolioIds: string[] = []

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    for (const id of portfolioIds) await cleanupTestPortfolio(id)
    if (user) await cleanupTestUser(user.userId)
  })

  test('crosshair hover surfaces CHF tooltip with ISO date', async ({ page }) => {
    test.setTimeout(90_000)
    const spy = await getInstrumentIdByTicker('SPY.US')
    const urth = await getInstrumentIdByTicker('URTH.US')
    test.skip(!spy || !urth, 'Required seeded instruments missing')

    const pf = await createTestPortfolio({
      userId: user.userId,
      name: 'BACK-05 Chart',
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

    // Wait for the auto-run on mount to settle.
    await page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') && r.request().method() === 'POST',
      { timeout: 75_000 },
    )

    const equityChart = page.getByTestId('equity-curve-chart')
    await expect(equityChart).toBeVisible({ timeout: 15_000 })
    // The chart's table layout uses two canvases (time + price). Wait for both.
    await expect(equityChart.locator('canvas').first()).toBeVisible()

    // Lightweight-charts attaches one ResizeObserver listener; give layout a tick
    // so the canvas actually has measurable dimensions before mouse hover.
    await page.waitForTimeout(500)

    // Move the cursor over the center of the chart so the crosshair fires.
    const box = await equityChart.boundingBox()
    expect(box).not.toBeNull()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2
    // Two moves — lightweight-charts uses the second pointermove event for
    // the tooltip; the first registers the position only on some platforms.
    await page.mouse.move(cx - 5, cy)
    await page.mouse.move(cx, cy)

    // Tooltip is a custom child <div> inside the chart container that the
    // EquityCurveChart effect appends. It carries `class="absolute …"` and
    // a <strong> with the ISO date + a "Portfolio: CHF …" child div.
    // Target the outer absolute-positioned container to avoid the child-div
    // nesting triggering strict-mode violations.
    const tooltip = equityChart.locator('div.absolute').first()
    await expect(tooltip).toBeVisible({ timeout: 5_000 })
    await expect(tooltip).toContainText(/CHF/i)
    await expect(tooltip).toContainText(/\d{4}-\d{2}-\d{2}/)
  })
})
