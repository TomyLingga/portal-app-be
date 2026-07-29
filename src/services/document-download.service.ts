import crypto from 'crypto'
import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import {
  documentApprovers,
  documentAuditLog,
  documentCategories,
  documentDownloadRequests,
  documents,
  employee,
  unitOrganisasi,
} from '../db/schema'
import { buildMeta, getPaginationParams } from '../utils/pagination'
import { httpError } from '../utils/httpError'
import type { ListDownloadRequestsQuery } from '../validators/document.validator'
import {
  assertDocumentApprover,
  assertDocumentViewAccess,
  checkDocumentViewAccess,
  getDocumentAccessContext,
  getDocumentActorContext,
  listMatchingApproverIds,
} from './document-access.service'
import { logDocumentAction } from './document-audit.service'
import { assertDocumentFileAvailable } from './document-storage.service'
import { notifyEmployees } from './notification.service'

const TOKEN_LIFETIME_MS = 60 * 60 * 1000

function tokenExpiry() {
  return new Date(Date.now() + TOKEN_LIFETIME_MS)
}

async function expireApprovedRequest(id: string) {
  await db.update(documentDownloadRequests).set({
    status: 'expired',
    downloadToken: null,
    updatedAt: new Date(),
  }).where(and(
    eq(documentDownloadRequests.id, id),
    eq(documentDownloadRequests.status, 'approved'),
    isNull(documentDownloadRequests.downloadedAt),
  ))
}

export async function getDocumentDownloadStatusService(userId: string, documentId: string) {
  const actor = await getDocumentActorContext(userId)
  const canView = actor.role === 'super_admin' || (actor.employeeId ? await checkDocumentViewAccess(actor.employeeId, documentId) : false)
  if (!canView) return { canView: false, request: null }
  const context = await getDocumentAccessContext(documentId)
  const [latest] = await db.select().from(documentDownloadRequests)
    .where(and(
      eq(documentDownloadRequests.documentId, documentId),
      eq(documentDownloadRequests.requestedBy, actor.employeeId!),
    ))
    .orderBy(desc(documentDownloadRequests.createdAt)).limit(1)

  const now = new Date()
  const isApproved = latest?.status === 'approved'
  const isExpired = isApproved && latest?.tokenExpiresAt && new Date(latest.tokenExpiresAt) <= now

  if (isExpired && latest) {
    await expireApprovedRequest(latest.id)
    latest.status = 'expired'
    latest.downloadToken = null
  }

  const isTokenActive = isApproved && !isExpired && Boolean(latest?.downloadToken)

  return {
    canView: true,
    request: latest ? {
      id: latest.id,
      status: latest.status,
      reason: latest.reason,
      rejectionReason: latest.rejectionReason,
      downloadToken: isTokenActive ? latest.downloadToken : null,
      tokenExpiresAt: latest.tokenExpiresAt,
      downloadedAt: latest.downloadedAt,
      createdAt: latest.createdAt,
      updatedAt: latest.updatedAt,
    } : null,
  }
}

