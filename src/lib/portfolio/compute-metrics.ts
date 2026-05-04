export type Item = { instrument_id: string; weight: number }

export type InstrumentMeta = {
  expense_ratio: number | null
  dividend_yield: number | null
}

export type Metrics = {
  ter: number
  yield: number
  annualIncome: number
  terMissingCount: number
  yieldMissingCount: number
  terMissingIds: string[]
  yieldMissingIds: string[]
}

/**
 * Pure function: compute weighted TER + dividend yield + annual income.
 *
 * Contract notes:
 * - `weight` is a percent (0-100). Internally divided by 100 before multiplying
 *   the fractional `expense_ratio` / `dividend_yield`. This avoids the common
 *   "double multiplication" pitfall.
 * - Items whose `instrument_id` is absent from `meta` are silently skipped
 *   (the caller did not supply data; not the same as null).
 * - `null` expense_ratio or dividend_yield contributes 0 and the id is pushed
 *   to the corresponding missing list so UI can render a footnote.
 * - Results are NOT rounded — caller decides display rounding.
 */
export function computeMetrics(
  items: Item[],
  investmentAmount: number,
  meta: Map<string, InstrumentMeta>,
): Metrics {
  let ter = 0
  let dy = 0
  const terMissingIds: string[] = []
  const yieldMissingIds: string[] = []

  for (const it of items) {
    const m = meta.get(it.instrument_id)
    if (!m) continue
    if (m.expense_ratio == null) {
      terMissingIds.push(it.instrument_id)
    } else {
      ter += (it.weight / 100) * m.expense_ratio
    }
    if (m.dividend_yield == null) {
      yieldMissingIds.push(it.instrument_id)
    } else {
      dy += (it.weight / 100) * m.dividend_yield
    }
  }

  return {
    ter,
    yield: dy,
    annualIncome: investmentAmount * dy,
    terMissingCount: terMissingIds.length,
    yieldMissingCount: yieldMissingIds.length,
    terMissingIds,
    yieldMissingIds,
  }
}
