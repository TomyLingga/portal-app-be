// ─── Validators: Employee ─────────────────────────────────────────────────────
import { z } from 'zod'

export const createEmployeeSchema = z.object({
  nrk:                  z.string().min(1).max(50),
  nik:                  z.string().min(16).max(16, 'NIK harus 16 digit'),
  nama:                 z.string().min(1).max(150),
  jenisKelamin:         z.enum(['L', 'P']).refine(v => ['L', 'P'].includes(v), { message: "jenisKelamin harus 'L' atau 'P'" }),
  jabatan:              z.string().min(1).max(150),
  gradeId:              z.string().uuid().optional().nullable(),
  atasanId:             z.string().uuid().optional().nullable(),
  unitOrganisasiId:     z.string().uuid().optional().nullable(),
  tanggalMasuk:         z.string().date('Format tanggal: YYYY-MM-DD').optional().nullable(),
  tempatLahir:          z.string().max(100).optional().nullable(),
  tanggalLahir:         z.string().date('Format tanggal: YYYY-MM-DD').optional().nullable(),
  statusKaryawanId:     z.string().uuid().optional().nullable(),
  pendidikanTerakhirId: z.string().uuid().optional().nullable(),
  statusPernikahanId:   z.string().uuid().optional().nullable(),
  penempatanAreaId:     z.string().uuid().optional().nullable(),
  nomorHp:              z.string().max(20).optional().nullable(),
  alamat:               z.string().optional().nullable(),
  isActive:             z.boolean().default(true),
})

export const updateEmployeeSchema = createEmployeeSchema.partial()

export const listEmployeeQuerySchema = z.object({
  page:             z.coerce.number().int().min(1).default(1),
  limit:            z.coerce.number().int().min(1).max(1000).default(20),
  search:           z.string().optional(), // cari nama / nrk / nik
  unitOrganisasiId: z.string().uuid().optional(),
  gradeId:          z.string().uuid().optional(),
  isActive:         z.coerce.boolean().optional(),
})

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
export type ListEmployeeQuery   = z.infer<typeof listEmployeeQuerySchema>
