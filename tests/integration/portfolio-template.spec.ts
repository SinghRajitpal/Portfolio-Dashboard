import { test, expect } from '@playwright/test'
import {
  cleanupTestUser,
  createTestUser,
  getServiceClient,
  loginTestUser,
  type TestUser,
} from '../helpers/test-portfolio'

/**
 * PORT-07: template pre-fill.
 */
test.describe('PORT-07: template pre-fill', () => {
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

  test('From template dialog lists 3 seeded templates', async ({ page }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')

    // Open dropdown menu
    await page.getByRole('button', { name: /New portfolio/i }).click()
    await page.getByRole('menuitem', { name: /From template/i }).click()

    // Dialog with three templates
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Classic 60/40')).toBeVisible()
    await expect(dialog.getByText('All-World')).toBeVisible()
    await expect(dialog.getByText(/All-Weather/)).toBeVisible()
  })

  test('Selecting a template pre-fills builder with [name] (copy) @smoke', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')
    await page.getByRole('button', { name: /New portfolio/i }).click()
    await page.getByRole('menuitem', { name: /From template/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByText('Classic 60/40').click()

    // URL becomes /new?seed=<id>
    await expect(page).toHaveURL(/\/dashboard\/portfolios\/new\?seed=/)

    // Builder pre-filled with copy suffix
    await expect(page.getByLabel(/Name/i)).toHaveValue('Classic 60/40 (copy)')
    // Investment amount default 10000
    await expect(page.getByLabel(/Investment amount/i)).toHaveValue('10000')
  })

  test('Template-seeded save persists as a user portfolio (is_template=false)', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios/new?seed=00000000-0000-0000-0000-000000000060')

    await expect(page.getByLabel(/Name/i)).toHaveValue('Classic 60/40 (copy)')
    // Save without changes
    await page.getByRole('button', { name: /^Save$/i }).click()

    // Redirect to list
    await expect(page).toHaveURL(/\/dashboard\/portfolios$/, { timeout: 15_000 })
    await expect(page.getByText('Classic 60/40 (copy)')).toBeVisible()

    // Service-client verification: row is user-owned, not a template
    const sb = getServiceClient()
    const { data } = await sb
      .from('portfolios')
      .select('id, user_id, is_template, name')
      .eq('user_id', user.userId)
      .eq('name', 'Classic 60/40 (copy)')
    const rows = (data ?? []) as Array<{
      id: string
      user_id: string
      is_template: boolean
      name: string
    }>
    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0]
    expect(row.is_template).toBe(false)
    expect(row.user_id).toBe(user.userId)
    portfolioIds.push(row.id)
  })
})
