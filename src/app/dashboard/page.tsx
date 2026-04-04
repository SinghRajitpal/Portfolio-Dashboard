import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight">
        Welcome, {user?.email}
      </h1>
      <p className="text-muted-foreground">
        Your portfolio dashboard will appear here.
      </p>
    </main>
  )
}
