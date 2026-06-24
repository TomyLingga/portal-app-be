// ─── Validators: Organisasi (Unit Organisasi) ─────────────────────────────────
import { z } from 'zod'

export const tipeUnitValues = ['direktorat', 'sevp', 'bagian', 'sub_bagian', 'seksi'] as const

export const createUnitOrganisasiSchema = z.object({
  nama:     z.string().min(1).max(150),
  kode:     z.string().min(1).max(20).toUpperCase(),
  tipe:     z.enum(tipeUnitValues),
  parentId: z.string().uuid('parentId tidak valid').optional().nullable(),
  isActive: z.boolean().default(true),
})

export const updateUnitOrganisasiSchema = createUnitOrganisasiSchema.partial()

export const listUnitOrganisasiQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  search:   z.string().optional(),
  tipe:     z.enum(tipeUnitValues).optional(),
  parentId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
})

export type CreateUnitOrganisasiInput = z.infer<typeof createUnitOrganisasiSchema>
export type UpdateUnitOrganisasiInput = z.infer<typeof updateUnitOrganisasiSchema>
export type ListUnitOrganisasiQuery   = z.infer<typeof listUnitOrganisasiQuerySchema>
