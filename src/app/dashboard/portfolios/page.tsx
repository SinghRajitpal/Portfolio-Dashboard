import { listPortfolios, listTemplates } from './_queries'
import { PortfoliosListClient } from './_client/PortfoliosListClient'
import { NewPortfolioMenu } from './_client/NewPortfolioMenu'

export default async function PortfoliosPage() {
  const [portfolios, templates] = await Promise.all([
    listPortfolios(),
    listTemplates(),
  ])

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-medium tracking-tight">Portfolios</h1>
        <NewPortfolioMenu templates={templates} />
      </header>
      <PortfoliosListClient portfolios={portfolios} />
    </main>
  )
}