export async function requestDocumentDownloadService(userId: string, documentId: string, reason?: string | null) {
  const actor = await getDocumentActorContext(userId)
  if (actor.role !== 'super_admin') {
    await assertDocumentViewAccess(actor.employeeId!, documentId)
  }
  const context = await getDocumentAccessContext(documentId)
  assertDocumentFileAvailable(context.filePath)

  const [pending] = await db.select().from(documentDownloadRequests).where(and(
    eq(documentDownloadRequests.documentId, documentId),
    eq(documentDownloadRequests.requestedBy, actor.employeeId!),
    eq(documentDownloadRequests.status, 'pending'),
  )).limit(1)
  if (pending) return { requestId: pending.id, status: pending.status, downloadToken: null, tokenExpiresAt: null }

  const autoApproved = actor.role === 'super_admin'
  const approverIds = autoApproved ? [] : await listMatchingApproverIds(documentId)
  if (!autoApproved && !approverIds.length) {
    throw httpError(409, 'Approver download belum dikonfigurasi untuk kategori atau unit pemilik dokumen ini')
  }

  const token = autoApproved ? crypto.randomUUID() : null
  const expiresAt = autoApproved ? tokenExpiry() : null
  let created: typeof documentDownloadRequests.$inferSelect
  try {
    created = await db.transaction(async tx => {
      const [row] = await tx.insert(documentDownloadRequests).values({
        documentId,
        requestedBy: actor.employeeId!,
        reason: reason || null,
        status: autoApproved ? 'approved' : 'pending',
        approvedAt: autoApproved ? new Date() : null,
        downloadToken: token,
        tokenExpiresAt: expiresAt,
      }).returning()
      await logDocumentAction({
        documentId,
        employeeId: actor.employeeId!,
        action: 'download_request',
        metadata: { requestId: row.id, autoApproved, reason: reason || null },
      }, tx)
      if (autoApproved) {
        await logDocumentAction({
          documentId,
          employeeId: actor.employeeId!,
          action: 'download_approved',
          metadata: { requestId: row.id, autoApproved: true },
        }, tx)
      }
      return row
    })
  } catch (error: any) {
    if (error?.code !== '23505' && error?.cause?.code !== '23505') throw error
    const [existing] = await db.select().from(documentDownloadRequests).where(and(
      eq(documentDownloadRequests.documentId, documentId),
      eq(documentDownloadRequests.requestedBy, actor.employeeId!),
      eq(documentDownloadRequests.status, 'pending'),
    )).limit(1)
    if (!existing) throw error
    created = existing
  }

  if (!autoApproved) {
    try {
      await notifyEmployees(approverIds, {
        type: 'document_download_request',
        title: 'Permintaan download dokumen',
        message: `${actor.employeeName || actor.employeeNrk || 'Karyawan'} meminta akses download untuk "${context.title}".`,
        entityType: 'document_download_request',
        entityId: created.id,
      })
    } catch (error) {
      console.error('[DocumentDownload] Request tersimpan, tetapi notifikasi approver gagal dikirim:', error)
    }
  }

  return {
    requestId: created.id,
    status: created.status,
    downloadToken: autoApproved ? created.downloadToken : null,
    tokenExpiresAt: autoApproved ? created.tokenExpiresAt : null,
  }
}

export async function decideDocumentDownloadService(
  userId: string,
  requestId: string,
  action: 'approve' | 'reject',
  rejectionReason?: string | null,
  validityDays?: number,
) {
  const actor = await getDocumentActorContext(userId)
  const requester = alias(employee, 'document_requester_employee')
  const [requestRow] = await db.select({
    id: documentDownloadRequests.id,
    documentId: documentDownloadRequests.documentId,
    requestedBy: documentDownloadRequests.requestedBy,
    status: documentDownloadRequests.status,
    documentTitle: documents.title,
    requesterName: requester.nama,
  }).from(documentDownloadRequests)
    .innerJoin(documents, eq(documentDownloadRequests.documentId, documents.id))
    .innerJoin(requester, eq(documentDownloadRequests.requestedBy, requester.id))
    .where(eq(documentDownloadRequests.id, requestId)).limit(1)
  if (!requestRow) throw httpError(404, 'Permintaan download tidak ditemukan')
  if (requestRow.status !== 'pending') throw httpError(409, 'Permintaan download ini sudah diproses')
  await assertDocumentApprover(actor.employeeId!, requestRow.documentId, requestRow.requestedBy)
  if (action === 'reject' && !rejectionReason) throw httpError(422, 'Alasan penolakan wajib diisi')

  const days = Math.min(365, Math.max(1, Number(validityDays) || 7))
  const token = action === 'approve' ? crypto.randomUUID() : null
  const expiresAt = action === 'approve' ? new Date(Date.now() + (days * 24 * 60 * 60 * 1000)) : null
  const updated = await db.transaction(async tx => {
    const [row] = await tx.update(documentDownloadRequests).set({
      status: action === 'approve' ? 'approved' : 'rejected',
      approverId: actor.employeeId!,
      approvedAt: action === 'approve' ? new Date() : null,
      rejectionReason: action === 'reject' ? rejectionReason : null,
      downloadToken: token,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    }).where(and(
      eq(documentDownloadRequests.id, requestId),
      eq(documentDownloadRequests.status, 'pending'),
    )).returning()
    if (!row) throw httpError(409, 'Permintaan download ini sudah diproses')
    await logDocumentAction({
      documentId: requestRow.documentId,
      employeeId: actor.employeeId!,
      action: action === 'approve' ? 'download_approved' : 'download_rejected',
      metadata: { requestId, rejectionReason: action === 'reject' ? rejectionReason : null, validityDays: days },
    }, tx)
    return row
  })

  try {
    const formattedDate = expiresAt ? expiresAt.toLocaleDateString('id-ID', { dateStyle: 'medium' }) : ''
    await notifyEmployees([requestRow.requestedBy], {
      type: action === 'approve' ? 'document_download_approved' : 'document_download_rejected',
      title: action === 'approve' ? 'Download dokumen disetujui' : 'Download dokumen ditolak',
      message: action === 'approve'
        ? `Permintaan download "${requestRow.documentTitle}" disetujui. Akses unduh berlaku ${days} hari (hingga ${formattedDate}).`
        : `Permintaan download "${requestRow.documentTitle}" ditolak: ${rejectionReason}`,
      entityType: 'document_download_request',
      entityId: requestId,
    })
  } catch (error) {
    console.error('[DocumentDownload] Keputusan tersimpan, tetapi notifikasi pemohon gagal dikirim:', error)
  }
  return updated
}

