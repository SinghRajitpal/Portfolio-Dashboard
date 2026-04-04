import { Skeleton } from "@/components/ui/skeleton"

const cards = [
  { label: "Total Value" },
  { label: "Return" },
  { label: "Risk" },
  { label: "Income" },
] as const

export function SummaryCards() {
  return (
    <section
      aria-label="Summary cards"
      className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6"
    >
      {cards.map(({ label }) => (
        <div key={label} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {label}
          </p>
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </section>
  )
}
