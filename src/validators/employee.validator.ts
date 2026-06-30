// ─── Validators: Employee ─────────────────────────────────────────────────────
import { z } from 'zod'

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
