import { test, expect } from '@playwright/test'

/**
 * Proves that /api/cron/* is excluded from the proxy matcher.
 *
 * Without the matcher fix, /api/cron/probe would 302/307-redirect to /auth
 * for unauthenticated requests (same as /dashboard). With the fix, it
 * passes through to the route handler and returns 200.
 *
 * Note: The probe folder is named 'probe' not '_probe' — Next.js treats
 * underscore-prefixed folders as private (excluded from routing).
 */
test('GET /api/cron/probe returns 200 when unauthenticated (proxy bypass)', async ({
  request,
}) => {
  const response = await request.fetch('/api/cron/probe', {
    maxRedirects: 0,
  })
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.ok).toBe(true)
})

test('GET /dashboard redirects unauthenticated users to /auth (proxy still protects non-cron routes)', async ({
  request,
}) => {
  const response = await request.fetch('/dashboard', {
    maxRedirects: 0,
  })
  // Next.js 16 proxy uses 307 (Temporary Redirect) for NextResponse.redirect
  expect([302, 307]).toContain(response.status())
  const location = response.headers()['location']
  expect(location).toMatch(/\/auth/)
})