export async function listMyDownloadRequestsService(userId: string, query: ListDownloadRequestsQuery) {
  const actor = await getDocumentActorContext(userId)
  const { page, limit, offset } = getPaginationParams(query)
  const conditions = [eq(documentDownloadRequests.requestedBy, actor.employeeId!)]
  if (query.status) conditions.push(eq(documentDownloadRequests.status, query.status))

  const whereCondition = and(...conditions)
  const [totalRow] = await db.select({ total: count() }).from(documentDownloadRequests).where(whereCondition)
  const total = Number(totalRow?.total || 0)

  const rows = await db.select({
    id: documentDownloadRequests.id,
    documentId: documentDownloadRequests.documentId,
    documentTitle: documents.title,
    categoryName: documentCategories.name,
    ownerUnitName: unitOrganisasi.nama,
    status: documentDownloadRequests.status,
    reason: documentDownloadRequests.reason,
    rejectionReason: documentDownloadRequests.rejectionReason,
    downloadToken: documentDownloadRequests.downloadToken,
    tokenExpiresAt: documentDownloadRequests.tokenExpiresAt,
    downloadedAt: documentDownloadRequests.downloadedAt,
    createdAt: documentDownloadRequests.createdAt,
    updatedAt: documentDownloadRequests.updatedAt,
  }).from(documentDownloadRequests)
    .innerJoin(documents, eq(documentDownloadRequests.documentId, documents.id))
    .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .leftJoin(unitOrganisasi, eq(documents.ownerUnitId, unitOrganisasi.id))
    .where(whereCondition)
    .orderBy(desc(documentDownloadRequests.createdAt)).limit(limit).offset(offset)

  const now = new Date()
  const processedRows = rows.map(r => {
    const isExpired = r.status === 'approved' && r.tokenExpiresAt && new Date(r.tokenExpiresAt) <= now
    return {
      ...r,
      status: isExpired ? 'expired' : r.status,
      downloadToken: isExpired ? null : r.downloadToken,
    }
  })

  return { rows: processedRows, meta: buildMeta(page, limit, total) }
}

