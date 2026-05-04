import { test } from '@playwright/test'

test.describe('PORT-02: instrument search combobox', () => {
  test.skip('search by ticker returns matching results from /api/instruments/search', async () => {})
  test.skip('search by ISIN returns matching multi-venue results', async () => {})
  test.skip('multi-venue dropdown shows all listings (e.g. CSPX London + Swiss + Italy)', async () => {})
  test.skip('not_found DataError renders inline empty-state message', async () => {})
  test.skip('rate_limit DataError surfaces as a sonner toast', async () => {})
})
