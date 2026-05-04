import type { SearchResult } from '@/lib/data/types'

export type GroupedResult = {
  key: string
  displayName: string
  listings: SearchResult[]
}

/**
 * Pure: group SearchResult[] by logical instrument identity.
 *
 * Identity precedence:
 * 1. ISIN if present and non-empty → groups all venue listings of the same security.
 * 2. Otherwise name (trimmed, lowercased) → groups same-name listings without ISIN.
 * 3. Defensive ticker fallback when name is also empty.
 *
 * Display name uses the first listing's non-empty name; else `{ticker} ({exchange})`
 * (covers ISIN cache hits where Yahoo metadata has not yet been enriched).
 *
 * Order: groups appear in first-occurrence order; listings within a group preserve
 * input order.
 */
export function groupSearchResults(results: SearchResult[]): GroupedResult[] {
  const groups = new Map<string, GroupedResult>()
  for (const r of results) {
    const key =
      r.isin && r.isin.length > 0
        ? `isin:${r.isin}`
        : r.name && r.name.trim().length > 0
          ? `name:${r.name.trim().toLowerCase()}`
          : `ticker:${r.ticker}`
    if (!groups.has(key)) {
      const displayName =
        r.name && r.name.trim().length > 0 ? r.name : `${r.ticker} (${r.exchange})`
      groups.set(key, { key, displayName, listings: [] })
    }
    groups.get(key)!.listings.push(r)
  }
  return Array.from(groups.values())
}