export async function listPendingDownloadRequestsService(userId: string, query: ListDownloadRequestsQuery) {
  const actor = await getDocumentActorContext(userId)
  const { page, limit, offset } = getPaginationParams(query)
  const requester = alias(employee, 'pending_requester_employee')
  const reqStatus = query.status || 'pending'

  if (actor.role === 'super_admin') {
    const baseConditions = [eq(documentDownloadRequests.status, reqStatus)]
    const whereCondition = and(...baseConditions)

    const rows = await db.selectDistinct({
      id: documentDownloadRequests.id,
      documentId: documentDownloadRequests.documentId,
      documentTitle: documents.title,
      categoryName: documentCategories.name,
      ownerUnitName: unitOrganisasi.nama,
      requestedBy: documentDownloadRequests.requestedBy,
      requesterName: requester.nama,
      requesterNrk: requester.nrk,
      status: documentDownloadRequests.status,
      reason: documentDownloadRequests.reason,
      createdAt: documentDownloadRequests.createdAt,
    }).from(documentDownloadRequests)
      .innerJoin(documents, eq(documentDownloadRequests.documentId, documents.id))
      .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
      .innerJoin(requester, eq(documentDownloadRequests.requestedBy, requester.id))
      .leftJoin(unitOrganisasi, eq(documents.ownerUnitId, unitOrganisasi.id))
      .where(whereCondition)
      .orderBy(desc(documentDownloadRequests.createdAt)).limit(limit).offset(offset)

    const [totalRow] = await db.select({ total: sql<number>`count(distinct ${documentDownloadRequests.id})` })
      .from(documentDownloadRequests)
      .innerJoin(documents, eq(documentDownloadRequests.documentId, documents.id))
      .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
      .innerJoin(requester, eq(documentDownloadRequests.requestedBy, requester.id))
      .leftJoin(unitOrganisasi, eq(documents.ownerUnitId, unitOrganisasi.id))
      .where(whereCondition)

    return { rows, meta: buildMeta(page, limit, Number(totalRow?.total || 0)) }
  }

  const rows = await db.execute<any>(sql`
    WITH RECURSIVE requester_superiors AS (
      SELECT e.id AS req_id, e.atasan_id AS superior_id
      FROM employee e
      WHERE e.atasan_id IS NOT NULL
      UNION ALL
      SELECT s.req_id, parent_emp.atasan_id AS superior_id
      FROM employee parent_emp
      JOIN requester_superiors s ON s.superior_id = parent_emp.id
      WHERE parent_emp.atasan_id IS NOT NULL
    ), requester_unit_ancestors AS (
      SELECT e.id AS req_id, u.id AS unit_id, u.parent_id
      FROM unit_organisasi u
      JOIN employee e ON e.unit_organisasi_id = u.id
      UNION ALL
      SELECT s.req_id, parent.id AS unit_id, parent.parent_id
      FROM unit_organisasi parent
      JOIN requester_unit_ancestors s ON s.parent_id = parent.id
    ), doc_unit_ancestors AS (
      SELECT d.id AS doc_id, u.id AS unit_id, u.parent_id
      FROM unit_organisasi u
      JOIN documents d ON d.owner_unit_id = u.id
      UNION ALL
      SELECT s.doc_id, parent.id AS unit_id, parent.parent_id
      FROM unit_organisasi parent
      JOIN doc_unit_ancestors s ON s.parent_id = parent.id
    )
    SELECT DISTINCT
      r.id,
      r.document_id AS "documentId",
      d.title AS "documentTitle",
      c.name AS "categoryName",
      u.nama AS "ownerUnitName",
      r.requested_by AS "requestedBy",
      req.nama AS "requesterName",
      req.nrk AS "requesterNrk",
      r.status,
      r.reason,
      r.created_at AS "createdAt"
    FROM document_download_requests r
    JOIN documents d ON d.id = r.document_id
    JOIN document_categories c ON c.id = d.category_id
    JOIN employee req ON req.id = r.requested_by
    LEFT JOIN unit_organisasi u ON u.id = d.owner_unit_id
    WHERE r.status = ${reqStatus}::document_download_status
      AND (
        EXISTS (SELECT 1 FROM requester_superiors WHERE req_id = req.id AND superior_id = ${actor.employeeId}::uuid)
        OR EXISTS (
          SELECT 1 FROM document_approvers da
          WHERE da.employee_id = ${actor.employeeId}::uuid
            AND (
              da.document_category_id = d.category_id
              OR da.unit_organisasi_id IN (SELECT unit_id FROM requester_unit_ancestors WHERE req_id = req.id)
              OR da.unit_organisasi_id IN (SELECT unit_id FROM doc_unit_ancestors WHERE doc_id = d.id)
            )
        )
      )
    ORDER BY r.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `)

  const countResult = await db.execute<{ total: number }>(sql`
    WITH RECURSIVE requester_superiors AS (
      SELECT e.id AS req_id, e.atasan_id AS superior_id
      FROM employee e
      WHERE e.atasan_id IS NOT NULL
      UNION ALL
      SELECT s.req_id, parent_emp.atasan_id AS superior_id
      FROM employee parent_emp
      JOIN requester_superiors s ON s.superior_id = parent_emp.id
      WHERE parent_emp.atasan_id IS NOT NULL
    ), requester_unit_ancestors AS (
      SELECT e.id AS req_id, u.id AS unit_id, u.parent_id
      FROM unit_organisasi u
      JOIN employee e ON e.unit_organisasi_id = u.id
      UNION ALL
      SELECT s.req_id, parent.id AS unit_id, parent.parent_id
      FROM unit_organisasi parent
      JOIN requester_unit_ancestors s ON s.parent_id = parent.id
    ), doc_unit_ancestors AS (
      SELECT d.id AS doc_id, u.id AS unit_id, u.parent_id
      FROM unit_organisasi u
      JOIN documents d ON d.owner_unit_id = u.id
      UNION ALL
      SELECT s.doc_id, parent.id AS unit_id, parent.parent_id
      FROM unit_organisasi parent
      JOIN doc_unit_ancestors s ON s.parent_id = parent.id
    )
    SELECT COUNT(DISTINCT r.id)::int AS total
    FROM document_download_requests r
    JOIN documents d ON d.id = r.document_id
    JOIN employee req ON req.id = r.requested_by
    WHERE r.status = ${reqStatus}::document_download_status
      AND (
        EXISTS (SELECT 1 FROM requester_superiors WHERE req_id = req.id AND superior_id = ${actor.employeeId}::uuid)
        OR EXISTS (
          SELECT 1 FROM document_approvers da
          WHERE da.employee_id = ${actor.employeeId}::uuid
            AND (
              da.document_category_id = d.category_id
              OR da.unit_organisasi_id IN (SELECT unit_id FROM requester_unit_ancestors WHERE req_id = req.id)
              OR da.unit_organisasi_id IN (SELECT unit_id FROM doc_unit_ancestors WHERE doc_id = d.id)
            )
        )
      )
  `)

  const total = Number(countResult[0]?.total || 0)
  return { rows: Array.from(rows), meta: buildMeta(page, limit, total) }
}

