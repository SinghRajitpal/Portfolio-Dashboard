import { test, expect, type Route } from '@playwright/test'
import path from 'node:path'
import {
  cleanupTestUser,
  createTestUser,
  getServiceClient,
  loginTestUser,
  type TestUser,
} from '../helpers/test-portfolio'

/**
 * PORT-08: CSV import.
 *
 * Most flows hit live /api/instruments/csv-resolve against the seeded DB
 * (VTI.US, AGG.US live in the v1 seed). The "ambiguous" case is exercised
 * via Playwright route interception because the production schema has
 * UNIQUE(ticker) — we cannot seed two synthetic same-ticker rows without
 * a destructive schema change. The mock keeps the test free of DB cleanup.
 */
test.describe('PORT-08: CSV import', () => {
  let user: TestUser
  const portfolioIds: string[] = []
  const fixtures = (name: string) =>
    path.resolve(__dirname, `../fixtures/portfolio-imports/${name}`)

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

  test('Well-formed CSV → preview → save creates a user portfolio @smoke', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')

    await page.getByRole('button', { name: /New portfolio/i }).click()
    await page.getByRole('menuitem', { name: /^Import CSV$/i }).click()

    // Dialog open
    await expect(page.getByText(/Import portfolio from CSV/i)).toBeVisible()

    await page.getByLabel(/CSV file/i).setInputFiles(fixtures('well-formed.csv'))
    await expect(page.getByText(/Parsed 2 rows/i)).toBeVisible()

    await page.getByRole('button', { name: /^Continue$/i }).click()

    // Lands on preview page
    await expect(page).toHaveURL(/\/dashboard\/portfolios\/new\?from=csv/, {
      timeout: 15_000,
    })

    // Builder pre-filled with VTI.US 60 + AGG.US 40
    await expect(page.getByLabel(/Weight for VTI\.US/i)).toHaveValue('60', {
      timeout: 10_000,
    })
    await expect(page.getByLabel(/Weight for AGG\.US/i)).toHaveValue('40')

    // Investment amount default 10000 with Swiss apostrophe formatting
    await expect(page.getByLabel(/Investment amount/i)).toHaveValue('10000')
    await expect(page.getByText(/CHF\s*10[’']000/).first()).toBeVisible()

    // Name + save
    await page.getByLabel(/Name/i).fill('CSV Imported Portfolio')
    await page
      .getByRole('button', { name: /Save imported portfolio/i })
      .click()

    await expect(page).toHaveURL(/\/dashboard\/portfolios$/, {
      timeout: 15_000,
    })
    await expect(page.getByText('CSV Imported Portfolio')).toBeVisible()

    const sb = getServiceClient()
    const { data } = await sb
      .from('portfolios')
      .select('id, user_id, is_template')
      .eq('user_id', user.userId)
      .eq('name', 'CSV Imported Portfolio')
      .limit(1)
      .maybeSingle()
    const row = data as
      | { id: string; user_id: string; is_template: boolean }
      | null
    expect(row).not.toBeNull()
    expect(row?.is_template).toBe(false)
    expect(row?.user_id).toBe(user.userId)
    if (row?.id) portfolioIds.push(row.id)
  })

  test('CSV with explicit exchange resolves to the requested venue', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')

    await page.getByRole('button', { name: /New portfolio/i }).click()
    await page.getByRole('menuitem', { name: /^Import CSV$/i }).click()

    await page
      .getByLabel(/CSV file/i)
      .setInputFiles(fixtures('with-exchange.csv'))
    await page.getByRole('button', { name: /^Continue$/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/portfolios\/new\?from=csv/, {
      timeout: 15_000,
    })

    // No ambiguity banner — both rows resolved unambiguously to .US listings.
    await expect(page.getByLabel(/Weight for VTI\.US/i)).toHaveValue('50', {
      timeout: 10_000,
    })
    await expect(page.getByLabel(/Weight for AGG\.US/i)).toHaveValue('50')
    await expect(
      page.getByText(/rows? need[s]? attention/i),
    ).not.toBeVisible()
  })

  test('Ambiguous CSV requires user pick (mocked resolve)', async ({
    page,
  }) => {
    // Intercept the batch-resolve POST and return a synthetic ambiguous
    // payload. Real DB has UNIQUE(ticker), so we cannot seed two
    // same-ticker rows; route interception keeps the test schema-pure.
    await page.route('**/api/instruments/csv-resolve', async (route: Route) => {
      const body = JSON.parse(route.request().postData() ?? '{}') as {
        rows?: { ticker: string }[]
      }
      if (body.rows?.some((r) => r.ticker === 'TESTAMB')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            resolved: [
              {
                ticker: 'TESTAMB',
                weight: 100,
                status: 'ambiguous',
                alternatives: [
                  {
                    id: '11111111-1111-1111-1111-111111111111',
                    ticker: 'TESTAMB',
                    name: 'Test Ambiguous (US)',
                    exchange: 'US',
                    currency: 'USD',
                    expense_ratio: 0.001,
                    dividend_yield: 0.02,
                    isin: null,
                    type: 'etf',
                  },
                  {
                    id: '22222222-2222-2222-2222-222222222222',
                    ticker: 'TESTAMB',
                    name: 'Test Ambiguous (XETRA)',
                    exchange: 'XETRA',
                    currency: 'EUR',
                    expense_ratio: 0.001,
                    dividend_yield: 0.02,
                    isin: null,
                    type: 'etf',
                  },
                ],
              },
            ],
          }),
        })
        return
      }
      await route.continue()
    })

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')

    await page.getByRole('button', { name: /New portfolio/i }).click()
    await page.getByRole('menuitem', { name: /^Import CSV$/i }).click()
    await page
      .getByLabel(/CSV file/i)
      .setInputFiles(fixtures('ambiguous-no-exchange.csv'))
    await page.getByRole('button', { name: /^Continue$/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/portfolios\/new\?from=csv/, {
      timeout: 15_000,
    })

    // Banner present, builder hidden until pick
    await expect(page.getByText(/1 row needs attention/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.getByRole('button', { name: /Save imported portfolio/i }),
    ).toHaveCount(0)

    // Pick the US listing — base-ui Select renders the trigger as a
    // role="combobox" element (not button), so target by aria-label directly.
    await page
      .getByRole('combobox', { name: /Pick listing for TESTAMB/i })
      .click()
    await page.getByRole('option', { name: /US.*USD.*Test Ambiguous/i }).click()

    // Banner clears, builder appears with the row
    await expect(page.getByText(/rows? need[s]? attention/i)).not.toBeVisible()
    await expect(page.getByLabel(/Weight for TESTAMB/i)).toHaveValue('100', {
      timeout: 10_000,
    })
  })

  test('Malformed CSV surfaces row-level parse errors', async ({ page }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')

    await page.getByRole('button', { name: /New portfolio/i }).click()
    await page.getByRole('menuitem', { name: /^Import CSV$/i }).click()
    await page
      .getByLabel(/CSV file/i)
      .setInputFiles(fixtures('malformed.csv'))

    // Errors visible inside the dialog
    await expect(page.getByText(/Parse errors/i)).toBeVisible()
    // The non-numeric weight row "VTI.US,sixty" must produce a parse error
    await expect(page.getByText(/weight/i).first()).toBeVisible()

    // Continue should be disabled — the only "valid" row would be the
    // empty-ticker one, which fails Zod, so rows[].length === 0 and the
    // button stays disabled.
    await expect(page.getByRole('button', { name: /^Continue$/i })).toBeDisabled()
  })

  test('Unresolved ticker shows inline search affordance', async ({
    page,
  }) => {
    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/portfolios')

    await page.getByRole('button', { name: /New portfolio/i }).click()
    await page.getByRole('menuitem', { name: /^Import CSV$/i }).click()
    await page
      .getByLabel(/CSV file/i)
      .setInputFiles(fixtures('unresolved.csv'))
    await page.getByRole('button', { name: /^Continue$/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/portfolios\/new\?from=csv/, {
      timeout: 15_000,
    })

    // ZZNOTREAL has no match; the banner exposes an InstrumentCombobox
    await expect(page.getByText(/1 row needs attention/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.getByRole('button', { name: /Add instrument/i }),
    ).toBeVisible()
  })
})
