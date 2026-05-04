import { defineConfig, devices } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'
import path from 'node:path'

// Load .env.local before tests run so helpers (test-portfolio.ts) that
// require service-role credentials can read process.env directly. Without
// this, Playwright workers spawn with a clean env even though the dev
// server inherits .env.local from Next.js.
loadDotenv({ path: path.resolve(__dirname, '.env.local') })

/**
 * Playwright configuration for PortfolioForge e2e tests.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  // Exclude vitest unit tests from Playwright's discovery — they import vitest
  // which is not loadable from a CommonJS context. Playwright should only
  // pick up *.spec.ts files (e2e + integration).
  testMatch: /.*\.spec\.ts$/,
  testIgnore: ['**/unit/**', '**/node_modules/**'],
  timeout: 30_000,
  retries: 0,
  workers: 1,

  /* Reporter to use */
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run the local dev server before tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
