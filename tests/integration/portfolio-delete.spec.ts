import { test, expect } from '@playwright/test'
import {
  cleanupTestUser,
  createTestPortfolio,
  createTestUser,
  getInstrumentIdByTicker,
  getServiceClient,
  loginTestUser,
  type TestUser,
} from '../helpers/test-portfolio'

/**
 * PORT-01: delete portfolio.
 */
test.describe('PORT-01: delete portfolio', () => {
  let user: TestUser

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    if (user) await cleanupTestUser(user.userId)
  })

  test('Cancel keeps the portfolio; only Confirm deletes', async ({ page }) => {
    const vti = await getInstrumentIdByTicker('VTI.US')
    test.skip(!vti, 'VTI.US not seeded')
    const seeded = await createTestPortfolio({
      userId: user.userId,
      name: 'Cancel Delete Target',
      items: [{ instrument_id: vti!, weight: 100 }],
    })

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')
    await expect(page.getByText('Cancel Delete Target')).toBeVisible()

    // Open AlertDialog
    await page.getByRole('button', { name: /Delete Cancel Delete Target/i }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(
      page.getByRole('alertdialog').getByText(/Cancel Delete Target/i),
    ).toBeVisible()

    // Click Cancel inside the dialog
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Cancel$/i })
      .click()

    // Wait for the dialog to close before re-asserting on the row.
    await expect(page.getByRole('alertdialog')).toHaveCount(0, {
      timeout: 5_000,
    })

    // Portfolio still in list (row is unique now that the dialog is gone)
    await expect(
      page.getByTestId('portfolios-list').getByText('Cancel Delete Target'),
    ).toBeVisible()

    // Cleanup
    const sb = getServiceClient()
    await sb.from('portfolios').delete().eq('id', seeded.id)
  })

  test('Confirm delete removes the row @smoke', async ({ page }) => {
    const vti = await getInstrumentIdByTicker('VTI.US')
    test.skip(!vti, 'VTI.US not seeded')
    const seeded = await createTestPortfolio({
      userId: user.userId,
      name: 'Confirm Delete Target',
      items: [{ instrument_id: vti!, weight: 100 }],
    })

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')
    await expect(page.getByText('Confirm Delete Target')).toBeVisible()

    // Open AlertDialog
    await page.getByRole('button', { name: /Delete Confirm Delete Target/i }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    // Click destructive Delete inside dialog
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Delete$/i })
      .click()

    // Row gone from list
    await expect(page.getByText('Confirm Delete Target')).toHaveCount(0, {
      timeout: 5_000,
    })

    // FK cascade verification: portfolio_instruments rows for this portfolio are gone
    const sb = getServiceClient()
    const { data: pi } = await sb
      .from('portfolio_instruments')
      .select('portfolio_id')
      .eq('portfolio_id', seeded.id)
    expect((pi ?? []).length).toBe(0)
  })
})
