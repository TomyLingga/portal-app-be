// ─── Validators: Aplikasi ─────────────────────────────────────────────────────
import { z } from 'zod'

export const createAplikasiSchema = z.object({
  nama:      z.string().min(1).max(150),
  url:       z.string().url('URL tidak valid').max(500),
  authMode:  z.enum(['sso', 'independent']).default('independent'),
  icon:      z.string().max(500).optional().nullable(),
  deskripsi: z.string().optional().nullable(),
  urutan:    z.number().int().min(0).default(0),
  isActive:  z.boolean().default(true),
  warna:     z.string().max(50).optional().default('#3b82f6'),
})

export const updateAplikasiSchema = createAplikasiSchema.partial()

export const listAplikasiQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  search:   z.string().optional(),
  authMode: z.enum(['sso', 'independent']).optional(),
  isActive: z.coerce.boolean().optional(),
})

export type CreateAplikasiInput = z.infer<typeof createAplikasiSchema>
export type UpdateAplikasiInput = z.infer<typeof updateAplikasiSchema>
export type ListAplikasiQuery   = z.infer<typeof listAplikasiQuerySchema>
