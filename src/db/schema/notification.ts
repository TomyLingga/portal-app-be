import crypto from 'crypto'
import { pgTable, uuid, varchar, boolean, text, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { user } from './auth'

const genUUID = () => crypto.randomUUID()

export const notification = pgTable('notification', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  category: varchar('category', { length: 50 }).notNull(), // 'info' | 'success' | 'warning' | 'security'
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  userId: uuid('user_id').references(() => user.id, { onDelete: 'cascade' }), // Nullable (if null, global announcement)
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const userNotificationStatus = pgTable('user_notification_status', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  notificationId: uuid('notification_id').notNull().references(() => notification.id, { onDelete: 'cascade' }),
  isRead: boolean('is_read').notNull().default(false),
  isCleared: boolean('is_cleared').notNull().default(false),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const notificationRelations = relations(notification, ({ one, many }) => ({
  user: one(user, { fields: [notification.userId], references: [user.id] }),
  userStatuses: many(userNotificationStatus),
}))

export const userNotificationStatusRelations = relations(userNotificationStatus, ({ one }) => ({
  user: one(user, { fields: [userNotificationStatus.userId], references: [user.id] }),
  notification: one(notification, { fields: [userNotificationStatus.notificationId], references: [notification.id] }),
}))
