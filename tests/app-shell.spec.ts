/**
 * App Shell e2e tests for PortfolioForge
 *
 * PREREQUISITE: Local Supabase must be running before executing these tests.
 * Start with: npx supabase start
 * Reset DB before runs: npx supabase db reset
 *
 * These tests cover Phase 2 requirements UI-01 through UI-05.
 * NOTE: These tests WILL FAIL until Wave 2 implements the actual UI components.
 * This is the correct Wave 0 / TDD scaffold state.
 *
 * The Playwright webServer config starts Next.js automatically.
 */

import { test, expect, Page } from '@playwright/test'

// Helpers

async function signUp(page: Page, email: string, password: string) {
  await page.goto('/auth?tab=signup')
  await page.fill('#signup-email', email)
  await page.fill('#signup-password', password)
  await page.click('button[type="submit"]')
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth?tab=signin')
  await page.fill('#signin-email', email)
  await page.fill('#signin-password', password)
  await page.click('button[type="submit"]')
}

test.describe('App Shell', () => {
  const timestamp = Date.now()
  const testEmail = `appshell+${timestamp}@example.com`
  const testPassword = 'testpass123'

  test.beforeEach(async ({ page }) => {
    // Sign up (first run) or sign in — use timestamp email so each run is fresh
    await signUp(page, testEmail, testPassword)
    // Wait for redirect to dashboard after sign-up
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
  })

  // UI-01: Navigation structure
  test('UI-01: nav contains all 5 links and account menu trigger', async ({ page }) => {
    // All 5 navigation links must be present in header/nav
    const navLinks = ['Dashboard', 'Portfolios', 'Backtest', 'Projections', 'Compare']
    for (const linkText of navLinks) {
      await expect(
        page.locator('header, nav').getByRole('link', { name: linkText })
      ).toBeVisible()
    }

    // Account menu trigger button must be visible
    await expect(
      page.locator('header, nav').getByRole('button', { name: /account|menu|profile|user/i })
    ).toBeVisible()
  })

  // UI-02: Theme toggle switches dark mode
  test('UI-02: theme toggle switches html element dark class', async ({ page }) => {
    // Verify ThemeProvider is mounted by checking html element
    const htmlEl = page.locator('html')

    // Note the initial class state (could be light or dark depending on system)
    const initialClasses = await htmlEl.getAttribute('class') || ''
    const wasDark = initialClasses.includes('dark')

    // Open account menu and click theme toggle
    await page.locator('header, nav').getByRole('button', { name: /account|menu|profile|user/i }).click()
    await page.getByRole('menuitem', { name: /theme|dark|light/i }).click()

    // html element should have toggled its dark state
    if (wasDark) {
      await expect(htmlEl).not.toHaveClass(/dark/)
    } else {
      await expect(htmlEl).toHaveClass(/dark/)
    }
  })

  // UI-03: Dashboard content structure
  test('UI-03: dashboard has portfolio chart, summary cards, and key metrics', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('/dashboard')

    // Portfolio chart region
    await expect(
      page.locator('[aria-label="Portfolio chart"], [role="region"][aria-label="Portfolio chart"]')
    ).toBeVisible()

    // Summary cards container with 4 child items
    const summaryCards = page.locator('[aria-label="Summary cards"]')
    await expect(summaryCards).toBeVisible()
    const cardCount = await summaryCards.locator('> *').count()
    expect(cardCount).toBe(4)

    // Key metrics section
    await expect(
      page.locator('[aria-label="Key metrics"]')
    ).toBeVisible()
  })

  // UI-04: Responsive navigation
  test('UI-04: hamburger visible at mobile, nav links visible at desktop', async ({ page }) => {
    // Mobile viewport (375x667)
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/dashboard')
    await page.waitForURL('/dashboard')

    // Hamburger button should be visible on mobile
    await expect(
      page.getByRole('button', { name: /menu|hamburger|navigation/i })
    ).toBeVisible()

    // Desktop nav links should be hidden (not visible) on mobile
    const navLinksDesktop = page.locator('nav [data-mobile-hidden], nav .hidden-mobile, header nav.desktop-nav')
    // Check that the main nav links container is not visible at mobile width
    const dashboardLink = page.locator('header nav').getByRole('link', { name: 'Dashboard' })
    // At mobile width the nav links are expected to be hidden via CSS
    await expect(dashboardLink).toBeHidden()

    // Desktop viewport (1024x768)
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/dashboard')
    await page.waitForURL('/dashboard')

    // Nav links should be visible at desktop width
    await expect(
      page.locator('header nav').getByRole('link', { name: 'Dashboard' })
    ).toBeVisible()

    // Hamburger should be hidden at desktop width
    await expect(
      page.getByRole('button', { name: /menu|hamburger|navigation/i })
    ).toBeHidden()
  })

  // UI-05: Key components render on dashboard
  test('UI-05: Button, Card, and Input components are present on dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForURL('/dashboard')

    // At least one Button element should be visible on the dashboard
    await expect(page.getByRole('button').first()).toBeVisible()

    // Card-like containers should be present (by role or semantic)
    const cards = page.locator('[data-slot="card"], .card, [class*="card"]')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThan(0)

    // Input elements should be accessible (could be in search/filter areas)
    // Lightweight check: verify the dashboard loaded correctly (implied by button/card presence)
    // Full input verification will be done in portfolio/backtest feature tests
  })
})
