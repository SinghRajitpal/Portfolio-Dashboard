import { z } from 'zod'

export const PortfolioItemSchema = z.object({
  instrument_id: z.string().uuid(),
  ticker: z.string().min(1),
  name: z.string(),
  weight: z.number().min(0).max(100),
})

export type PortfolioItemInput = z.infer<typeof PortfolioItemSchema>

export const PortfolioSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Name required').max(120),
    description: z.string().trim().max(500).optional(),
    investment_amount: z.number().positive().max(99_999_999),
    items: z.array(PortfolioItemSchema).min(1, 'Add at least one instrument'),
  })
  .superRefine((data, ctx) => {
    const sum = data.items.reduce((acc, it) => acc + it.weight, 0)
    if (Math.abs(sum - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items'],
        message: `Weights must sum to 100% (current: ${sum.toFixed(2)}%)`,
      })
    }
  })

export type PortfolioInput = z.infer<typeof PortfolioSchema>
