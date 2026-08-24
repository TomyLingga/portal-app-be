import crypto from 'crypto'
import { relations } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { user } from './auth'

const genUUID = () => crypto.randomUUID()

export const portalNotification = pgTable('portal_notification', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 80 }).notNull(),
  title: varchar('title', { length: 180 }).notNull(),
  message: text('message').notNull(),
  entityType: varchar('entity_type', { length: 80 }),
  entityId: uuid('entity_id'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('portal_notification_user_unread_idx').on(table.userId, table.isRead, table.createdAt),
])

export const portalNotificationRelations = relations(portalNotification, ({ one }) => ({
  user: one(user, { fields: [portalNotification.userId], references: [user.id] }),
}))
