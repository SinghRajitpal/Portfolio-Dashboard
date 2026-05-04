/**
 * Pure function: rescale a weights array so it sums to exactly 100.00 (after 2dp rounding).
 *
 * - All-zeros input returns all-zeros (no division by zero).
 * - Each element is rounded to 2 decimals to match Postgres NUMERIC(5,2).
 * - Drift from rounding is absorbed into the last element so the final sum is
 *   exactly 100.00.
 */
export function normalizeTo100(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum === 0) return weights.map(() => 0)
  const scaled = weights.map((w) => Math.round((w / sum) * 100 * 100) / 100)
  if (scaled.length === 0) return scaled
  const drift = 100 - scaled.reduce((a, b) => a + b, 0)
  scaled[scaled.length - 1] = Math.round((scaled[scaled.length - 1] + drift) * 100) / 100
  return scaled
}
