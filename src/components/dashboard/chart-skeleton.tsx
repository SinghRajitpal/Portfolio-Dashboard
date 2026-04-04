import { Skeleton } from "@/components/ui/skeleton"

export function ChartSkeleton() {
  return (
    <section aria-label="Portfolio chart" className="relative">
      <Skeleton className="h-64 md:h-80 w-full rounded-none" />
      {/* Empty state CTA — shown within the skeleton placeholder */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">No portfolio selected</p>
          <a
            href="/dashboard/portfolios"
            className="inline-block px-4 py-2 text-sm font-medium bg-[var(--color-accent-swiss)] text-white hover:opacity-90 transition-opacity"
          >
            Create your first portfolio
          </a>
        </div>
      </div>
    </section>
  )
}
