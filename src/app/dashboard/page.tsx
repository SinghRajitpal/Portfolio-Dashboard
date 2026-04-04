import { ChartSkeleton } from "@/components/dashboard/chart-skeleton"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import { MetricsStrip } from "@/components/dashboard/metrics-strip"

export default function DashboardPage() {
  return (
    <main className="flex-1 max-w-screen-2xl mx-auto w-full px-6 py-6 space-y-8">
      <ChartSkeleton />
      <SummaryCards />
      <MetricsStrip />
    </main>
  )
}
