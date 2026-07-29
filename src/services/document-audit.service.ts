import { and, count, desc, eq, gte, ilike, lte, or, SQL } from 'drizzle-orm'
import { db } from '../db'
import { documentAuditLog, documents, employee } from '../db/schema'
import { buildMeta, getPaginationParams } from '../utils/pagination'
import type { ListDocumentAuditQuery } from '../validators/document.validator'

export type DocumentAuditAction = typeof documentAuditLog.$inferInsert.action

export async function logDocumentAction(input: {
  documentId: string
  employeeId: string
  action: DocumentAuditAction
  metadata?: Record<string, unknown> | null
}, executor: any = db) {
  const [created] = await executor.insert(documentAuditLog).values({
    documentId: input.documentId,
    employeeId: input.employeeId,
    action: input.action,
    metadata: input.metadata ?? null,
  }).returning()
  return created
}

export async function listDocumentAuditService(query: ListDocumentAuditQuery) {
  const { page, limit, offset } = getPaginationParams(query)
  const conditions: SQL[] = []
  if (query.documentId) conditions.push(eq(documentAuditLog.documentId, query.documentId))
  if (query.employeeId) conditions.push(eq(documentAuditLog.employeeId, query.employeeId))
  if (query.action) conditions.push(eq(documentAuditLog.action, query.action))
  if (query.startDate) conditions.push(gte(documentAuditLog.createdAt, new Date(`${query.startDate}T00:00:00.000Z`)))
  if (query.endDate) conditions.push(lte(documentAuditLog.createdAt, new Date(`${query.endDate}T23:59:59.999Z`)))
  if (query.search) {
    conditions.push(or(
      ilike(documents.title, `%${query.search}%`),
      ilike(employee.nama, `%${query.search}%`),
    )!)
  }
  const where = conditions.length ? and(...conditions) : undefined

  const base = db
    .select({
      id: documentAuditLog.id,
      documentId: documentAuditLog.documentId,
      documentTitle: documents.title,
      employeeId: documentAuditLog.employeeId,
      employeeName: employee.nama,
      employeeNrk: employee.nrk,
      action: documentAuditLog.action,
      metadata: documentAuditLog.metadata,
      createdAt: documentAuditLog.createdAt,
    })
    .from(documentAuditLog)
    .innerJoin(documents, eq(documentAuditLog.documentId, documents.id))
    .innerJoin(employee, eq(documentAuditLog.employeeId, employee.id))

  const countBase = db
    .select({ total: count() })
    .from(documentAuditLog)
    .innerJoin(documents, eq(documentAuditLog.documentId, documents.id))
    .innerJoin(employee, eq(documentAuditLog.employeeId, employee.id))

  const rows = await (where ? base.where(where) : base).orderBy(desc(documentAuditLog.createdAt)).limit(limit).offset(offset)
  const [{ total }] = await (where ? countBase.where(where) : countBase)
  return { rows, meta: buildMeta(page, limit, Number(total)) }
}
