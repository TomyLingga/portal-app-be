import crypto from 'crypto'
import { pgTable, uuid, varchar, boolean } from 'drizzle-orm/pg-core'

const genUUID = () => crypto.randomUUID()

export const loginSongs = pgTable('login_songs', {
  id:       uuid('id').primaryKey().$defaultFn(genUUID),
  title:    varchar('title', { length: 150 }).notNull(),
  filename: varchar('filename', { length: 255 }),
  isActive: boolean('is_active').notNull().default(false),
})
