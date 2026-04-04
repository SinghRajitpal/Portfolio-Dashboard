import { TopNav } from "@/components/layout/top-nav"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav userEmail={user?.email} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