export async function getDocumentCapabilitiesService(userId: string) {
  const actor = await getDocumentActorContext(userId, false)
  const isSuperAdmin = actor.role === 'super_admin'

  if (!actor.employeeId) {
    let pendingApprovalCount = 0
    if (isSuperAdmin) {
      const [countRow] = await db.select({ total: count() }).from(documentDownloadRequests).where(eq(documentDownloadRequests.status, 'pending'))
      pendingApprovalCount = Number(countRow?.total || 0)
    }
    return { canManage: isSuperAdmin, canApproveDownload: isSuperAdmin, canViewAudit: isSuperAdmin, pendingApprovalCount }
  }

  if (isSuperAdmin) {
    const [countRow] = await db.select({ total: count() }).from(documentDownloadRequests).where(eq(documentDownloadRequests.status, 'pending'))
    return { canManage: true, canApproveDownload: true, canViewAudit: true, pendingApprovalCount: Number(countRow?.total || 0) }
  }

  const countResult = await db.execute<{ total: number }>(sql`
    WITH RECURSIVE requester_superiors AS (
      SELECT e.id AS req_id, e.atasan_id AS superior_id
      FROM employee e
      WHERE e.atasan_id IS NOT NULL
      UNION ALL
      SELECT s.req_id, parent_emp.atasan_id AS superior_id
      FROM employee parent_emp
      JOIN requester_superiors s ON s.superior_id = parent_emp.id
      WHERE parent_emp.atasan_id IS NOT NULL
    ), requester_unit_ancestors AS (
      SELECT e.id AS req_id, u.id AS unit_id, u.parent_id
      FROM unit_organisasi u
      JOIN employee e ON e.unit_organisasi_id = u.id
      UNION ALL
      SELECT s.req_id, parent.id AS unit_id, parent.parent_id
      FROM unit_organisasi parent
      JOIN requester_unit_ancestors s ON s.parent_id = parent.id
    ), doc_unit_ancestors AS (
      SELECT d.id AS doc_id, u.id AS unit_id, u.parent_id
      FROM unit_organisasi u
      JOIN documents d ON d.owner_unit_id = u.id
      UNION ALL
      SELECT s.doc_id, parent.id AS unit_id, parent.parent_id
      FROM unit_organisasi parent
      JOIN doc_unit_ancestors s ON s.parent_id = parent.id
    )
    SELECT COUNT(DISTINCT r.id)::int AS total
    FROM document_download_requests r
    JOIN documents d ON d.id = r.document_id
    JOIN employee req ON req.id = r.requested_by
    WHERE r.status = 'pending'
      AND (
        EXISTS (SELECT 1 FROM requester_superiors WHERE req_id = req.id AND superior_id = ${actor.employeeId}::uuid)
        OR EXISTS (
          SELECT 1 FROM document_approvers da
          WHERE da.employee_id = ${actor.employeeId}::uuid
            AND (
              da.document_category_id = d.category_id
              OR da.unit_organisasi_id IN (SELECT unit_id FROM requester_unit_ancestors WHERE req_id = req.id)
              OR da.unit_organisasi_id IN (SELECT unit_id FROM doc_unit_ancestors WHERE doc_id = d.id)
            )
        )
      )
  `)

  const pendingApprovalCount = Number(countResult[0]?.total || 0)

  const [subordinateCountRow] = await db
    .select({ total: count() })
    .from(employee)
    .where(eq(employee.atasanId, actor.employeeId))
  const isSuperior = Number(subordinateCountRow?.total || 0) > 0

  const assignmentRows = await db.select({ id: documentApprovers.id })
    .from(documentApprovers).where(eq(documentApprovers.employeeId, actor.employeeId)).limit(1)

  const canApproveDownload = isSuperior || assignmentRows.length > 0 || pendingApprovalCount > 0

  return {
    canManage: false,
    canApproveDownload,
    canViewAudit: false,
    pendingApprovalCount,
  }
}

