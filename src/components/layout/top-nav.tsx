"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { AccountMenu } from "./account-menu"

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/portfolios", label: "Portfolios" },
  { href: "/dashboard/backtest", label: "Backtest" },
  { href: "/dashboard/projections", label: "Projections" },
  { href: "/dashboard/compare", label: "Compare" },
] as const

interface TopNavProps {
  userEmail?: string
}

export function TopNav({ userEmail }: TopNavProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="border-b border-border/40 bg-background sticky top-0 z-40">
      <nav className="flex h-14 items-center justify-between px-6 max-w-screen-2xl mx-auto">
        {/* Logo */}
        <span className="font-semibold tracking-tight text-sm select-none">
          PortfolioForge
        </span>

        {/* Desktop nav links */}
        <ul className="hidden md:flex items-center gap-0.5" role="list">
          {navLinks.map(({ href, label }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "px-3 py-1 text-sm font-medium transition-colors border-b-2 inline-block",
                    isActive
                      ? "border-[var(--color-accent-swiss)] text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Right side: account menu + hamburger */}
        <div className="flex items-center gap-2">
          <AccountMenu email={userEmail} />
          <button
            type="button"
            className="md:hidden p-1 text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <ul
          className="md:hidden flex flex-col border-t border-border/40 bg-background py-1"
          role="list"
        >
          {navLinks.map(({ href, label }) => {
            const isActive =
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "block px-6 py-2.5 text-sm",
                    isActive
                      ? "text-[var(--color-accent-swiss)] font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </header>
  )
}
