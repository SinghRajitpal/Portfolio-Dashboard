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

/**
 * PORT-01: edit portfolio.
 */
test.describe('PORT-01: edit portfolio', () => {
  let user: TestUser
  const portfolioIds: string[] = []

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    for (const id of portfolioIds) {
      await cleanupTestPortfolio(id)
    }
    if (user) await cleanupTestUser(user.userId)
  })

  test('user can edit name and weight @smoke', async ({ page }) => {
    const vti = await getInstrumentIdByTicker('VTI.US')
    const agg = await getInstrumentIdByTicker('AGG.US')
    test.skip(!vti || !agg, 'Required instruments not seeded')
    const seeded = await createTestPortfolio({
      userId: user.userId,
      name: 'Edit Target',
      items: [
        { instrument_id: vti!, weight: 60 },
        { instrument_id: agg!, weight: 40 },
      ],
    })
    portfolioIds.push(seeded.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto(`/dashboard/portfolios/${seeded.id}/edit`)

    // Pre-fill assertions
    await expect(page.getByLabel(/Name/i)).toHaveValue('Edit Target')

    // Rename
    await page.getByLabel(/Name/i).fill('Edit Target Renamed')

    // Adjust weights: 60 → 70, 40 → 30
    const weightInputs = page.getByLabel(/Weight for /i)
    await weightInputs.nth(0).fill('70')
    await weightInputs.nth(1).fill('30')

    // Save
    await page
      .getByRole('button', { name: /Save changes/i })
      .click()

    // Redirected to list
    await expect(page).toHaveURL(/\/dashboard\/portfolios$/, { timeout: 15_000 })
    await expect(page.getByText('Edit Target Renamed')).toBeVisible()

    // Re-open edit and confirm persistence
    await page.goto(`/dashboard/portfolios/${seeded.id}/edit`)
    await expect(page.getByLabel(/Name/i)).toHaveValue('Edit Target Renamed')
    await expect(weightInputs.nth(0)).toHaveValue('70')
    await expect(weightInputs.nth(1)).toHaveValue('30')
  })

  test('Save disabled when sum != 100', async ({ page }) => {
    const vti = await getInstrumentIdByTicker('VTI.US')
    const agg = await getInstrumentIdByTicker('AGG.US')
    test.skip(!vti || !agg, 'Required instruments not seeded')
    const seeded = await createTestPortfolio({
      userId: user.userId,
      name: 'Sum Validation Target',
      items: [
        { instrument_id: vti!, weight: 60 },
        { instrument_id: agg!, weight: 40 },
      ],
    })
    portfolioIds.push(seeded.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto(`/dashboard/portfolios/${seeded.id}/edit`)

    const weightInputs = page.getByLabel(/Weight for /i)
    await weightInputs.nth(0).fill('60')
    await weightInputs.nth(1).fill('39') // sum 99

    const saveBtn = page.getByRole('button', { name: /Save changes/i })
    await expect(saveBtn).toBeDisabled()
  })
})
