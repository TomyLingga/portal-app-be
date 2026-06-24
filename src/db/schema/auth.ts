// ─── Schema: Auth (user, aplikasi, access, SSO) ───────────────────────────────
import crypto from 'crypto'
import { pgTable, uuid, varchar, boolean, timestamp, text, integer, pgEnum } from 'drizzle-orm/pg-core'
import { relations }  from 'drizzle-orm'
import { employee }   from './employee'

const genUUID = () => crypto.randomUUID()

// ─── Enums ────────────────────────────────────────────────────────────────────
// user        → hanya bisa lihat portal & akses aplikasi yang diberikan
// super_admin → akses penuh: CRUD employee, user, bagian, sub_bagian, aplikasi
export const roleEnum = pgEnum('role', ['user', 'super_admin'])

// sso         → login dari portal (tidak perlu login ulang di aplikasi)
// independent → punya login sendiri (tidak terintegrasi SSO)
export const authModeEnum = pgEnum('auth_mode', ['sso', 'independent'])

// ─── User ─────────────────────────────────────────────────────────────────────
export const user = pgTable('user', {
  id:           uuid('id').primaryKey().$defaultFn(genUUID),
  email:        varchar('email',         { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role:         roleEnum('role').notNull().default('user'),
  isActive:     boolean('is_active').notNull().default(true),
  lastLogin:    timestamp('last_login'),
  // token_version: di-increment setiap logout → token lama otomatis invalid
  tokenVersion: integer('token_version').notNull().default(1),
  employeeId:   uuid('employee_id').references(() => employee.id).unique(), // one-to-one
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
})

// ─── Aplikasi ─────────────────────────────────────────────────────────────────
export const aplikasi = pgTable('aplikasi', {
  id:        uuid('id').primaryKey().$defaultFn(genUUID),
  nama:      varchar('nama',      { length: 150 }).notNull(),
  url:       varchar('url',       { length: 500 }).notNull(),
  authMode:  authModeEnum('auth_mode').notNull().default('independent'),
  icon:      varchar('icon',      { length: 500 }),
  deskripsi: text('deskripsi'),
  urutan:    integer('urutan').notNull().default(0),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── App User Access ──────────────────────────────────────────────────────────
export const appUserAccess = pgTable('app_user_access', {
  id:          uuid('id').primaryKey().$defaultFn(genUUID),
  userId:      uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  appId:       uuid('app_id').notNull().references(() => aplikasi.id, { onDelete: 'cascade' }),
  grantedAt:   timestamp('granted_at').notNull().defaultNow(),
  grantedById: uuid('granted_by').references(() => user.id),
})

// ─── Refresh Token ──────────────────────────────────────────────────────────────
// Long-lived token untuk auto-renew access token.
// Setiap login generate satu refresh token baru (bisa multi-device).
export const refreshToken = pgTable('refresh_token', {
  id:         uuid('id').primaryKey().$defaultFn(genUUID),
  userId:     uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  tokenHash:  varchar('token_hash', { length: 500 }).notNull().unique(),
  issuedAt:   timestamp('issued_at').notNull().defaultNow(),
  expiresAt:  timestamp('expires_at').notNull(),
  isRevoked:  boolean('is_revoked').notNull().default(false),
})

// ─── SSO Token ────────────────────────────────────────────────────────────────
// Short-lived token (5 menit) saat user klik aplikasi SSO di portal.
// Aplikasi target melakukan POST /api/sso/verify dengan token ini.
export const ssoToken = pgTable('sso_token', {
  id:        uuid('id').primaryKey().$defaultFn(genUUID),
  userId:    uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  appId:     uuid('app_id').notNull().references(() => aplikasi.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 500 }).notNull(),
  issuedAt:  timestamp('issued_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  isRevoked: boolean('is_revoked').notNull().default(false),
})

// ─── Relations ────────────────────────────────────────────────────────────────
export const userRelations = relations(user, ({ one, many }) => ({
  employee:      one(employee,     { fields: [user.employeeId], references: [employee.id] }),
  appAccesses:   many(appUserAccess),
  ssoTokens:     many(ssoToken),
  refreshTokens: many(refreshToken),
}))

export const refreshTokenRelations = relations(refreshToken, ({ one }) => ({
  user: one(user, { fields: [refreshToken.userId], references: [user.id] }),
}))

export const aplikasiRelations = relations(aplikasi, ({ many }) => ({
  appAccesses: many(appUserAccess),
  ssoTokens:   many(ssoToken),
}))

export const appUserAccessRelations = relations(appUserAccess, ({ one }) => ({
  user:      one(user,     { fields: [appUserAccess.userId],      references: [user.id],     relationName: 'user' }),
  app:       one(aplikasi, { fields: [appUserAccess.appId],       references: [aplikasi.id] }),
  grantedBy: one(user,     { fields: [appUserAccess.grantedById], references: [user.id],     relationName: 'grantedBy' }),
}))

export const ssoTokenRelations = relations(ssoToken, ({ one }) => ({
  user: one(user,     { fields: [ssoToken.userId], references: [user.id] }),
  app:  one(aplikasi, { fields: [ssoToken.appId],  references: [aplikasi.id] }),
}))
