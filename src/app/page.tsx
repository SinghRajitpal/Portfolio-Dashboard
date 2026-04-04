import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
          className={cn(buttonVariants({ variant: 'default', size: 'lg' }))}
        >
          Sign In
        </Link>
        <Link
          href="/auth?tab=signup"
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
        >
          Sign Up
        </Link>
      </div>
    </main>
  )
}
