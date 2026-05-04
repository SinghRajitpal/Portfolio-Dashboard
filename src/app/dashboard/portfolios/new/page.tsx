import { listTemplates, getInstrumentMetaMap } from '../_queries'
import { PortfolioBuilderClient } from '../_client/PortfolioBuilderClient'
import type { PortfolioInput } from '../_schema'

type Props = { searchParams: Promise<{ seed?: string }> }

export default async function NewPortfolioPage({ searchParams }: Props) {
  const sp = await searchParams
  const seedId = sp.seed
  let initialData: PortfolioInput

  if (seedId) {
    const templates = await listTemplates()
    const t = templates.find((x) => x.id === seedId)
    if (t) {
      initialData = {
        name: `${t.name} (copy)`,
        description: t.description ?? undefined,
        investment_amount: 10000,
        items: t.items, // {instrument_id, ticker, name, weight}
      }
    } else {
      // Seed id provided but not found — fall back to blank rather than 404,
      // so a stale link still produces a usable builder.
      initialData = { name: '', investment_amount: 10000, items: [] }
    }
  } else {
    initialData = { name: '', investment_amount: 10000, items: [] }
  }

  // Fetch metadata for any seeded instruments (empty map for blank create).
  // The builder extends mergedMeta as the user adds rows via the combobox.
  const ids = initialData.items.map((it) => it.instrument_id)
  const metaMap = await getInstrumentMetaMap(ids)
  const instrumentsMeta = Object.fromEntries(metaMap.entries())

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
      <PortfolioBuilderClient
        mode="create"
        initialData={initialData}
        instrumentsMeta={instrumentsMeta}
      />
    </main>
  )
}
