import crypto from 'crypto'
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { employee } from './employee'
import { refGrade } from './master'
import { unitOrganisasi } from './organisasi'

const genUUID = () => crypto.randomUUID()

export const documentAccessTypeEnum = pgEnum('document_access_type', [
  'view',
  'edit',
  'approve',
])

export const documentDownloadStatusEnum = pgEnum('document_download_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
])

export const documentAuditActionEnum = pgEnum('document_audit_action', [
  'view',
  'download_request',
  'download_approved',
  'download_rejected',
  'downloaded',
  'uploaded',
  'edited',
  'deleted',
  'revised',
])

export const documentCategories = pgTable('document_categories', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  name: varchar('name', { length: 150 }).notNull(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  categoryId: uuid('category_id').notNull().references(() => documentCategories.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description'),
  filePath: varchar('file_path', { length: 500 }).notNull().unique(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 150 }).notNull(),
  ownerUnitId: uuid('owner_unit_id').references(() => unitOrganisasi.id, { onDelete: 'restrict' }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => employee.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check('documents_file_size_check', sql`${table.fileSize} > 0`),
  check('documents_version_check', sql`${table.version} >= 1`),
  index('documents_category_id_idx').on(table.categoryId),
  index('documents_owner_unit_id_idx').on(table.ownerUnitId),
  index('documents_uploaded_by_idx').on(table.uploadedBy),
  index('documents_active_created_idx').on(table.isActive, table.createdAt),
])

export const documentAccessRules = pgTable('document_access_rules', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }),
  documentCategoryId: uuid('document_category_id').references(() => documentCategories.id, { onDelete: 'cascade' }),
  unitOrganisasiId: uuid('unit_organisasi_id').references(() => unitOrganisasi.id, { onDelete: 'restrict' }),
  includeDescendants: boolean('include_descendants').notNull().default(true),
  minGradeLevel: integer('min_grade_level').references(() => refGrade.level, {
    onUpdate: 'cascade',
    onDelete: 'restrict',
  }),
  accessType: documentAccessTypeEnum('access_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check('document_access_rules_target_check', sql`${table.documentId} IS NOT NULL OR ${table.documentCategoryId} IS NOT NULL`),
  index('document_access_rules_document_idx').on(table.documentId, table.accessType),
  index('document_access_rules_category_idx').on(table.documentCategoryId, table.accessType),
  index('document_access_rules_unit_idx').on(table.unitOrganisasiId),
])

export const documentApprovers = pgTable('document_approvers', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  documentCategoryId: uuid('document_category_id').references(() => documentCategories.id, { onDelete: 'cascade' }),
  unitOrganisasiId: uuid('unit_organisasi_id').references(() => unitOrganisasi.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employee.id, { onDelete: 'restrict' }),
  approvalOrder: integer('approval_order').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check('document_approvers_target_check', sql`${table.documentCategoryId} IS NOT NULL OR ${table.unitOrganisasiId} IS NOT NULL`),
  check('document_approvers_order_check', sql`${table.approvalOrder} >= 1`),
  index('document_approvers_category_idx').on(table.documentCategoryId),
  index('document_approvers_unit_idx').on(table.unitOrganisasiId),
  index('document_approvers_employee_idx').on(table.employeeId),
])

export const documentDownloadRequests = pgTable('document_download_requests', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'restrict' }),
  requestedBy: uuid('requested_by').notNull().references(() => employee.id, { onDelete: 'restrict' }),
  status: documentDownloadStatusEnum('status').notNull().default('pending'),
  reason: text('reason'),
  approverId: uuid('approver_id').references(() => employee.id, { onDelete: 'restrict' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  downloadToken: uuid('download_token').unique(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('document_download_requests_document_idx').on(table.documentId),
  index('document_download_requests_requester_idx').on(table.requestedBy, table.createdAt),
  index('document_download_requests_approver_idx').on(table.approverId),
  index('document_download_requests_status_idx').on(table.status, table.createdAt),
  uniqueIndex('document_download_requests_pending_uidx')
    .on(table.documentId, table.requestedBy)
    .where(sql`${table.status} = 'pending'`),
])

export const documentAuditLog = pgTable('document_audit_log', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'restrict' }),
  employeeId: uuid('employee_id').notNull().references(() => employee.id, { onDelete: 'restrict' }),
  action: documentAuditActionEnum('action').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('document_audit_log_document_idx').on(table.documentId, table.createdAt),
  index('document_audit_log_employee_idx').on(table.employeeId, table.createdAt),
  index('document_audit_log_action_idx').on(table.action, table.createdAt),
])

export const documentVersions = pgTable('document_versions', {
  id: uuid('id').primaryKey().$defaultFn(genUUID),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  filePath: varchar('file_path', { length: 500 }).notNull(),
  fileSize: integer('file_size').notNull(),
  mimeType: varchar('mime_type', { length: 150 }).notNull(),
  changelog: text('changelog'),
  uploadedBy: uuid('uploaded_by').notNull().references(() => employee.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('document_versions_document_idx').on(table.documentId, table.version),
  uniqueIndex('document_versions_doc_ver_uidx').on(table.documentId, table.version),
])

export const documentCategoryRelations = relations(documentCategories, ({ many }) => ({
  documents: many(documents),
  accessRules: many(documentAccessRules),
  approvers: many(documentApprovers),
}))

export const documentRelations = relations(documents, ({ one, many }) => ({
  category: one(documentCategories, { fields: [documents.categoryId], references: [documentCategories.id] }),
  ownerUnit: one(unitOrganisasi, { fields: [documents.ownerUnitId], references: [unitOrganisasi.id] }),
  uploader: one(employee, { fields: [documents.uploadedBy], references: [employee.id] }),
  accessRules: many(documentAccessRules),
  downloadRequests: many(documentDownloadRequests),
  auditLogs: many(documentAuditLog),
  versions: many(documentVersions),
}))

export const documentAccessRuleRelations = relations(documentAccessRules, ({ one }) => ({
  document: one(documents, { fields: [documentAccessRules.documentId], references: [documents.id] }),
  category: one(documentCategories, { fields: [documentAccessRules.documentCategoryId], references: [documentCategories.id] }),
  unit: one(unitOrganisasi, { fields: [documentAccessRules.unitOrganisasiId], references: [unitOrganisasi.id] }),
}))

export const documentApproverRelations = relations(documentApprovers, ({ one }) => ({
  category: one(documentCategories, { fields: [documentApprovers.documentCategoryId], references: [documentCategories.id] }),
  unit: one(unitOrganisasi, { fields: [documentApprovers.unitOrganisasiId], references: [unitOrganisasi.id] }),
  employee: one(employee, { fields: [documentApprovers.employeeId], references: [employee.id] }),
}))

export const documentDownloadRequestRelations = relations(documentDownloadRequests, ({ one }) => ({
  document: one(documents, { fields: [documentDownloadRequests.documentId], references: [documents.id] }),
  requester: one(employee, { fields: [documentDownloadRequests.requestedBy], references: [employee.id], relationName: 'document_requester' }),
  approver: one(employee, { fields: [documentDownloadRequests.approverId], references: [employee.id], relationName: 'document_request_approver' }),
}))

export const documentAuditLogRelations = relations(documentAuditLog, ({ one }) => ({
  document: one(documents, { fields: [documentAuditLog.documentId], references: [documents.id] }),
  employee: one(employee, { fields: [documentAuditLog.employeeId], references: [employee.id] }),
}))
