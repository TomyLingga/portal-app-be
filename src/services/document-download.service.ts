import crypto from 'crypto'
import { and, count, desc, eq, gt, ilike, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import {
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
  assertDocumentViewAccess,
  checkDocumentViewAccess,
  getDocumentAccessContext,
  getDocumentActorContext,
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
      // Semua permintaan dari karyawan dipusatkan ke seluruh admin aktif.
      // Array kosong pada notifyEmployees berarti penerimanya hanya role super_admin.
      await notifyEmployees([], {
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
  if (actor.role !== 'super_admin') {
    throw httpError(403, 'Hanya administrator yang dapat memproses permintaan download dokumen')
  }
  if (action === 'reject' && !rejectionReason) throw httpError(422, 'Alasan penolakan wajib diisi')

  const token = action === 'approve' ? crypto.randomUUID() : null
  const updated = await db.transaction(async tx => {
    const [row] = await tx.update(documentDownloadRequests).set({
      status: action === 'approve' ? 'approved' : 'rejected',
      approverId: actor.employeeId || null,
      approvedAt: action === 'approve' ? new Date() : null,
      rejectionReason: action === 'reject' ? rejectionReason : null,
      downloadToken: token,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(documentDownloadRequests.id, requestId),
      eq(documentDownloadRequests.status, 'pending'),
    )).returning()
    if (!row) throw httpError(409, 'Permintaan download ini sudah diproses')
    if (actor.employeeId) {
      await logDocumentAction({
        documentId: requestRow.documentId,
        employeeId: actor.employeeId,
        action: action === 'approve' ? 'download_approved' : 'download_rejected',
        metadata: { requestId, rejectionReason: action === 'reject' ? rejectionReason : null },
      }, tx)
    }
    return row
  })

  try {
    await notifyEmployees([requestRow.requestedBy], {
      type: action === 'approve' ? 'document_download_approved' : 'document_download_rejected',
      title: action === 'approve' ? 'Download dokumen disetujui' : 'Download dokumen ditolak',
      message: action === 'approve'
        ? `Permintaan download "${requestRow.documentTitle}" disetujui (1x unduh).`
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
  const now = new Date()
  const conditions = [eq(documentDownloadRequests.requestedBy, actor.employeeId!)]

  if (query.scope === 'approved') {
    conditions.push(
      eq(documentDownloadRequests.status, 'approved'),
      isNull(documentDownloadRequests.downloadedAt),
      or(isNull(documentDownloadRequests.tokenExpiresAt), gt(documentDownloadRequests.tokenExpiresAt, now))!
    )
  } else if (query.scope === 'pending') {
    conditions.push(eq(documentDownloadRequests.status, 'pending'))
  } else if (query.scope === 'history') {
    if (query.status === 'rejected') {
      conditions.push(eq(documentDownloadRequests.status, 'rejected'))
    } else if (query.status === 'used') {
      conditions.push(and(
        eq(documentDownloadRequests.status, 'approved'),
        isNotNull(documentDownloadRequests.downloadedAt)
      )!)
    } else if (query.status === 'expired') {
      conditions.push(and(
        eq(documentDownloadRequests.status, 'approved'),
        isNull(documentDownloadRequests.downloadedAt),
        isNotNull(documentDownloadRequests.tokenExpiresAt),
        lte(documentDownloadRequests.tokenExpiresAt, now)
      )!)
    } else {
      conditions.push(
        or(
          eq(documentDownloadRequests.status, 'rejected'),
          isNotNull(documentDownloadRequests.downloadedAt),
          and(
            eq(documentDownloadRequests.status, 'approved'),
            isNotNull(documentDownloadRequests.tokenExpiresAt),
            lte(documentDownloadRequests.tokenExpiresAt, now)
          )
        )!
      )
    }
  } else {
    if (query.status) {
      if (query.status === 'used') {
        conditions.push(and(
          eq(documentDownloadRequests.status, 'approved'),
          isNotNull(documentDownloadRequests.downloadedAt)
        )!)
      } else if (query.status === 'expired') {
        conditions.push(and(
          eq(documentDownloadRequests.status, 'approved'),
          isNull(documentDownloadRequests.downloadedAt),
          isNotNull(documentDownloadRequests.tokenExpiresAt),
          lte(documentDownloadRequests.tokenExpiresAt, now)
        )!)
      } else if (query.status === 'pending' || query.status === 'approved' || query.status === 'rejected') {
        conditions.push(eq(documentDownloadRequests.status, query.status))
      }
    }
  }

  if (query.documentId) conditions.push(eq(documentDownloadRequests.documentId, query.documentId))
  if (query.categoryId) conditions.push(eq(documents.categoryId, query.categoryId))
  if (query.search) {
    const s = `%${query.search}%`
    conditions.push(or(
      ilike(documents.title, s),
      ilike(documentDownloadRequests.reason, s),
      ilike(documentCategories.name, s),
    )!)
  }

  const whereCondition = and(...conditions)
  const [totalRow] = await db.select({ total: count() })
    .from(documentDownloadRequests)
    .innerJoin(documents, eq(documentDownloadRequests.documentId, documents.id))
    .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .where(whereCondition)
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

  const processedRows = rows.map(r => {
    const isConsumedOrExpired = r.status === 'approved' && (Boolean(r.downloadedAt) || (r.tokenExpiresAt && new Date(r.tokenExpiresAt) <= now))
    return {
      ...r,
      status: isConsumedOrExpired ? (r.downloadedAt ? 'used' : 'expired') : r.status,
      downloadToken: isConsumedOrExpired ? null : r.downloadToken,
    }
  })

  return { rows: processedRows, meta: buildMeta(page, limit, total) }
}

export async function listPendingDownloadRequestsService(userId: string, query: ListDownloadRequestsQuery) {
  const actor = await getDocumentActorContext(userId)
  if (actor.role !== 'super_admin') {
    throw httpError(403, 'Hanya administrator yang dapat melihat antrean persetujuan download')
  }
  const { page, limit, offset } = getPaginationParams(query)
  const requester = alias(employee, 'pending_requester_employee')
  const reqStatus = (query.status === 'pending' || query.status === 'approved' || query.status === 'rejected' || query.status === 'expired') ? query.status : 'pending'
  const conditions = [eq(documentDownloadRequests.status, reqStatus)]
  if (query.documentId) conditions.push(eq(documentDownloadRequests.documentId, query.documentId))
  if (query.categoryId) conditions.push(eq(documents.categoryId, query.categoryId))
  if (query.search) {
    const s = `%${query.search}%`
    conditions.push(or(
      ilike(documents.title, s),
      ilike(documentDownloadRequests.reason, s),
      ilike(requester.nama, s),
      ilike(requester.nrk, s),
      ilike(documentCategories.name, s),
    )!)
  }
  const whereCondition = and(...conditions)

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

  const [totalRow] = await db.select({ total: count() })
    .from(documentDownloadRequests)
    .innerJoin(documents, eq(documentDownloadRequests.documentId, documents.id))
    .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .innerJoin(requester, eq(documentDownloadRequests.requestedBy, requester.id))
    .where(whereCondition)

  return { rows, meta: buildMeta(page, limit, Number(totalRow?.total || 0)) }
}

export async function getDocumentCapabilitiesService(userId: string) {
  const actor = await getDocumentActorContext(userId, false)
  const isSuperAdmin = actor.role === 'super_admin'
  const now = new Date()

  let pendingApprovalCount = 0
  if (isSuperAdmin) {
    const [countRow] = await db.select({ total: count() })
      .from(documentDownloadRequests)
      .where(eq(documentDownloadRequests.status, 'pending'))
    pendingApprovalCount = Number(countRow?.total || 0)
  }

  let myPendingCount = 0
  let myApprovedCount = 0
  if (actor.employeeId) {
    const [pendingRow] = await db.select({ total: count() })
      .from(documentDownloadRequests)
      .where(and(
        eq(documentDownloadRequests.requestedBy, actor.employeeId),
        eq(documentDownloadRequests.status, 'pending')
      ))
    myPendingCount = Number(pendingRow?.total || 0)

    const [approvedRow] = await db.select({ total: count() })
      .from(documentDownloadRequests)
      .where(and(
        eq(documentDownloadRequests.requestedBy, actor.employeeId),
        eq(documentDownloadRequests.status, 'approved'),
        isNull(documentDownloadRequests.downloadedAt),
        or(isNull(documentDownloadRequests.tokenExpiresAt), gt(documentDownloadRequests.tokenExpiresAt, now))
      ))
    myApprovedCount = Number(approvedRow?.total || 0)
  }

  return {
    canManage: isSuperAdmin,
    canApproveDownload: isSuperAdmin,
    canViewAudit: isSuperAdmin,
    pendingApprovalCount,
    myPendingCount,
    myApprovedCount,
  }
}

export async function claimDocumentDownloadTokenService(token: string, metadata?: Record<string, unknown>) {
  const now = new Date()
  const claimed = await db.transaction(async tx => {
    /*
     * Token unduh sekali pakai.
     *
     * Dulu `downloadedAt` di-set dengan COALESCE tanpa dipakai sebagai syarat, jadi
     * satu link tetap sah berulang kali sampai masa berlakunya habis (bisa sampai
     * 365 hari) — padahal token itu berada di path URL sehingga mudah bocor lewat
     * riwayat browser, log proxy, atau diteruskan ke orang lain. Sekarang klaim
     * hanya berhasil bila `downloaded_at` masih NULL, dan operasinya atomik dalam
     * satu UPDATE ... RETURNING sehingga dua permintaan paralel tidak bisa
     * dua-duanya lolos.
     */
    const [requestRow] = await tx.update(documentDownloadRequests).set({
      downloadedAt: now,
      updatedAt: now,
    }).where(and(
      eq(documentDownloadRequests.downloadToken, token),
      eq(documentDownloadRequests.status, 'approved'),
      isNull(documentDownloadRequests.downloadedAt),
      or(isNull(documentDownloadRequests.tokenExpiresAt), gt(documentDownloadRequests.tokenExpiresAt, now)),
    )).returning()
    if (!requestRow) return null
    const [document] = await tx.select({
      id: documents.id,
      title: documents.title,
      version: documents.version,
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
        version: document?.version || 1,
        requestId: requestRow.id,
        documentId: requestRow.documentId,
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
