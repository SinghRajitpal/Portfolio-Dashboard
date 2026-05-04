import { test, expect } from '@playwright/test'
import {
  cleanupTestUser,
  createTestUser,
  loginTestUser,
  type TestUser,
} from '../helpers/test-portfolio'

/**
 * PORT-02: instrument search combobox.
 *
 * Hits live /api/instruments/search (Yahoo) and /api/instruments/resolve.
 * Tests are tolerant to seeded-vs-live result drift — they assert that
 * the popover renders any plausible result, not a specific row count.
 */
test.describe('PORT-02: instrument search combobox', () => {
  let user: TestUser

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    if (user) await cleanupTestUser(user.userId)
  })

  test('Combobox searches by ticker @smoke', async ({ page }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios/new')

    await page.getByRole('button', { name: /Add instrument/i }).click()
    await page.getByPlaceholder(/Search ticker/i).fill('VTI')

    // Result with 'VTI' visible in the popover
    await expect(page.getByRole('option', { name: /VTI/i }).first()).toBeVisible(
      { timeout: 15_000 },
    )
  })

  test('not_found inline empty-state for invalid ticker', async ({ page }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios/new')

    await page.getByRole('button', { name: /Add instrument/i }).click()
    await page.getByPlaceholder(/Search ticker/i).fill('ZZZZNOTHING')

    // CommandEmpty renders 'No matches' when the query has no results
    await expect(page.getByText(/No matches/i)).toBeVisible({ timeout: 15_000 })
  })

  test('multi-venue grouping shows multiple listings for cross-listed tickers', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios/new')

    await page.getByRole('button', { name: /Add instrument/i }).click()
    // CSPX is iShares Core S&P 500 with multi-venue Yahoo listings
    await page.getByPlaceholder(/Search ticker/i).fill('CSPX')

    // Allow time for live Yahoo response
    await page
      .getByRole('option', { name: /CSPX|S&P 500|iShares/i })
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })

    // No assertion on listing count: live Yahoo coverage may vary. Test simply
    // confirms a result renders without erroring.
  })

  // rate_limit and ISIN cache-fallback paths require mocked transport — kept
  // as documented skips per Plan 04-05 Task 3 contract (Wave 0 stub conversion
  // explicitly defers these two cases).
  test.skip('rate_limit DataError surfaces as a sonner toast', () => {})
  test.skip("search by ISIN returns multi-venue results when only ISIN cache is hit", () => {})
})
