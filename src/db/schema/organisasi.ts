// ─── Schema: Organisasi (Hierarki Self-Referencing) ───────────────────────────
import crypto from 'crypto'
import { pgTable, uuid, varchar, boolean, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

const genUUID = () => crypto.randomUUID()

// Tipe unit organisasi — fleksibel, bisa ditambah level baru tanpa ubah schema
export const tipeUnitEnum = pgEnum('tipe_unit', [
  'direktorat',   // Level tertinggi (Direktur Utama)
  'sevp',         // Senior Executive VP
  'bagian',       // Bagian / Departemen
  'sub_bagian',   // Sub Bagian
  'seksi',        // Seksi / Supervisor
])

// ─── Unit Organisasi ──────────────────────────────────────────────────────────
export const unitOrganisasi = pgTable('unit_organisasi', {
  id:       uuid('id').primaryKey().$defaultFn(genUUID),
  nama:     varchar('nama', { length: 150 }).notNull(),
  kode:     varchar('kode', { length: 20  }).notNull().unique(),
  tipe:     tipeUnitEnum('tipe').notNull(),
  parentId: uuid('parent_id').references((): any => unitOrganisasi.id),
  isActive: boolean('is_active').notNull().default(true),
})

// ─── Relations ────────────────────────────────────────────────────────────────
export const unitOrganisasiRelations = relations(unitOrganisasi, ({ one, many }) => ({
  parent:   one(unitOrganisasi, { fields: [unitOrganisasi.parentId], references: [unitOrganisasi.id], relationName: 'parent' }),
  children: many(unitOrganisasi, { relationName: 'parent' }),
}))
