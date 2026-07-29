import 'dotenv/config'
import path from 'path'
import { and, eq, isNotNull } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import { db } from '.'
import {
  documentAccessRules,
  documentApprovers,
  documentAuditLog,
  documentCategories,
  documentDownloadRequests,
  documents,
  employee,
  portalNotification,
  user,
} from './schema'
import { buildApp } from '../server'
import { deleteDocumentFile, getDocumentFile } from '../services/document-storage.service'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

type TreeNode = { id: string; documents: Array<{ id: string }>; children: TreeNode[] }

function treeContainsDocument(payload: { roots: TreeNode[]; generalDocuments: Array<{ id: string }> }, documentId: string) {
  const visit = (node: TreeNode): boolean => (
    node.documents.some(document => document.id === documentId)
    || node.children.some(visit)
  )
  return payload.generalDocuments.some(document => document.id === documentId) || payload.roots.some(visit)
}

function treeContainsUnit(roots: TreeNode[], unitId: string): boolean {
  return roots.some(node => node.id === unitId || treeContainsUnit(node.children, unitId))
}

function multipartBody(fields: Record<string, string>, file: Buffer) {
  const boundary = `----document-smoke-${Date.now()}`
  const chunks: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="smoke.pdf"\r\nContent-Type: application/pdf\r\n\r\n`))
  chunks.push(file)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return { boundary, body: Buffer.concat(chunks) }
}

async function run() {
  const [actor] = await db.select({
    userId: user.id,
    email: user.email,
    tokenVersion: user.tokenVersion,
    employeeId: employee.id,
    unitOrganisasiId: employee.unitOrganisasiId,
  }).from(user)
    .innerJoin(employee, eq(user.employeeId, employee.id))
    .where(and(eq(user.isActive, true), isNotNull(user.employeeId), isNotNull(employee.unitOrganisasiId)))
    .limit(1)
  assert(actor, 'Integration test membutuhkan minimal satu user aktif yang terhubung ke unit organisasi')
  const actorUnitId = actor.unitOrganisasiId
  assert(actorUnitId, 'Integration test membutuhkan minimal satu user aktif yang terhubung ke unit organisasi')

  const [adminActor] = await db.select({
    userId: user.id,
    email: user.email,
    tokenVersion: user.tokenVersion,
  }).from(user)
    .where(and(eq(user.isActive, true), eq(user.role, 'super_admin')))
    .limit(1)
  assert(adminActor, 'Integration test membutuhkan minimal satu super admin aktif')

  const [category] = await db.select({ id: documentCategories.id }).from(documentCategories)
    .where(eq(documentCategories.code, 'SOP')).limit(1)
  assert(category, 'Kategori SOP belum tersedia')

  const app = await buildApp()
  await app.ready()
  const token = app.jwt.sign({
    sub: actor.userId,
    email: actor.email,
    role: 'super_admin',
    tokenVersion: actor.tokenVersion,
  })
  const authorization = `Bearer ${token}`
  const adminAuthorization = `Bearer ${app.jwt.sign({
    sub: adminActor.userId,
    email: adminActor.email,
    role: 'super_admin',
    tokenVersion: adminActor.tokenVersion,
  })}`
  let documentId: string | null = null
  let filePath: string | null = null
  let approverAssignmentId: string | null = null
  let requestId: string | null = null

  try {
    const upload = multipartBody({
      categoryId: category.id,
      title: `Document integration smoke ${Date.now()}`,
      description: 'Temporary integration test document',
      ownerUnitId: actorUnitId,
      confidentialityLevel: '2',
    }, Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'))
    const uploadResponse = await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: {
        authorization,
        'content-type': `multipart/form-data; boundary=${upload.boundary}`,
        'content-length': String(upload.body.length),
      },
      payload: upload.body,
    })
    assert(uploadResponse.statusCode === 201, `Upload gagal: ${uploadResponse.body}`)
    documentId = uploadResponse.json().data.id
    const [stored] = await db.select({ filePath: documents.filePath }).from(documents).where(eq(documents.id, documentId!)).limit(1)
    assert(stored, 'Dokumen hasil upload tidak ditemukan')
    filePath = stored.filePath
    const originalCwd = process.cwd()
    try {
      process.chdir(path.resolve(originalCwd, '..'))
      const storedFile = getDocumentFile(filePath)
      assert(storedFile.absolutePath.endsWith(filePath.replace(/\//g, path.sep)), 'Storage tidak meresolusikan file relatif secara konsisten')
      storedFile.stream.destroy()
    } finally {
      process.chdir(originalCwd)
    }

    const invalidTitleResponse = await app.inject({
      method: 'PUT',
      url: `/api/documents/${documentId}`,
      headers: { authorization, 'content-type': 'application/json' },
      payload: { title: 'ab' },
    })
    assert(invalidTitleResponse.statusCode === 422, `Validasi judul tidak ditolak: ${invalidTitleResponse.body}`)
    const invalidTitlePayload = invalidTitleResponse.json()
    assert(invalidTitlePayload.error === 'Validasi gagal', 'Ringkasan respons validasi berubah')
    assert(
      invalidTitlePayload.details?.[0]?.message === 'Judul minimal 3 karakter.',
      `Pesan validasi judul tidak terbaca: ${invalidTitleResponse.body}`,
    )

    const deniedResponse = await app.inject({ method: 'GET', url: `/api/documents/${documentId}`, headers: { authorization } })
    assert(deniedResponse.statusCode === 403, 'Dokumen tanpa rule harus ditolak secara fail-safe')
    const hiddenListResponse = await app.inject({ method: 'GET', url: '/api/documents?scope=accessible&limit=20', headers: { authorization } })
    assert(hiddenListResponse.statusCode === 200, `Daftar accessible gagal: ${hiddenListResponse.body}`)
    assert(!hiddenListResponse.json().data.some((row: { id: string }) => row.id === documentId), 'Dokumen tanpa rule tidak boleh muncul pada daftar')
    const hiddenTreeResponse = await app.inject({ method: 'GET', url: '/api/documents/tree?scope=accessible', headers: { authorization } })
    assert(hiddenTreeResponse.statusCode === 200, `Tree accessible gagal: ${hiddenTreeResponse.body}`)
    assert(!treeContainsDocument(hiddenTreeResponse.json().data, documentId!), 'Dokumen tanpa rule tidak boleh muncul pada tree employee')
    const managedTreeResponse = await app.inject({ method: 'GET', url: '/api/documents/tree?scope=manage', headers: { authorization: adminAuthorization } })
    assert(managedTreeResponse.statusCode === 200, `Tree admin gagal: ${managedTreeResponse.body}`)
    assert(treeContainsDocument(managedTreeResponse.json().data, documentId!), 'Dokumen harus muncul pada tree admin')
    assert(treeContainsUnit(managedTreeResponse.json().data.roots, actorUnitId), 'Folder unit pemilik harus muncul pada tree admin')

    const ruleResponse = await app.inject({
      method: 'POST',
      url: '/api/documents/access-rules',
      headers: { authorization, 'content-type': 'application/json' },
      payload: { documentId, documentCategoryId: null, unitOrganisasiId: null, includeDescendants: true, minGradeLevel: null, accessType: 'view' },
    })
    assert(ruleResponse.statusCode === 201, `Pembuatan rule gagal: ${ruleResponse.body}`)

    const approverResponse = await app.inject({
      method: 'POST',
      url: '/api/documents/approvers',
      headers: { authorization, 'content-type': 'application/json' },
      payload: { documentCategoryId: category.id, unitOrganisasiId: null, employeeId: actor.employeeId, approvalOrder: 1 },
    })
    assert(approverResponse.statusCode === 201, `Pembuatan approver gagal: ${approverResponse.body}`)
    approverAssignmentId = approverResponse.json().data.id

    const detailResponse = await app.inject({ method: 'GET', url: `/api/documents/${documentId}`, headers: { authorization } })
    assert(detailResponse.statusCode === 200, `Rule view tidak memberi akses: ${detailResponse.body}`)
    const previewResponse = await app.inject({ method: 'GET', url: `/api/documents/${documentId}/view`, headers: { authorization } })
    assert(previewResponse.statusCode === 200, `Pratinjau PDF gagal: ${previewResponse.body}`)
    assert(String(previewResponse.headers['content-type'] || '').startsWith('application/pdf'), 'Pratinjau tidak dikirim sebagai application/pdf')
    assert(String(previewResponse.headers['content-disposition'] || '').startsWith('inline;'), 'Pratinjau PDF harus menggunakan content-disposition inline')
    assert(previewResponse.rawPayload.subarray(0, 5).toString('ascii') === '%PDF-', 'Isi pratinjau bukan PDF yang valid')
    const previewPdf = await PDFDocument.load(previewResponse.rawPayload)
    assert(previewPdf.getPageCount() > 0, 'Isi pratinjau tidak memiliki halaman PDF yang dapat dibaca')
    const previewSessionResponse = await app.inject({
      method: 'POST',
      url: `/api/documents/${documentId}/preview-session`,
      headers: { authorization },
    })
    assert(previewSessionResponse.statusCode === 200, `Pembuatan sesi pratinjau gagal: ${previewSessionResponse.body}`)
    const previewToken = previewSessionResponse.json().data.token
    assert(previewToken, 'Sesi pratinjau tidak menghasilkan token')
    const tokenPreviewResponse = await app.inject({
      method: 'POST',
      url: '/api/documents/preview-file',
      headers: { 'content-type': 'application/json' },
      payload: { token: previewToken },
    })
    assert(tokenPreviewResponse.statusCode === 200, `Pratinjau bertoken gagal: ${tokenPreviewResponse.body}`)
    assert(tokenPreviewResponse.rawPayload.subarray(0, 5).toString('ascii') === '%PDF-', 'Pratinjau bertoken bukan PDF valid')
    const frontendProxyUrl = process.env.DOCUMENT_PREVIEW_PROXY_URL?.replace(/\/+$/, '')
    if (frontendProxyUrl) {
      const sessionProxyResponse = await fetch(`${frontendProxyUrl}/document-preview-session/${documentId}`, {
        method: 'POST',
        headers: { authorization },
      })
      const sessionProxyPayload = await sessionProxyResponse.json() as {
        data: { url: string }
      }
      assert(sessionProxyResponse.status === 200, `Proxy sesi pratinjau gagal: ${sessionProxyResponse.status} ${JSON.stringify(sessionProxyPayload)}`)
      const previewCookie = sessionProxyResponse.headers.get('set-cookie')?.split(';')[0]
      assert(previewCookie, 'Proxy sesi pratinjau tidak mengatur cookie HttpOnly')
      const proxyResponse = await fetch(`${frontendProxyUrl}${sessionProxyPayload.data.url}`, {
        headers: { cookie: previewCookie },
      })
      const proxyBuffer = Buffer.from(await proxyResponse.arrayBuffer())
      assert(proxyResponse.status === 200, `Proxy pratinjau gagal: ${proxyResponse.status} ${proxyBuffer.toString('utf8')}`)
      assert(proxyBuffer.length > 0, 'Proxy pratinjau mengirim body kosong')
      assert(proxyResponse.headers.get('content-length') === String(proxyBuffer.length), 'Content-Length proxy pratinjau tidak sesuai')
      assert(proxyBuffer.subarray(0, 5).toString('ascii') === '%PDF-', 'Proxy pratinjau tidak mengirim PDF yang valid')
      assert(proxyResponse.headers.get('accept-ranges') === 'bytes', 'Proxy pratinjau tidak mengumumkan dukungan byte-range')
      const rangeResponse = await fetch(`${frontendProxyUrl}${sessionProxyPayload.data.url}`, {
        headers: {
          cookie: previewCookie,
          range: 'bytes=0-99',
        },
      })
      const rangeBuffer = Buffer.from(await rangeResponse.arrayBuffer())
      assert(rangeResponse.status === 206, `Byte-range pratinjau tidak menghasilkan 206: ${rangeResponse.status}`)
      assert(rangeResponse.headers.get('content-range') === `bytes 0-99/${proxyBuffer.length}`, 'Content-Range pratinjau tidak sesuai')
      assert(rangeBuffer.length === 100, 'Byte-range pratinjau tidak mengirim panjang yang diminta')
      assert(rangeBuffer.subarray(0, 5).toString('ascii') === '%PDF-', 'Byte-range awal pratinjau tidak memuat signature PDF')
    }
    const visibleListResponse = await app.inject({ method: 'GET', url: '/api/documents?scope=accessible&limit=20', headers: { authorization } })
    assert(visibleListResponse.json().data.some((row: { id: string }) => row.id === documentId), 'Dokumen dengan rule tidak muncul pada daftar')
    const visibleTreeResponse = await app.inject({ method: 'GET', url: '/api/documents/tree?scope=accessible', headers: { authorization } })
    assert(visibleTreeResponse.statusCode === 200, `Tree employee setelah rule gagal: ${visibleTreeResponse.body}`)
    assert(treeContainsDocument(visibleTreeResponse.json().data, documentId!), 'Dokumen dengan rule harus muncul pada tree employee')
    assert(treeContainsUnit(visibleTreeResponse.json().data.roots, actorUnitId), 'Jalur folder unit pemilik harus muncul pada tree employee')

    const requestResponse = await app.inject({
      method: 'POST',
      url: `/api/documents/${documentId}/download-request`,
      headers: { authorization, 'content-type': 'application/json' },
      payload: { reason: 'Integration smoke test' },
    })
    assert(requestResponse.statusCode === 201, `Request download gagal: ${requestResponse.body}`)
    requestId = requestResponse.json().data.requestId
    assert(requestResponse.json().data.status === 'pending', 'Request manual harus berstatus pending')
    const pendingResponse = await app.inject({ method: 'GET', url: '/api/documents/download-requests/pending?limit=20', headers: { authorization } })
    assert(pendingResponse.statusCode === 200, `Antrean approver gagal: ${pendingResponse.body}`)
    assert(pendingResponse.json().data.some((row: { id: string }) => row.id === requestId), 'Request tidak muncul pada antrean approver')
    const capabilityResponse = await app.inject({ method: 'GET', url: '/api/documents/capabilities', headers: { authorization } })
    assert(capabilityResponse.json().data.pendingApprovalCount >= 1, 'Badge pending approval tidak terhitung')

    const approvalResponse = await app.inject({
      method: 'POST',
      url: `/api/documents/download-requests/${requestId}/approve`,
      headers: { authorization, 'content-type': 'application/json' },
      payload: {},
    })
    assert(approvalResponse.statusCode === 200, `Approval gagal: ${approvalResponse.body}`)
    const downloadToken = approvalResponse.json().data.downloadToken
    assert(downloadToken, 'Approval tidak menghasilkan download token')

    if (frontendProxyUrl) {
      const firstDownload = await fetch(`${frontendProxyUrl}/document-download-file/${downloadToken}`)
      const firstDownloadBuffer = Buffer.from(await firstDownload.arrayBuffer())
      assert(firstDownload.status === 200, `Download proxy pertama gagal: ${firstDownload.status} ${firstDownloadBuffer.toString('utf8')}`)
      assert(firstDownloadBuffer.length > 0, 'Download proxy mengirim body kosong')
      assert(firstDownload.headers.get('content-type') === 'application/pdf', 'Download proxy tidak mengirim MIME PDF')
      assert(firstDownload.headers.get('content-length') === String(firstDownloadBuffer.length), 'Content-Length download proxy tidak sesuai')
      assert(firstDownload.headers.get('content-disposition')?.includes('.pdf') === true, 'Download proxy tidak memberikan nama file PDF')
      assert(firstDownloadBuffer.subarray(0, 5).toString('ascii') === '%PDF-', 'Isi download proxy tidak sesuai file upload')
    } else {
      const firstDownload = await app.inject({ method: 'GET', url: `/api/documents/download/${downloadToken}` })
      assert(firstDownload.statusCode === 200, `Download pertama gagal: ${firstDownload.body}`)
      assert(firstDownload.rawPayload.subarray(0, 5).toString('ascii') === '%PDF-', 'Isi download tidak sesuai file upload')
    }

    const secondDownload = await app.inject({ method: 'GET', url: `/api/documents/download/${downloadToken}` })
    assert(secondDownload.statusCode === 410, 'Token download harus ditolak saat digunakan untuk kedua kali')

    const audits = await db.select({ action: documentAuditLog.action }).from(documentAuditLog).where(eq(documentAuditLog.documentId, documentId!))
    for (const requiredAction of ['uploaded', 'view', 'download_request', 'download_approved', 'downloaded']) {
      assert(audits.some(row => row.action === requiredAction), `Audit action ${requiredAction} tidak tercatat`)
    }
    console.log('Document HTTP integration verified: folder tree, fail-safe view, multipart upload, approval, one-time download, audit.')
  } finally {
    if (requestId) await db.delete(portalNotification).where(eq(portalNotification.entityId, requestId))
    if (documentId) {
      await db.delete(documentAuditLog).where(eq(documentAuditLog.documentId, documentId))
      await db.delete(documentDownloadRequests).where(eq(documentDownloadRequests.documentId, documentId))
      await db.delete(documentAccessRules).where(eq(documentAccessRules.documentId, documentId))
    }
    if (approverAssignmentId) await db.delete(documentApprovers).where(eq(documentApprovers.id, approverAssignmentId))
    if (documentId) await db.delete(documents).where(eq(documents.id, documentId))
    if (filePath) deleteDocumentFile(filePath)
    await app.close()
  }
}

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
