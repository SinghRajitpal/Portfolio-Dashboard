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
// Plan 5-07 Task 0: pre-spec hook that asserts env vars + seeds snb_rates.
// Both CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY are required by the
// backtest-* specs (the stale-on-view spec mutates `prices.created_at`
// directly via the service-role client — see _setup/backtest-prereqs.ts
// for the full rationale).
const backtestPrereqs = path.resolve(
  __dirname,
  './tests/integration/_setup/backtest-prereqs.ts',
)

export default defineConfig({
  testDir: './tests',
  // Exclude vitest unit tests from Playwright's discovery — they import vitest
  // which is not loadable from a CommonJS context. Playwright should only
  // pick up *.spec.ts files (e2e + integration).
  testMatch: /.*\.spec\.ts$/,
  testIgnore: ['**/unit/**', '**/node_modules/**'],
  timeout: 60_000,
  retries: 0,
  workers: 1,

  /* Reporter to use */
  reporter: 'list',

  // Run Task-0 prerequisites once before any spec (env-var assertion + SNB
  // seed). Idempotent — re-running is a no-op when snb_rates is populated.
  globalSetup: backtestPrereqs,

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

  /* Run the local dev server before tests.
   *
   * Plan 5-07 env note: this worktree's `node_modules` ships without the
   * native `@next/swc-darwin-arm64` binary (#3097-adjacent constraint —
   * flagged in 05-03, 05-04, 05-06 SUMMARYs). Playwright will reuse an
   * existing dev server (reuseExistingServer:true), so the recommended
   * workflow is:
   *   1. Install @next/swc-wasm-nodejs@<next-version>
   *   2. `NEXT_TEST_WASM_DIR=$(pwd)/node_modules/@next/swc-wasm-nodejs \
   *       npx next dev --webpack` in a separate shell
   *   3. `npm run test:integration` (Playwright picks up the running server)
   * If no server is running, this `npm run dev` will try Turbopack and fail
   * fast — the worktree's expected mode of operation is server-already-up.
   */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
