/**
 * Stub reservations for src/lib/data/snb.ts (Plan 05-03).
 *
 * Validates the SNB CHF policy-rate fetcher + cache reader. Critical
 * behaviors covered (per 05-RESEARCH.md §Validation Architecture and
 * Pitfall 2 — data.snb.ch returns Content-Type: text/html for JSON):
 *   * 2019-06 regime stitch (libor_mid → LZ)
 *   * Robust JSON parsing via JSON.parse(await res.text()).
 */
import { describe, it } from 'vitest'

describe('snb rate fetcher (D-19)', () => {
  it.todo('pre-2019-06 dates use libor_mid stitch')
  it.todo('post-2019-06 dates use LZ')
  it.todo('JSON.parse handles text/html Content-Type from data.snb.ch')
})
