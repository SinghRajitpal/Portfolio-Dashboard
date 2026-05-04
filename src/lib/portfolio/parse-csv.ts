import Papa from 'papaparse'
import { z } from 'zod'

export const CsvRowSchema = z.object({
  ticker: z.string().trim().min(1),
  weight: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'weight must be numeric')
    .transform(Number),
  exchange: z.string().trim().min(1).optional(),
})

export type CsvRow = {
  ticker: string
  weight: number
  exchange?: string
}

/**
 * Client-side CSV parser. Does NOT throw — always resolves with `{ rows, errors }`.
 *
 * - Headers normalised to lower-case + trimmed (`ticker`, `weight`, optional `exchange`).
 * - Empty lines skipped via papaparse `skipEmptyLines: true`.
 * - Each row validated via Zod; failures are pushed to `errors[]` with a
 *   1-based row number that accounts for the header line.
 */
export async function parsePortfolioCsv(
  file: File,
): Promise<{ rows: CsvRow[]; errors: string[] }> {
  // Read the File to a string first so papaparse runs synchronously.
  // Passing a File object directly requires browser FileReader/FileReaderSync,
  // which is not available in vitest's Node env. The string path works in
  // both browser and Node.
  let text: string
  try {
    text = await file.text()
  } catch (err) {
    return { rows: [], errors: [`Read error: ${(err as Error).message}`] }
  }

  const result = Papa.parse<Record<string, string | undefined>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.toLowerCase().trim(),
  })

  const rows: CsvRow[] = []
  const errs: string[] = result.errors.map(
    (e) => `Row ${typeof e.row === 'number' ? e.row + 2 : '?'}: ${e.message}`,
  )

  for (const [i, raw] of result.data.entries()) {
    // Strip empty-string optional fields so .optional() can pass.
    const cleaned: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v.length > 0) cleaned[k] = v
    }

    const parsed = CsvRowSchema.safeParse(cleaned)
    if (parsed.success) {
      const row: CsvRow = {
        ticker: parsed.data.ticker,
        weight: parsed.data.weight,
      }
      if (parsed.data.exchange) row.exchange = parsed.data.exchange
      rows.push(row)
    } else {
      const issue = parsed.error.issues[0]
      errs.push(`Row ${i + 2}: ${issue.path.join('.') || 'row'} — ${issue.message}`)
    }
  }

  return { rows, errors: errs }
}
