// ─── Schema: Master / Referensi ──────────────────────────────────────────────
import { pgTable, uuid, varchar, integer } from 'drizzle-orm/pg-core'

// Status Karyawan (Tetap, Kontrak, Magang, dll)
export const refStatusKaryawan = pgTable('ref_status_karyawan', {
  id:    uuid('id').primaryKey().defaultRandom(),
  kode:  varchar('kode',  { length: 20  }).notNull().unique(),
  label: varchar('label', { length: 100 }).notNull(),
})

// Pendidikan Terakhir
export const refPendidikan = pgTable('ref_pendidikan', {
  id:     uuid('id').primaryKey().defaultRandom(),
  kode:   varchar('kode',  { length: 20  }).notNull().unique(),
  label:  varchar('label', { length: 100 }).notNull(),
  urutan: integer('urutan').notNull().default(0),
})

// Status Pernikahan
export const refStatusPernikahan = pgTable('ref_status_pernikahan', {
  id:    uuid('id').primaryKey().defaultRandom(),
  kode:  varchar('kode',  { length: 20  }).notNull().unique(),
  label: varchar('label', { length: 100 }).notNull(),
})
