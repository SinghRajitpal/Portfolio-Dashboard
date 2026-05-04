import { notFound } from 'next/navigation'
import { getPortfolioForEdit, getInstrumentMetaMap } from '../../_queries'
import { PortfolioBuilderClient } from '../../_client/PortfolioBuilderClient'

type Props = { params: Promise<{ id: string }> }

export default async function EditPortfolioPage({ params }: Props) {
  const { id } = await params
  const portfolio = await getPortfolioForEdit(id)
  if (!portfolio) notFound()

  const metaMap = await getInstrumentMetaMap(
    portfolio.items.map((it) => it.instrument_id),
  )
  const instrumentsMeta = Object.fromEntries(metaMap.entries())

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
      <PortfolioBuilderClient
        mode="edit"
        initialData={portfolio}
        instrumentsMeta={instrumentsMeta}
      />
    </main>
  )
}