export async function claimDocumentDownloadTokenService(token: string, metadata?: Record<string, unknown>) {
  const now = new Date()
  const claimed = await db.transaction(async tx => {
    const [requestRow] = await tx.update(documentDownloadRequests).set({
      downloadedAt: sql`COALESCE(${documentDownloadRequests.downloadedAt}, NOW())`,
      updatedAt: now,
    }).where(and(
      eq(documentDownloadRequests.downloadToken, token),
      eq(documentDownloadRequests.status, 'approved'),
      gt(documentDownloadRequests.tokenExpiresAt, now),
    )).returning()
    if (!requestRow) return null
    const [document] = await tx.select({
      id: documents.id,
      title: documents.title,
      filePath: documents.filePath,
      fileSize: documents.fileSize,
      mimeType: documents.mimeType,
      isActive: documents.isActive,
      categoryName: documentCategories.name,
      categoryCode: documentCategories.code,
    }).from(documents)
      .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
      .where(eq(documents.id, requestRow.documentId)).limit(1)
    if (!document?.isActive) throw httpError(410, 'Dokumen sudah tidak aktif')
    const approverEmployee = alias(employee, 'token_approver_emp')
    const requesterEmployee = alias(employee, 'token_requester_emp')
    const [extraMeta] = await tx.select({
      requesterName: requesterEmployee.nama,
      requesterNrk: requesterEmployee.nrk,
      approverName: approverEmployee.nama,
    }).from(documentDownloadRequests)
      .leftJoin(requesterEmployee, eq(documentDownloadRequests.requestedBy, requesterEmployee.id))
      .leftJoin(approverEmployee, eq(documentDownloadRequests.approverId, approverEmployee.id))
      .where(eq(documentDownloadRequests.id, requestRow.id))
      .limit(1)

    const [countResult] = await tx.select({
      count: sql<number>`count(*)`
    }).from(documentAuditLog)
      .where(and(
        eq(documentAuditLog.documentId, requestRow.documentId),
        eq(documentAuditLog.action, 'downloaded'),
      ))
    const downloadCount = (Number(countResult?.count) || 0) + 1

    await logDocumentAction({
      documentId: requestRow.documentId,
      employeeId: requestRow.requestedBy,
      action: 'downloaded',
      metadata: { requestId: requestRow.id, ...metadata },
    }, tx)

    return {
      request: requestRow,
      document,
      watermark: {
        approverName: extraMeta?.approverName || 'Sistem Otomatis (Auto-Approved)',
        approvedAt: requestRow.approvedAt ? requestRow.approvedAt.toISOString() : (requestRow.updatedAt ? requestRow.updatedAt.toISOString() : now.toISOString()),
        downloadedAt: now.toISOString(),
        downloadCount,
        requesterName: extraMeta?.requesterName || 'Karyawan',
        requesterNrk: extraMeta?.requesterNrk || '-',
        reason: requestRow.reason || 'Kebutuhan pekerjaan',
        categoryName: document?.categoryName || 'Dokumen Resmi',
        categoryCode: document?.categoryCode || 'DOC',
        documentTitle: document?.title || '',
      },
    }
  })
  if (!claimed) {
    const [expired] = await db.select({ id: documentDownloadRequests.id }).from(documentDownloadRequests)
      .where(eq(documentDownloadRequests.downloadToken, token)).limit(1)
    if (expired) await expireApprovedRequest(expired.id)
    throw httpError(410, 'Token download tidak valid, sudah dipakai, atau telah kedaluwarsa')
  }
  return claimed
}
