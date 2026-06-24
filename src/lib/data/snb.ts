/**
 * SNB (Swiss National Bank) CHF policy-rate fetcher + 2019-06 regime stitcher.
 *
 * The backtest engine's Sharpe metric (CONTEXT D-19) requires a point-in-time
 * CHF risk-free rate. Two issues drive this module:
 *
 *  1. Regime cutover (RESEARCH §Pitfall 1, lines 607-613):
 *     SNB introduced its "policy rate" (series `LZ`) in **June 2019**. Earlier
 *     history is published in the same cube as the SNB Libor target range —
 *     `UG0` (lower bound) and `OG0` (upper bound). We stitch
 *     `(UG0 + OG0) / 2 → libor_mid` for months strictly before 2019-06, then
 *     switch to `LZ` from 2019-06 onward. Without the stitch, any backtest
 *     starting before 2019-06 would silently lose half its Sharpe denominator.
 *
 *  2. Content-Type lies (RESEARCH §Pitfall 2, lines 615-620):
 *     `data.snb.ch` labels JSON responses as `text/html;charset=UTF-8`.
 *     Calling the Response body's auto-parse method will throw
 *     `SyntaxError: Unexpected token`. Always use
 *     `JSON.parse(await response.text())`. The test suite asserts
 *     `Response.prototype.json` is never called.
 *
 * Output: a single ascending-sorted array of `SnbPoint` rows. SNB publishes
 * percentages (e.g. 1.25 for 1.25%); we store decimals (0.0125). Monthly
 * granularity matches D-19 (the SNB changes rates ≤ 4×/year).
 *
 * Used by:
 *   * `src/scripts/seed-snb.ts` — one-shot bulk seed
 *   * `src/app/api/cron/refresh-snb/route.ts` — quarterly cron
 *
 * Cite:
 *   * 05-CONTEXT.md D-19
 *   * 05-RESEARCH.md §Pattern 4 lines 489-541, §Pitfall 1, §Pitfall 2
 */
import type { DataError } from './errors'

export const SNB_BASE_URL = 'https://data.snb.ch/api/cube/snboffzisa/data/json/en'

/** Boundary month (inclusive) at/after which the LZ series begins. */
export const CUTOVER = '2019-06'

/** Earliest month of the LZ series — used as the `fromDate` for the LZ fetch. */
export const LZ_FROM = '2019-06'

/** Earliest month we attempt to source libor_mid from — bounds the historical
 *  range pulled from the cube. */
export const LIBOR_FROM = '2000-01'

/** A single SNB policy-rate observation (decimal rate, monthly granularity). */
export type SnbPoint = {
  date_month: string
  rate: number
  source: 'LZ' | 'libor_mid'
}

/** Internal shape — one timeseries entry from the snboffzisa cube. */
type RawTs = {
  header: { dimItem: string }[]
  values: { date: string; value: number }[]
}

/**
 * Fetch one dimension selection from the snboffzisa cube.
 *
 * Returns the parsed `timeseries` array on 2xx, or a DataError. Critically uses
 * `JSON.parse(await response.text())` — never the Response body's auto-parse
 * shortcut — because data.snb.ch lies about Content-Type (Pitfall 2).
 */
async function fetchOne(dimSel: string, fromDate: string): Promise<RawTs[] | DataError> {
  const url = `${SNB_BASE_URL}?dimSel=${dimSel}&fromDate=${fromDate}`
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (err) {
    return { kind: 'transient', message: (err as Error).message, attempt: 1 }
  }
  if (res.status >= 500) {
    return { kind: 'transient', message: `SNB ${res.status}`, attempt: 1 }
  }
  if (res.status >= 400) {
    return { kind: 'not_found', message: `SNB ${res.status}: ${url}` }
  }
  // NOTE (Pitfall 2): data.snb.ch sets Content-Type: text/html on JSON bodies.
  // The Response body's auto-parse shortcut will throw "Unexpected token <"
  // intermittently. The body is valid JSON; parse manually from the text.
  try {
    const text = await res.text()
    const parsed = JSON.parse(text) as { timeseries?: RawTs[] }
    return parsed.timeseries ?? []
  } catch (err) {
    return { kind: 'transient', message: `SNB parse: ${(err as Error).message}`, attempt: 1 }
  }
}

/**
 * Fetch + stitch the SNB CHF policy-rate series.
 *
 * Returns one `SnbPoint` per month from `LIBOR_FROM` through the most recent
 * publication. Sorted ascending by `date_month`. Decimal-rate (not percent).
 *
 * Returns the first encountered DataError from either underlying fetch.
 */
export async function fetchSnbPolicyRate(): Promise<SnbPoint[] | DataError> {
  // ── 1. LZ series (post-2019-06)
  const lzSeries = await fetchOne('D0(LZ)', LZ_FROM)
  if (!Array.isArray(lzSeries)) return lzSeries

  // ── 2. Target-range series (UG0 lower / OG0 upper) from 2000-01
  const rangeSeries = await fetchOne('D0(UG0,OG0)', LIBOR_FROM)
  if (!Array.isArray(rangeSeries)) return rangeSeries

  // ── 3. LZ points — direct decimal conversion, source = 'LZ'
  const lzTs = lzSeries[0]
  const lzPoints: SnbPoint[] = (lzTs?.values ?? []).map(v => ({
    date_month: v.date,
    rate: v.value / 100,
    source: 'LZ',
  }))

  // ── 4. libor_mid points — midpoint of UG0 + OG0 for months strictly before CUTOVER
  const lowerTs = rangeSeries.find(ts => ts.header.some(h => h.dimItem === 'UG0'))
  const upperTs = rangeSeries.find(ts => ts.header.some(h => h.dimItem === 'OG0'))
  const lowerMap = new Map<string, number>((lowerTs?.values ?? []).map(v => [v.date, v.value]))
  const upperMap = new Map<string, number>((upperTs?.values ?? []).map(v => [v.date, v.value]))

  const liborPoints: SnbPoint[] = []
  for (const [date_month, lo] of lowerMap) {
    if (date_month >= CUTOVER) continue
    const hi = upperMap.get(date_month)
    if (hi == null) continue
    liborPoints.push({
      date_month,
      rate: ((lo + hi) / 2) / 100,
      source: 'libor_mid',
    })
  }

  // ── 5. Concat + sort ascending by date_month (ISO YYYY-MM lex order == chrono)
  return [...liborPoints, ...lzPoints].sort((a, b) => a.date_month.localeCompare(b.date_month))
}
