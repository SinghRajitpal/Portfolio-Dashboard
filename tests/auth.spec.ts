/**
 * Auth e2e tests for PortfolioForge
 *
 * PREREQUISITE: Local Supabase must be running before executing these tests.
 * Start with: npx supabase start
 * Reset DB before runs: npx supabase db reset
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

test.describe('Auth flow', () => {
  const timestamp = Date.now()
  const testEmail = `test+${timestamp}@example.com`
  const testPassword = 'testpass123'

  test('landing page renders hero', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('PortfolioForge')
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign Up' })).toBeVisible()
  })

  test('sign up creates account and redirects to dashboard', async ({ page }) => {
    await signUp(page, testEmail, testPassword)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    await expect(page.locator('h1')).toContainText('Welcome')
  })

  test('session persists after page refresh', async ({ page }) => {
    // Sign in first
    await signIn(page, testEmail, testPassword)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    // Reload and verify still on dashboard
    await page.reload()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('h1')).toContainText('Welcome')
  })

  test('sign out redirects to landing page', async ({ page }) => {
    // Sign in
    await signIn(page, testEmail, testPassword)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    // Sign out
    await page.getByRole('button', { name: 'Sign Out' }).click()
    await expect(page).toHaveURL('/', { timeout: 10_000 })

    // Attempt to visit dashboard — should redirect to /auth
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 })
  })

  test('unauthenticated user is redirected from dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 })
  })

  test('sign in with invalid credentials shows error', async ({ page }) => {
    await page.goto('/auth?tab=signin')
    await page.fill('#signin-email', 'nonexistent@example.com')
    await page.fill('#signin-password', 'wrongpassword')
    await page.click('button[type="submit"]')
    // Error text rendered below password field
    await expect(page.locator('p.text-destructive')).toBeVisible({ timeout: 10_000 })
  })
})
