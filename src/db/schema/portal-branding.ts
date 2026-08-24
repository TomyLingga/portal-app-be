import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const portalBranding = pgTable('portal_branding', {
  id: varchar('id', { length: 40 }).primaryKey(),
  portalName: varchar('portal_name', { length: 120 }).notNull(),
  adminPanelName: varchar('admin_panel_name', { length: 100 }).notNull(),
  adminHeroTitle: varchar('admin_hero_title', { length: 160 }).notNull(),
  adminHeroDescription: text('admin_hero_description').notNull(),
  updatedBy: uuid('updated_by').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
