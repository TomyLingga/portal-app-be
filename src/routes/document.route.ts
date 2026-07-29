import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { config } from '../config/env'
import { applyPdfWatermark } from '../services/watermark.service'
import {
  approveRejectRequestSchema,
  createAccessRuleSchema,
  createDocumentApproverSchema,
  createDocumentCategorySchema,
  createDocumentSchema,
  documentTreeQuerySchema,
  downloadRequestSchema,
  listAccessRulesQuerySchema,
  listApproversQuerySchema,
  listDocumentAuditQuerySchema,
  listDocumentsQuerySchema,
  listDownloadRequestsQuerySchema,
  updateDocumentCategorySchema,
  updateDocumentSchema,
} from '../validators/document.validator'
import {
  activateDocumentVersionService,
  createAccessRuleService,
  createDocumentApproverService,
  createDocumentCategoryService,
  createDocumentRevisionService,
  createDocumentService,
  deleteAccessRuleService,
  deleteDocumentApproverService,
  deleteDocumentCategoryService,
  getDocumentByIdService,
  getDocumentTreeService,
  getDocumentVersionFileService,
  listAccessRulesService,
  listDocumentApproversService,
  listDocumentCategoriesService,
  listDocumentRevisionsService,
  listDocumentsService,
  reactivateDocumentService,
  softDeleteDocumentService,
  updateAccessRuleService,
  updateDocumentApproverService,
  updateDocumentCategoryService,
  updateDocumentService,
} from '../services/document.service'
import {
  claimDocumentDownloadTokenService,
  decideDocumentDownloadService,
  getDocumentCapabilitiesService,
  getDocumentDownloadStatusService,
  listMyDownloadRequestsService,
  listPendingDownloadRequestsService,
  requestDocumentDownloadService,
} from '../services/document-download.service'
import { listDocumentAuditService } from '../services/document-audit.service'
import {
  deleteDocumentFile,
  documentDownloadName,
  getDocumentFile,
  saveDocumentFile,
} from '../services/document-storage.service'
import { httpError } from '../utils/httpError'
import { ok } from '../utils/response'
import { db } from '../db'
import { documentCategories, documents, employee } from '../db/schema'
import { eq } from 'drizzle-orm'

const idParamsSchema = z.object({ id: z.string().uuid() })
const tokenParamsSchema = z.object({ token: z.string().uuid() })
const previewTokenSchema = z.object({ token: z.string().min(32).max(4096) })

interface PreviewTokenPayload {
  sub: string
  purpose?: string
  documentId?: string
  iat?: number
}

function auditMetadata(request: FastifyRequest) {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'] || null,
  }
}

async function createDocumentPreviewBuffer(
  filePath: string,
  requesterId: string,
  approvedAt = new Date().toISOString(),
  documentId?: string,
) {
  const file = getDocumentFile(filePath)
  const chunks: Buffer[] = []
  for await (const chunk of file.stream) {
    chunks.push(Buffer.from(chunk))
  }

  const rawBuffer = Buffer.concat(chunks)
  const pdfIndex = rawBuffer.indexOf('%PDF-')
  const cleanPdfBuffer = pdfIndex > 0 ? rawBuffer.subarray(pdfIndex) : rawBuffer

  let requesterName = 'Karyawan'
  let requesterNrk = '-'
  let categoryName = 'Dokumen Resmi'
  let categoryCode = 'DOC'
  let documentTitle = ''

  try {
    const [emp] = await db
      .select({ nama: employee.nama, nrk: employee.nrk })
      .from(employee)
      .where(eq(employee.id, requesterId))
      .limit(1)

    if (emp) {
      if (emp.nama) requesterName = emp.nama
      if (emp.nrk) requesterNrk = emp.nrk
    }

    if (documentId) {
      const [docRow] = await db
        .select({
          title: documents.title,
          categoryName: documentCategories.name,
          categoryCode: documentCategories.code,
        })
        .from(documents)
        .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
        .where(eq(documents.id, documentId))
        .limit(1)

      if (docRow) {
        if (docRow.categoryName) categoryName = docRow.categoryName
        if (docRow.categoryCode) categoryCode = docRow.categoryCode
        if (docRow.title) documentTitle = docRow.title
      }
    }
  } catch (err) {
    console.warn('Failed to fetch details for watermark preview:', err)
  }

  return applyPdfWatermark(cleanPdfBuffer, {
    approverName: 'Sistem SSO',
    approvedAt,
    requesterName,
    requesterNrk,
    reason: 'Pratinjau Dokumen',
    categoryName,
    categoryCode,
    documentTitle,
  })
}

