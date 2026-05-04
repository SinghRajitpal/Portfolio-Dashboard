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
 * PORT-01: list portfolios.
 *
 * Each test creates its own user via the service-role helper so suites stay
 * isolated. The cleanup hook removes the user, which cascades through
 * portfolios + portfolio_instruments via FK.
 */
test.describe('PORT-01: list portfolios', () => {
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

  test('empty state shows centered message and inline create link', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')
    await expect(page.getByTestId('portfolios-empty-state')).toBeVisible()
    await expect(
      page.getByRole('link', { name: /create your first portfolio/i }),
    ).toBeVisible()
  })

  test('Non-empty list shows borderless rows with metrics @smoke', async ({
    page,
  }) => {
    const vti = await getInstrumentIdByTicker('VTI.US')
    const agg = await getInstrumentIdByTicker('AGG.US')
    test.skip(!vti || !agg, 'Required seeded instruments missing')

    const a = await createTestPortfolio({
      userId: user.userId,
      name: 'List Test Alpha',
      items: [
        { instrument_id: vti!, weight: 60 },
        { instrument_id: agg!, weight: 40 },
      ],
    })
    const b = await createTestPortfolio({
      userId: user.userId,
      name: 'List Test Beta',
      items: [{ instrument_id: vti!, weight: 100 }],
    })
    portfolioIds.push(a.id, b.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')

    const list = page.getByTestId('portfolios-list')
    await expect(list).toBeVisible()
    await expect(list.getByText('List Test Alpha')).toBeVisible()
    await expect(list.getByText('List Test Beta')).toBeVisible()
  })

  test('templates are NOT shown in user portfolio list', async ({ page }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')
    // listPortfolios filters is_template=false. Confirm by name.
    const list = page.getByTestId('portfolios-list')
    await expect(list).toBeVisible()
    await expect(list.getByText(/^Classic 60\/40$/)).toHaveCount(0)
    await expect(list.getByText(/^All-World$/)).toHaveCount(0)
    await expect(list.getByText(/^All-Weather/)).toHaveCount(0)
  })

  test('clicking a row navigates to edit', async ({ page }) => {
    const vti = await getInstrumentIdByTicker('VTI.US')
    test.skip(!vti, 'VTI.US not seeded')
    const c = await createTestPortfolio({
      userId: user.userId,
      name: 'Click Nav Target',
      items: [{ instrument_id: vti!, weight: 100 }],
    })
    portfolioIds.push(c.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')
    await page
      .getByTestId('portfolios-list')
      .getByRole('link', { name: /Click Nav Target/i })
      .click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/portfolios/${c.id}/edit`))
  })
})
