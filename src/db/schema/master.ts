// ─── Schema: Master / Referensi ──────────────────────────────────────────────
import crypto from 'crypto'
import { pgTable, uuid, varchar, integer, text } from 'drizzle-orm/pg-core'

const genUUID = () => crypto.randomUUID()

// Status Karyawan (Tetap, Kontrak, Magang, dll)
export const refStatusKaryawan = pgTable('ref_status_karyawan', {
  id:    uuid('id').primaryKey().$defaultFn(genUUID),
  kode:  varchar('kode',  { length: 20  }).notNull().unique(),
  label: varchar('label', { length: 100 }).notNull(),
})

// Pendidikan Terakhir
export const refPendidikan = pgTable('ref_pendidikan', {
  id:     uuid('id').primaryKey().$defaultFn(genUUID),
  kode:   varchar('kode',  { length: 20  }).notNull().unique(),
  label:  varchar('label', { length: 100 }).notNull(),
  urutan: integer('urutan').notNull().default(0),
})

// Status Pernikahan
export const refStatusPernikahan = pgTable('ref_status_pernikahan', {
  id:    uuid('id').primaryKey().$defaultFn(genUUID),
  kode:  varchar('kode',  { length: 20  }).notNull().unique(),
  label: varchar('label', { length: 100 }).notNull(),
})

// ─── Grade ────────────────────────────────────────────────────────────────────
// Grade / golongan jabatan karyawan.
export const refGrade = pgTable('ref_grade', {
  id:         uuid('id').primaryKey().$defaultFn(genUUID),
  kode:       varchar('kode',       { length: 20  }).notNull().unique(),
  label:      varchar('label',      { length: 100 }).notNull(),
  level:      integer('level').notNull().default(0),
  keterangan: text('keterangan'),
})
