import crypto from 'crypto'
import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user, aplikasi } from './auth'

const genUUID = () => crypto.randomUUID()

export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  userId: uuid('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
  appId: uuid('app_id').references(() => aplikasi.id, { onDelete: 'cascade' }), // Nullable
  action: varchar('action', { length: 100 }).notNull(), // 'login', 'logout', 'access_app', 'update_profile_photo', etc.
  details: text('details').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  user: one(user, { fields: [activityLog.userId], references: [user.id] }),
  app: one(aplikasi, { fields: [activityLog.appId], references: [aplikasi.id] }),
}))
