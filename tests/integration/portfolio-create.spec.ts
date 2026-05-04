import { test, expect } from '@playwright/test'
import {
  cleanupTestUser,
  createTestUser,
  getServiceClient,
  loginTestUser,
  type TestUser,
} from '../helpers/test-portfolio'

/**
 * PORT-01 / PORT-04 / META-01: create portfolio.
 *
 * The combobox hits live /api/instruments/search (Yahoo) so tests use queries
 * that have predictable matches in the seeded `instruments` table or in
 * Yahoo's index (VTI.US, AGG.US are both seeded).
 */
test.describe('PORT-01 / PORT-04 / META-01: create portfolio', () => {
  let user: TestUser
  const portfolioIds: string[] = []

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    const sb = getServiceClient()
    for (const id of portfolioIds) {
      await sb.from('portfolios').delete().eq('id', id)
    }
    if (user) await cleanupTestUser(user.userId)
  })

  test('user can create a portfolio with name + 2 instruments + sum=100 @smoke', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')

    await page.getByRole('button', { name: /New portfolio/i }).click()
    await page.getByRole('menuitem', { name: /^Blank$/i }).click()
    await expect(page).toHaveURL(/\/dashboard\/portfolios\/new/)

    await page.getByLabel(/Name/i).fill('Create Test Portfolio')

    // Add VTI
    await page.getByRole('button', { name: /Add instrument/i }).click()
    await page.getByPlaceholder(/Search ticker/i).fill('VTI')
    // Wait for results and click first matching item
    await page.getByRole('option', { name: /VTI/i }).first().click({
      timeout: 15_000,
    })
    // Wait for the row to appear before adding the next instrument — confirms
    // the popover closed and the form state has the new item.
    await expect(page.getByLabel(/Weight for VTI/i)).toBeVisible({
      timeout: 10_000,
    })

    // Add AGG
    await page.getByRole('button', { name: /Add instrument/i }).click()
    await page.getByPlaceholder(/Search ticker/i).fill('AGG')
    await page.getByRole('option', { name: /AGG/i }).first().click({
      timeout: 15_000,
    })
    await expect(page.getByLabel(/Weight for AGG/i)).toBeVisible({
      timeout: 10_000,
    })

    // Set weights 60 / 40 — match by ticker label so order doesn't matter.
    await page.getByLabel(/Weight for VTI/i).fill('60')
    await page.getByLabel(/Weight for AGG/i).fill('40')

    // Save
    await page.getByRole('button', { name: /^Save$/i }).click()
    await expect(page).toHaveURL(/\/dashboard\/portfolios$/, { timeout: 15_000 })
    await expect(page.getByText('Create Test Portfolio')).toBeVisible()

    // Track for cleanup
    const sb = getServiceClient()
    const { data } = await sb
      .from('portfolios')
      .select('id')
      .eq('user_id', user.userId)
      .eq('name', 'Create Test Portfolio')
      .limit(1)
      .maybeSingle()
    const id = (data as { id: string } | null)?.id
    if (id) portfolioIds.push(id)
  })

  test('Save disabled when sum != 100', async ({ page }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios/new')
    await page.getByLabel(/Name/i).fill('Sum Disabled Probe')

    await page.getByRole('button', { name: /Add instrument/i }).click()
    await page.getByPlaceholder(/Search ticker/i).fill('VTI')
    await page.getByRole('option', { name: /VTI/i }).first().click({
      timeout: 15_000,
    })

    await page.getByRole('button', { name: /Add instrument/i }).click()
    await page.getByPlaceholder(/Search ticker/i).fill('AGG')
    await page.getByRole('option', { name: /AGG/i }).first().click({
      timeout: 15_000,
    })

    const weightInputs = page.getByLabel(/Weight for /i)
    await weightInputs.nth(0).fill('60')
    await weightInputs.nth(1).fill('39') // sum=99

    await expect(page.getByRole('button', { name: /^Save$/i })).toBeDisabled()
  })

  test('Normalize-to-100 rescales weights', async ({ page }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios/new')
    await page.getByLabel(/Name/i).fill('Normalize Probe')

    await page.getByRole('button', { name: /Add instrument/i }).click()
    await page.getByPlaceholder(/Search ticker/i).fill('VTI')
    await page.getByRole('option', { name: /VTI/i }).first().click({
      timeout: 15_000,
    })

    await page.getByRole('button', { name: /Add instrument/i }).click()
    await page.getByPlaceholder(/Search ticker/i).fill('AGG')
    await page.getByRole('option', { name: /AGG/i }).first().click({
      timeout: 15_000,
    })

    const weightInputs = page.getByLabel(/Weight for /i)
    await weightInputs.nth(0).fill('30')
    await weightInputs.nth(1).fill('30') // sum = 60

    await page.getByRole('button', { name: /Normalize to 100%/i }).click()

    // Each weight should now be 50 (60 normalized to 100)
    await expect(weightInputs.nth(0)).toHaveValue('50')
    await expect(weightInputs.nth(1)).toHaveValue('50')
  })

  test('Investment amount displays formatted CHF helper text', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios/new')

    const amount = page.getByLabel(/Investment amount/i)
    await expect(amount).toHaveValue('10000')
    // Helper text uses Intl.NumberFormat('de-CH') — Swiss apostrophe (U+2019) groups
    await expect(page.getByText(/CHF\s*10[’']000/)).toBeVisible()
  })
})