function sendDocumentPreview(reply: FastifyReply, buffer: Buffer, title: string) {
  reply.header('Content-Type', 'application/pdf')
  reply.header('Content-Length', String(buffer.length))
  reply.header('Content-Disposition', `inline; filename="${documentDownloadName(title, 'application/pdf')}"`)
  reply.header('Cache-Control', 'private, no-store, max-age=0')
  reply.header('X-Content-Type-Options', 'nosniff')
  return reply.send(buffer)
}

export default async function documentRoutes(fastify: FastifyInstance) {
  const authOnly = [fastify.authenticate]
  const adminOnly = [fastify.authenticate, fastify.authorize(['super_admin'])]

  fastify.get('/categories', { preHandler: authOnly }, async (_request, reply) => {
    return reply.send(ok(await listDocumentCategoriesService()))
  })

  fastify.post('/categories', { preHandler: adminOnly }, async (request, reply) => {
    const input = createDocumentCategorySchema.parse(request.body)
    return reply.code(201).send(ok(await createDocumentCategoryService(input)))
  })

  fastify.put('/categories/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const input = updateDocumentCategorySchema.parse(request.body)
    return reply.send(ok(await updateDocumentCategoryService(id, input)))
  })

  fastify.delete('/categories/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    await deleteDocumentCategoryService(id)
    return reply.code(204).send()
  })

  fastify.get('/capabilities', { preHandler: authOnly }, async (request, reply) => {
    return reply.send(ok(await getDocumentCapabilitiesService(request.user.sub)))
  })

  fastify.get('/access-rules', { preHandler: adminOnly }, async (request, reply) => {
    const query = listAccessRulesQuerySchema.parse(request.query)
    const result = await listAccessRulesService(query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.post('/access-rules', { preHandler: adminOnly }, async (request, reply) => {
    const input = createAccessRuleSchema.parse(request.body)
    return reply.code(201).send(ok(await createAccessRuleService(input)))
  })

  fastify.put('/access-rules/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const input = createAccessRuleSchema.parse(request.body)
    return reply.send(ok(await updateAccessRuleService(id, input)))
  })

  fastify.delete('/access-rules/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    await deleteAccessRuleService(id)
    return reply.code(204).send()
  })

  fastify.get('/approvers', { preHandler: adminOnly }, async (request, reply) => {
    const query = listApproversQuerySchema.parse(request.query)
    const result = await listDocumentApproversService(query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.post('/approvers', { preHandler: adminOnly }, async (request, reply) => {
    const input = createDocumentApproverSchema.parse(request.body)
    return reply.code(201).send(ok(await createDocumentApproverService(input)))
  })

  fastify.put('/approvers/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const input = createDocumentApproverSchema.parse(request.body)
    return reply.send(ok(await updateDocumentApproverService(id, input)))
  })

  fastify.delete('/approvers/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    await deleteDocumentApproverService(id)
    return reply.code(204).send()
  })

  fastify.get('/audit-log', { preHandler: adminOnly }, async (request, reply) => {
    const query = listDocumentAuditQuerySchema.parse(request.query)
    const result = await listDocumentAuditService(query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.get('/download-requests/mine', { preHandler: authOnly }, async (request, reply) => {
    const query = listDownloadRequestsQuerySchema.parse(request.query)
    const result = await listMyDownloadRequestsService(request.user.sub, query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.get('/download-requests/pending', { preHandler: authOnly }, async (request, reply) => {
    const query = listDownloadRequestsQuerySchema.parse(request.query)
    const result = await listPendingDownloadRequestsService(request.user.sub, query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.post('/preview-file', async (request, reply) => {
    const { token } = previewTokenSchema.parse(request.body)
    let payload: PreviewTokenPayload

    try {
      payload = fastify.jwt.verify<PreviewTokenPayload>(token)
    } catch {
      throw httpError(401, 'Sesi pratinjau tidak valid atau telah kedaluwarsa')
    }

    if (payload.purpose !== 'document_preview' || !payload.documentId || !payload.sub) {
      throw httpError(401, 'Sesi pratinjau tidak valid')
    }

    const doc = await getDocumentByIdService(payload.sub, payload.documentId, auditMetadata(request))
    const previewTimestamp = payload.iat
      ? new Date(payload.iat * 1000).toISOString()
      : new Date().toISOString()
    const previewBuffer = await createDocumentPreviewBuffer(doc.filePath, payload.sub, previewTimestamp, payload.documentId)
    return sendDocumentPreview(reply, previewBuffer, doc.title)
  })

  fastify.post('/download-requests/:id/approve', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const input = approveRejectRequestSchema.parse({ ...(request.body as object || {}), action: 'approve' })
    return reply.send(ok(await decideDocumentDownloadService(request.user.sub, id, input.action, input.rejectionReason, input.validityDays)))
  })

  fastify.post('/download-requests/:id/reject', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const input = approveRejectRequestSchema.parse({ ...(request.body as object || {}), action: 'reject' })
    return reply.send(ok(await decideDocumentDownloadService(request.user.sub, id, input.action, input.rejectionReason)))
  })

  fastify.get('/download/:token', async (request, reply) => {
    const { token } = tokenParamsSchema.parse(request.params)
    const claimed = await claimDocumentDownloadTokenService(token, auditMetadata(request))
    const file = getDocumentFile(claimed.document.filePath)

    if (claimed.document.mimeType === 'application/pdf') {
      const chunks: Buffer[] = []
      for await (const chunk of file.stream) {
        chunks.push(Buffer.from(chunk))
      }
      const rawBuffer = Buffer.concat(chunks)
      const watermarkedBuffer = await applyPdfWatermark(rawBuffer, {
        ...claimed.watermark,
        isDownload: true,
      })

      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Length', String(watermarkedBuffer.length))
      reply.header('Content-Disposition', `attachment; filename="${documentDownloadName(claimed.document.title, claimed.document.mimeType)}"`)
      reply.header('Cache-Control', 'no-store')
      return reply.send(watermarkedBuffer)
    }

    reply.header('Content-Type', claimed.document.mimeType)
    reply.header('Content-Length', String(claimed.document.fileSize))
    reply.header('Content-Disposition', `attachment; filename="${documentDownloadName(claimed.document.title, claimed.document.mimeType)}"`)
    reply.header('Cache-Control', 'no-store')
    return reply.send(file.stream)
  })

  fastify.get('/tree', { preHandler: authOnly }, async (request, reply) => {
    const query = documentTreeQuerySchema.parse(request.query)
    return reply.send(ok(await getDocumentTreeService(request.user.sub, query)))
  })

  fastify.get('/', { preHandler: authOnly }, async (request, reply) => {
    const query = listDocumentsQuerySchema.parse(request.query)
    const result = await listDocumentsService(request.user.sub, query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.post('/', { preHandler: adminOnly }, async (request, reply) => {
    if (!request.isMultipart()) throw httpError(415, 'Upload dokumen harus menggunakan multipart/form-data')
    const fields: Record<string, string> = {}
    let savedFile: Awaited<ReturnType<typeof saveDocumentFile>> | null = null

    try {
      const parts = request.parts({
        limits: { files: 1, fileSize: config.documents.maxFileSizeBytes, fields: 20 },
      })
      for await (const part of parts) {
        if (part.type === 'file') {
          if (savedFile) throw httpError(422, 'Hanya satu file dokumen yang dapat diunggah')
          savedFile = await saveDocumentFile(part)
        } else {
          fields[part.fieldname] = String(part.value ?? '')
        }
      }
      if (!savedFile) throw httpError(422, 'File dokumen wajib dipilih')

      let targetUnitIds: string[] | undefined
      if (fields.targetUnitIds) {
        try {
          targetUnitIds = JSON.parse(fields.targetUnitIds)
        } catch {
          targetUnitIds = fields.targetUnitIds.split(',').map(s => s.trim()).filter(Boolean)
        }
      }

      const input = createDocumentSchema.parse({
        categoryId: fields.categoryId,
        title: fields.title,
        description: fields.description || null,
        ownerUnitId: fields.ownerUnitId || null,
        targetUnitIds,
        includeDescendants: fields.includeDescendants !== undefined ? fields.includeDescendants === 'true' : true,
        fileSize: savedFile.fileSize,
        mimeType: savedFile.mimeType,
      })
      const created = await createDocumentService(request.user.sub, { ...input, filePath: savedFile.filePath })
      return reply.code(201).send(ok(created))
    } catch (error) {
      if (savedFile) deleteDocumentFile(savedFile.filePath)
      throw error
    }
  })

  fastify.get('/:id/access-status', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    return reply.send(ok(await getDocumentDownloadStatusService(request.user.sub, id)))
  })

  fastify.post('/:id/download-request', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const input = downloadRequestSchema.parse(request.body || {})
    return reply.code(201).send(ok(await requestDocumentDownloadService(request.user.sub, id, input.reason)))
  })

  fastify.post('/:id/preview-session', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    await getDocumentByIdService(request.user.sub, id)
    const expiresInSeconds = 5 * 60
    const token = fastify.jwt.sign({
      sub: request.user.sub,
      email: request.user.email,
      role: request.user.role,
      tokenVersion: request.user.tokenVersion,
      purpose: 'document_preview',
      documentId: id,
    }, { expiresIn: expiresInSeconds })

    return reply.send(ok({
      token,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    }))
  })

  fastify.get('/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    return reply.send(ok(await getDocumentByIdService(request.user.sub, id, auditMetadata(request))))
  })

  fastify.get('/:id/view', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const doc = await getDocumentByIdService(request.user.sub, id, auditMetadata(request))
    if (!doc.access.canView) {
      throw httpError(403, 'Anda tidak memiliki hak melihat dokumen ini')
    }
    const previewBuffer = await createDocumentPreviewBuffer(doc.filePath, request.user.sub)
    return sendDocumentPreview(reply, previewBuffer, doc.title)
  })

  fastify.put('/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    const input = updateDocumentSchema.parse(request.body)
    return reply.send(ok(await updateDocumentService(request.user.sub, id, input)))
  })

  fastify.get('/:id/revisions', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    return reply.send(ok(await listDocumentRevisionsService(request.user.sub, id)))
  })

  fastify.get('/:id/revisions/:version/download', { preHandler: authOnly }, async (request, reply) => {
    const { id, version } = z.object({ id: z.string().uuid(), version: z.coerce.number().int().positive() }).parse(request.params)
    const { document, version: ver } = await getDocumentVersionFileService(request.user.sub, id, version)
    const file = getDocumentFile(ver.filePath)
    const fileName = documentDownloadName(`${document.title}_v${ver.version}`, ver.mimeType)

    reply.header('Content-Type', ver.mimeType)
    reply.header('Content-Length', String(ver.fileSize))
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`)
    reply.header('Cache-Control', 'no-store')
    return reply.send(file.stream)
  })

  fastify.post('/:id/revisions', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    if (!request.isMultipart()) throw httpError(415, 'Upload revisi dokumen harus menggunakan multipart/form-data')
    const fields: Record<string, string> = {}
    let savedFile: Awaited<ReturnType<typeof saveDocumentFile>> | null = null

    try {
      const parts = request.parts({
        limits: { files: 1, fileSize: config.documents.maxFileSizeBytes, fields: 10 },
      })
      for await (const part of parts) {
        if (part.type === 'file') {
          if (savedFile) throw httpError(422, 'Hanya satu file revisi yang dapat diunggah')
          savedFile = await saveDocumentFile(part)
        } else {
          fields[part.fieldname] = String(part.value ?? '')
        }
      }
      if (!savedFile) throw httpError(422, 'File revisi dokumen wajib dipilih')

      const created = await createDocumentRevisionService(request.user.sub, id, {
        filePath: savedFile.filePath,
        fileSize: savedFile.fileSize,
        mimeType: savedFile.mimeType,
        changelog: fields.changelog || null,
      })
      return reply.code(201).send(ok(created))
    } catch (error) {
      if (savedFile) deleteDocumentFile(savedFile.filePath)
      throw error
    }
  })

  fastify.post('/:id/revisions/:version/activate', { preHandler: authOnly }, async (request, reply) => {
    const { id, version } = z.object({ id: z.string().uuid(), version: z.coerce.number().int().positive() }).parse(request.params)
    return reply.send(ok(await activateDocumentVersionService(request.user.sub, id, version)))
  })

  fastify.post('/:id/reactivate', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    return reply.send(ok(await reactivateDocumentService(request.user.sub, id)))
  })

  fastify.delete('/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params)
    return reply.send(ok(await softDeleteDocumentService(request.user.sub, id)))
  })
}
