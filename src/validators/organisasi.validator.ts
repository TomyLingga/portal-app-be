// ─── Validators: Organisasi ───────────────────────────────────────────────────
import { z } from 'zod'

export const createBagianSchema = z.object({
  nama:     z.string().min(1).max(150),
  kode:     z.string().min(1).max(20).toUpperCase(),
  isActive: z.boolean().default(true),
})

export const updateBagianSchema = createBagianSchema.partial()

export const createSubBagianSchema = z.object({
  nama:     z.string().min(1).max(150),
  kode:     z.string().min(1).max(20).toUpperCase(),
  bagianId: z.string().uuid('bagianId tidak valid'),
  isActive: z.boolean().default(true),
})

export const updateSubBagianSchema = createSubBagianSchema.partial()

export const listQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  search:   z.string().optional(),
  isActive: z.coerce.boolean().optional(),
})

export type CreateBagianInput    = z.infer<typeof createBagianSchema>
export type UpdateBagianInput    = z.infer<typeof updateBagianSchema>
export type CreateSubBagianInput = z.infer<typeof createSubBagianSchema>
export type UpdateSubBagianInput = z.infer<typeof updateSubBagianSchema>
export type ListQuery            = z.infer<typeof listQuerySchema>
