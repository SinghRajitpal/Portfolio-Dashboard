import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen gap-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight">PortfolioForge</h1>
        <p className="text-xl text-muted-foreground max-w-md">
          Build. Backtest. Project. Your portfolio laboratory.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/auth?tab=signin"
          className="group/button inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground h-9 gap-1.5 px-2.5 text-sm font-medium transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [a]:hover:bg-primary/80"
        >
          Sign In
        </Link>
        <Link
          href="/auth?tab=signup"
          className="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted hover:text-foreground h-9 gap-1.5 px-2.5 text-sm font-medium transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
        >
          Sign Up
        </Link>
      </div>
    </main>
  )
}
