export const dynamic = 'force-dynamic'

import { SignOutButton } from '@/components/auth/sign-out-button'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-base">PortfolioForge</span>
        <SignOutButton />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
