/**
 * Tests for src/lib/data/snb.ts (Plan 05-03).
 *
 * Validates the SNB CHF policy-rate fetcher + stitcher. Critical
 * behaviors covered (per 05-RESEARCH.md §Pattern 4 lines 489-541,
 * §Pitfall 1 (LZ ≥ 2019-06 cutover), §Pitfall 2 (data.snb.ch returns
 * Content-Type: text/html for JSON bodies)):
 *   * Pre-2019-06 stitch: (UG0 + OG0) / 2 → libor_mid
 *   * Post-2019-06: LZ used directly
 *   * Sorted ascending by date_month
 *   * JSON.parse(await text()) — not response.json()
 *   * 5xx → DataError { kind: 'transient' }
 *   * Decimal conversion: SNB publishes percent; stored as decimal
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSnbPolicyRate } from './snb'
import { isDataError } from './errors'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Build a fake Response whose Content-Type lies (says text/html) but body is
 * valid JSON — mirrors the documented quirk of data.snb.ch (Pitfall 2).
 */
function fakeResponse(bodyObj: unknown, status = 200): Response {
  const body = JSON.stringify(bodyObj)
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  })
}

type SnbCubeResponse = {
  timeseries: { header: { dimItem: string }[]; values: { date: string; value: number }[] }[]
}

function lzOnly(values: { date: string; value: number }[]): SnbCubeResponse {
  return { timeseries: [{ header: [{ dimItem: 'LZ' }], values }] }
}

function rangesOnly(
  lower: { date: string; value: number }[],
  upper: { date: string; value: number }[],
): SnbCubeResponse {
  return {
    timeseries: [
      { header: [{ dimItem: 'UG0' }], values: lower },
      { header: [{ dimItem: 'OG0' }], values: upper },
    ],
  }
}

describe('fetchSnbPolicyRate (D-19)', () => {
  it('stitches pre-2019-06 libor_mid from UG0+OG0 midpoint, decimalized', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    // First call: LZ series (from 2019-06) — returns empty for this test
    fetchSpy.mockResolvedValueOnce(fakeResponse(lzOnly([])))
    // Second call: UG0/OG0 ranges from 2000-01 — one pre-cutover month
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(rangesOnly([{ date: '2018-12', value: 1.0 }], [{ date: '2018-12', value: 3.0 }])),
    )

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return // type narrow

    const dec2018 = result.find(p => p.date_month === '2018-12')
    expect(dec2018).toBeDefined()
    // midpoint = (1.0 + 3.0) / 2 = 2.0%, decimal = 0.02
    expect(dec2018?.rate).toBeCloseTo(0.02, 12)
    expect(dec2018?.source).toBe('libor_mid')
  })

  it('uses LZ verbatim for post-2019-06 dates, decimalized', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(fakeResponse(lzOnly([{ date: '2020-03', value: 2.5 }])))
    fetchSpy.mockResolvedValueOnce(fakeResponse(rangesOnly([], [])))

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return

    const mar2020 = result.find(p => p.date_month === '2020-03')
    expect(mar2020).toBeDefined()
    expect(mar2020?.rate).toBeCloseTo(0.025, 12)
    expect(mar2020?.source).toBe('LZ')
  })

  it('returns points sorted ascending by date_month', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(
        lzOnly([
          { date: '2026-01', value: 1.0 },
          { date: '2019-06', value: -0.75 },
          { date: '2023-06', value: 1.75 },
        ]),
      ),
    )
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(
        rangesOnly(
          [
            { date: '2010-01', value: 0.0 },
            { date: '2015-01', value: -1.25 },
          ],
          [
            { date: '2010-01', value: 0.75 },
            { date: '2015-01', value: -0.25 },
          ],
        ),
      ),
    )

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return

    const dates = result.map(p => p.date_month)
    const sorted = [...dates].sort((a, b) => a.localeCompare(b))
    expect(dates).toEqual(sorted)
    // sanity: pre + post both present
    expect(dates).toContain('2010-01')
    expect(dates).toContain('2026-01')
  })

  it('parses JSON via text() despite text/html Content-Type (Pitfall 2)', async () => {
    // Spy on Response.prototype.json to detect any improper .json() call
    const jsonSpy = vi.spyOn(Response.prototype, 'json')

    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(fakeResponse(lzOnly([{ date: '2020-01', value: 0.5 }])))
    fetchSpy.mockResolvedValueOnce(fakeResponse(rangesOnly([], [])))

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(false)
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it('drops pre-cutover months that lack one side of the range', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(fakeResponse(lzOnly([])))
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(
        rangesOnly(
          [
            { date: '2018-11', value: 0.5 },
            { date: '2018-12', value: 1.0 },
          ],
          // 2018-11 missing upper bound
          [{ date: '2018-12', value: 3.0 }],
        ),
      ),
    )

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return

    expect(result.find(p => p.date_month === '2018-11')).toBeUndefined()
    expect(result.find(p => p.date_month === '2018-12')).toBeDefined()
  })

  it('excludes 2019-06-and-later rows from the libor_mid stitch (cutover boundary)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(fakeResponse(lzOnly([{ date: '2019-06', value: -0.75 }])))
    fetchSpy.mockResolvedValueOnce(
      fakeResponse(
        rangesOnly(
          [
            { date: '2019-05', value: -1.25 },
            { date: '2019-06', value: -1.25 }, // must be filtered out (>= CUTOVER)
          ],
          [
            { date: '2019-05', value: -0.25 },
            { date: '2019-06', value: -0.25 },
          ],
        ),
      ),
    )

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(false)
    if (isDataError(result)) return

    const jun2019 = result.find(p => p.date_month === '2019-06')
    expect(jun2019).toBeDefined()
    // Must come from LZ, not libor_mid
    expect(jun2019?.source).toBe('LZ')

    const may2019 = result.find(p => p.date_month === '2019-05')
    expect(may2019?.source).toBe('libor_mid')
  })

  it('returns DataError { kind: transient } on 5xx', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(
      new Response('Server error', { status: 503, headers: { 'Content-Type': 'text/html' } }),
    )
    fetchSpy.mockResolvedValueOnce(fakeResponse(rangesOnly([], [])))

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('transient')
  })

  it('returns DataError { kind: not_found } on 4xx', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockResolvedValueOnce(
      new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } }),
    )
    fetchSpy.mockResolvedValueOnce(fakeResponse(rangesOnly([], [])))

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('not_found')
  })

  it('returns DataError { kind: transient } on network error', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    fetchSpy.mockRejectedValueOnce(new Error('ENETDOWN'))

    const result = await fetchSnbPolicyRate()
    expect(isDataError(result)).toBe(true)
    if (!isDataError(result)) return
    expect(result.kind).toBe('transient')
  })
})
