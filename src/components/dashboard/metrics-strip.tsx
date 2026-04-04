import { Skeleton } from "@/components/ui/skeleton"

const stats = [
  "Sharpe",
  "CAGR",
  "Volatility",
  "Expense Ratio",
  "Max Drawdown",
] as const

export function MetricsStrip() {
  return (
    <section
      aria-label="Key metrics"
      className="flex flex-wrap gap-x-8 gap-y-4 border-t border-border/40 pt-4"
    >
      {stats.map((stat) => (
        <div key={stat} className="space-y-1">
          <p className="text-xs text-muted-foreground">{stat}</p>
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </section>
  )
}
