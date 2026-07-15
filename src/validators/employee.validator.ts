// ─── Validators: Employee ─────────────────────────────────────────────────────
import { z } from 'zod'

const importUnitPathItemSchema = z.object({
  nama: z.string().trim().min(1).max(150),
  tipe: z.enum(['direktorat', 'sevp', 'bagian', 'sub_bagian', 'seksi']),
})

export const createEmployeeSchema = z.object({
  nrk:                  z.string().min(1, 'NRK wajib diisi').max(50),
  nik:                  z.string().min(16, 'NIK harus 16 digit').max(16, 'NIK harus 16 digit'),
  nama:                 z.string().min(1, 'Nama wajib diisi').max(150),
  jenisKelamin:         z.enum(['L', 'P'], { message: 'Jenis Kelamin wajib diisi' }),
  jabatan:              z.string().min(1, 'Jabatan wajib diisi').max(150),
  gradeId:              z.string().uuid('Grade wajib diisi'),
  atasanId:             z.string().uuid().optional().nullable(),
  unitOrganisasiId:     z.string().uuid('Unit Kerja wajib diisi'),
  tanggalMasuk:         z.string().date('Format tanggal masuk tidak valid').min(1, 'Tanggal Masuk wajib diisi'),
  tempatLahir:          z.string().min(1, 'Tempat Lahir wajib diisi').max(100),
  tanggalLahir:         z.string().date('Format tanggal lahir tidak valid').min(1, 'Tanggal Lahir wajib diisi'),
  statusKaryawanId:     z.string().uuid('Status Karyawan wajib diisi'),
  pendidikanTerakhirId: z.string().uuid('Pendidikan Terakhir wajib diisi'),
  statusPernikahanId:   z.string().uuid('Status Pernikahan wajib diisi'),
  penempatanAreaId:     z.string().uuid().optional().nullable(),
  nomorHp:              z.string().min(1, 'Nomor HP wajib diisi').max(20),
  alamat:               z.string().min(1, 'Alamat wajib diisi'),
  agama:                z.string().min(1, 'Agama wajib diisi').max(50),
  isActive:             z.boolean().default(true),
})

export const updateEmployeeSchema = createEmployeeSchema.partial()

export const importEmployeeSchema = z.object({
  nrk:                  z.string().trim().min(1).max(50).nullable().optional(),
  nik:                  z.string().length(16, 'NIK harus 16 digit').nullable().optional(),
  nama:                 z.string().trim().min(1).max(150).nullable().optional(),
  jenisKelamin:         z.enum(['L', 'P']).nullable().optional(),
  jabatan:              z.string().trim().min(1).max(150).nullable().optional(),
  gradeId:              z.string().uuid('Grade wajib diisi'),
  unitPath:             z.array(importUnitPathItemSchema).min(1, 'Unit organisasi wajib diisi').max(5),
  tanggalMasuk:         z.string().date('Format tanggal masuk tidak valid').nullable().optional(),
  tempatLahir:          z.string().trim().max(100).nullable().optional(),
  tanggalLahir:         z.string().date('Format tanggal lahir tidak valid').nullable().optional(),
  statusKaryawanId:     z.string().uuid().nullable().optional(),
  pendidikanTerakhirId: z.string().uuid().nullable().optional(),
  statusPernikahanId:   z.string().uuid().nullable().optional(),
  penempatanAreaId:     z.string().uuid().nullable().optional(),
  nomorHp:              z.string().trim().max(20).nullable().optional(),
  alamat:               z.string().trim().nullable().optional(),
  agama:                z.string().trim().max(50).nullable().optional(),
  // Jika email diisi, sistem otomatis membuat akun user (role user, password default).
  email:                z.string().email('Email tidak valid').nullable().optional(),
  isActive:             z.boolean().default(true),
})

const queryBooleanSchema = z.preprocess((value) => {
  if (value === 'true') return true
  if (value === 'false') return false
  return value
}, z.boolean())

export const listEmployeeQuerySchema = z.object({
  page:             z.coerce.number().int().min(1).default(1),
  limit:            z.coerce.number().int().min(1).max(1000).default(20),
  search:           z.string().optional(), // cari nama / nrk / nik
  unitOrganisasiId: z.string().uuid().optional(),
  gradeId:          z.string().uuid().optional(),
  isActive:         queryBooleanSchema.optional(),
  jenisKelamin:     z.enum(['L', 'P']).optional(),
  penempatanAreaId: z.string().uuid().optional(),
  statusKaryawanId: z.string().uuid().optional(),
  statusPernikahanId: z.string().uuid().optional(),
  hasUser:          queryBooleanSchema.optional(),
  tanggalMasukFrom: z.string().date().optional(),
  tanggalMasukTo:   z.string().date().optional(),
})

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
export type ImportEmployeeInput = z.infer<typeof importEmployeeSchema>
export type ListEmployeeQuery   = z.infer<typeof listEmployeeQuerySchema>
