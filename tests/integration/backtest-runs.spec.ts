/**
 * D-08: identical-input run dedupes on inputs_hash.
 *
 * The POST /api/backtest/runs route returns `{ id, deduped }`. The first
 * run with a given (portfolio_id, inputs_hash) pair returns deduped:false;
 * a subsequent identical-input POST hits the UNIQUE constraint on
 * (portfolio_id, inputs_hash) and returns deduped:true with the same id.
 *
 * We trigger the first run on page mount (auto-run) and the second by
 * clicking the explicit Run button — which the BacktestClient handler
 * implements as a force-heavy refetch (clears `lastHeavyParamsRef`).
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

test.describe('D-08: identical-input run dedupes on inputs_hash', () => {
  let user: TestUser
  const portfolioIds: string[] = []

  test.beforeAll(async () => {
    user = await createTestUser()
  })

  test.afterAll(async () => {
    for (const id of portfolioIds) await cleanupTestPortfolio(id)
    if (user) await cleanupTestUser(user.userId)
  })

  test('first run writes new row; second identical-input run returns deduped', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const spy = await getInstrumentIdByTicker('SPY.US')
    const urth = await getInstrumentIdByTicker('URTH.US')
    test.skip(!spy || !urth, 'Required seeded instruments missing')

    const pf = await createTestPortfolio({
      userId: user.userId,
      name: 'D-08 Dedup',
      items: [
        { instrument_id: spy!, weight: 60 },
        { instrument_id: urth!, weight: 40 },
      ],
    })
    portfolioIds.push(pf.id)

    await loginTestUser(page, { email: user.email, password: user.password })
    await page.goto('/dashboard/backtest')

    // First run — auto-triggered by mount.
    const firstResp = await page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') && r.request().method() === 'POST',
      { timeout: 75_000 },
    )
    expect(firstResp.ok()).toBe(true)
    const firstBody = (await firstResp.json()) as { id: string; deduped: boolean }
    expect(firstBody.deduped).toBe(false)
    expect(firstBody.id).toMatch(/^[0-9a-f-]{36}$/)

    // Second run — click the Run button without changing any params.
    // The BacktestClient handler force-clears lastHeavyParamsRef so the
    // heavy effect refires; same inputs → same inputs_hash → server dedupes.
    //
    // Allow a short settle window before the click so the SSR Supabase
    // session cookies are fully flushed by the dev-server response cycle;
    // back-to-back POSTs were observed to occasionally hit an RLS transient
    // (503 "new row violates row-level security policy") in the dev
    // environment.
    await page.waitForTimeout(500)
    const secondPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/backtest/runs') && r.request().method() === 'POST',
      { timeout: 75_000 },
    )
    // The button reads "Run" when idle and "Running…" while loading; match
    // by aria-label which is stable across both states.
    const runButton = page.getByRole('button', { name: 'Run backtest' })
    // Wait until idle (not disabled) before clicking — otherwise the click
    // is ignored.
    await expect(runButton).toBeEnabled({ timeout: 30_000 })
    await runButton.click()
    const secondResp = await secondPromise
    if (!secondResp.ok()) {
      // eslint-disable-next-line no-console
      console.error(
        'Second runs POST failed:',
        secondResp.status(),
        await secondResp.text(),
      )
    }
    expect(secondResp.ok()).toBe(true)
    const secondBody = (await secondResp.json()) as {
      id: string
      deduped: boolean
    }
    expect(secondBody.deduped).toBe(true)
    expect(secondBody.id).toBe(firstBody.id)
  })
})
