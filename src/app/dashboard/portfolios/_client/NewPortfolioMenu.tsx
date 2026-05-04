'use client'

/**
 * NewPortfolioMenu
 *
 * Top-right "+ New portfolio" dropdown trigger. Three items per CONTEXT:
 *   - Blank          → /dashboard/portfolios/new
 *   - From template  → opens TemplatePickerDialog
 *   - Import CSV     → disabled (Plan 06 wires the upload dialog)
 *
 * Renders the TemplatePickerDialog as a sibling so the dialog state lives
 * here (single source of truth). Page-level layout never renders the dialog
 * directly to avoid duplicate instances.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { TemplateRow } from '../_queries'
import { TemplatePickerDialog } from './TemplatePickerDialog'

export type NewPortfolioMenuProps = {
  templates: TemplateRow[]
}

export function NewPortfolioMenu({ templates }: NewPortfolioMenuProps) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="default" size="sm">
              <Plus />
              New portfolio
              <ChevronDown className="ml-1 size-3.5 opacity-70" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            onClick={() => router.push('/dashboard/portfolios/new')}
          >
            Blank
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPickerOpen(true)}>
            From template
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <span className="flex flex-col items-start">
              <span>Import CSV</span>
              <span className="text-xs text-muted-foreground">
                (coming soon)
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TemplatePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        templates={templates}
      />
    </>
  )
}
