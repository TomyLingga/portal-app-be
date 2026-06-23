// ─── Schema: Organisasi ───────────────────────────────────────────────────────
import { pgTable, uuid, varchar, boolean } from 'drizzle-orm/pg-core'
import { relations }                        from 'drizzle-orm'

// ─── Bagian (Divisi / Department) ────────────────────────────────────────────
export const bagian = pgTable('bagian', {
  id:       uuid('id').primaryKey().defaultRandom(),
  nama:     varchar('nama', { length: 150 }).notNull(),
  kode:     varchar('kode', { length: 20  }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
})

// ─── Sub Bagian ───────────────────────────────────────────────────────────────
export const subBagian = pgTable('sub_bagian', {
  id:       uuid('id').primaryKey().defaultRandom(),
  nama:     varchar('nama', { length: 150 }).notNull(),
  kode:     varchar('kode', { length: 20  }).notNull().unique(),
  bagianId: uuid('bagian_id').notNull().references(() => bagian.id),
  isActive: boolean('is_active').notNull().default(true),
})

// ─── Relations ────────────────────────────────────────────────────────────────
export const bagianRelations = relations(bagian, ({ many }) => ({
  subBagian: many(subBagian),
}))

export const subBagianRelations = relations(subBagian, ({ one }) => ({
  bagian: one(bagian, { fields: [subBagian.bagianId], references: [bagian.id] }),
}))
