import { and, count, desc, eq, ilike, ne, or, SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db'
import {
  documentAccessRules,
  documentApprovers,
  documentCategories,
  documents,
  documentVersions,
  employee,
  refGrade,
  unitOrganisasi,
} from '../db/schema'
import { buildMeta, getPaginationParams } from '../utils/pagination'
import { httpError } from '../utils/httpError'
import type {
  CreateAccessRuleInput,
  CreateDocumentApproverInput,
  CreateDocumentCategoryInput,
  CreateDocumentInput,
  DocumentTreeQuery,
  ListAccessRulesQuery,
  ListApproversQuery,
  ListDocumentsQuery,
  UpdateDocumentCategoryInput,
  UpdateDocumentInput,
} from '../validators/document.validator'
import {
  checkDocumentRuleAccess,
  checkDocumentViewAccess,
  getDocumentActorContext,
} from './document-access.service'
import { logDocumentAction } from './document-audit.service'

export interface DocumentTreeDocument {
  id: string
  categoryId: string
  categoryName: string
  categoryCode: string
  title: string
  description: string | null
  fileSize: number
  mimeType: string
  ownerUnitId: string | null
  ownerUnitName: string | null
  uploadedBy: string
  uploadedByName: string | null
  version: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface DocumentTreeNode {
  id: string
  nama: string
  kode: string
  tipe: string
  parentId: string | null
  documents: DocumentTreeDocument[]
  children: DocumentTreeNode[]
  documentCount: number
}

export interface DocumentTreeResult {
  roots: DocumentTreeNode[]
  generalDocuments: DocumentTreeDocument[]
  totals: { folders: number; documents: number; categories: number }
}

export async function listDocumentCategoriesService() {
  return db
    .select({
      id: documentCategories.id,
      name: documentCategories.name,
      code: documentCategories.code,
      defaultConfidentialityLevel: documentCategories.defaultConfidentialityLevel,
      autoApproveGradeLevel: documentCategories.autoApproveGradeLevel,
      createdAt: documentCategories.createdAt,
      updatedAt: documentCategories.updatedAt,
    })
    .from(documentCategories)
    .orderBy(documentCategories.name)
}

export async function createDocumentCategoryService(input: CreateDocumentCategoryInput) {
  const formattedCode = input.code.toUpperCase()

  const [existingCode] = await db
    .select({ id: documentCategories.id })
    .from(documentCategories)
    .where(eq(documentCategories.code, formattedCode))
    .limit(1)

  if (existingCode) {
    throw httpError(400, `Kode kategori '${formattedCode}' sudah digunakan.`)
  }

  const [existingName] = await db
    .select({ id: documentCategories.id })
    .from(documentCategories)
    .where(eq(documentCategories.name, input.name))
    .limit(1)

  if (existingName) {
    throw httpError(400, `Nama kategori '${input.name}' sudah digunakan.`)
  }

  const [created] = await db.insert(documentCategories).values({
    name: input.name,
    code: formattedCode,
    defaultConfidentialityLevel: input.defaultConfidentialityLevel ?? 1,
    autoApproveGradeLevel: input.autoApproveGradeLevel ?? null,
  }).returning()

  return created
}

export async function updateDocumentCategoryService(id: string, input: UpdateDocumentCategoryInput) {
  if (input.code) {
    const formattedCode = input.code.toUpperCase()
    const [existingCode] = await db
      .select({ id: documentCategories.id })
      .from(documentCategories)
      .where(and(eq(documentCategories.code, formattedCode), ne(documentCategories.id, id)))
      .limit(1)

    if (existingCode) {
      throw httpError(400, `Kode kategori '${formattedCode}' sudah digunakan.`)
    }
  }

  if (input.name) {
    const [existingName] = await db
      .select({ id: documentCategories.id })
      .from(documentCategories)
      .where(and(eq(documentCategories.name, input.name), ne(documentCategories.id, id)))
      .limit(1)

    if (existingName) {
      throw httpError(400, `Nama kategori '${input.name}' sudah digunakan.`)
    }
  }

  const [updated] = await db.update(documentCategories).set({
    ...input,
    code: input.code?.toUpperCase(),
    updatedAt: new Date(),
  }).where(eq(documentCategories.id, id)).returning()

  if (!updated) throw httpError(404, 'Kategori dokumen tidak ditemukan')
  return updated
}

export async function deleteDocumentCategoryService(id: string) {
  const [{ total }] = await db.select({ total: count() }).from(documents).where(eq(documents.categoryId, id))
  if (Number(total) > 0) throw httpError(409, 'Kategori masih digunakan oleh dokumen dan tidak dapat dihapus')
  const [deleted] = await db.delete(documentCategories).where(eq(documentCategories.id, id)).returning()
  if (!deleted) throw httpError(404, 'Kategori dokumen tidak ditemukan')
  return deleted
}

function documentFilters(
  query: Pick<ListDocumentsQuery, 'search' | 'categoryId' | 'ownerUnitId' | 'isActive'> | DocumentTreeQuery,
  manageScope: boolean,
) {
  const conditions: SQL[] = []
  if (query.search) {
    conditions.push(or(
      ilike(documents.title, `%${query.search}%`),
      ilike(documents.description, `%${query.search}%`),
    )!)
  }
  if (query.categoryId) conditions.push(eq(documents.categoryId, query.categoryId))
  if ('ownerUnitId' in query && query.ownerUnitId) conditions.push(eq(documents.ownerUnitId, query.ownerUnitId))
  if (query.isActive !== undefined) conditions.push(eq(documents.isActive, query.isActive))
  return conditions
}

function documentViewAccessFilter(employeeId: string) {
  return sql`EXISTS (
    WITH RECURSIVE employee_context AS (
      SELECT e.unit_organisasi_id, g.level AS grade_level
      FROM employee e
      LEFT JOIN ref_grade g ON g.id = e.grade_id
      WHERE e.id = ${employeeId}::uuid AND e.is_active = true
    ), employee_ancestors AS (
      SELECT u.id, u.parent_id
      FROM unit_organisasi u
      JOIN employee_context ec ON ec.unit_organisasi_id = u.id
      UNION ALL
      SELECT parent.id, parent.parent_id
      FROM unit_organisasi parent
      JOIN employee_ancestors child ON child.parent_id = parent.id
    )
    SELECT 1
    FROM document_access_rules rule
    CROSS JOIN employee_context ec
    WHERE rule.access_type = 'view'::document_access_type
      AND (rule.document_id = ${documents.id} OR rule.document_category_id = ${documents.categoryId})
      AND (rule.min_grade_level IS NULL OR ec.grade_level >= rule.min_grade_level)
      AND (
        rule.unit_organisasi_id IS NULL
        OR rule.unit_organisasi_id = ec.unit_organisasi_id
        OR (
          rule.include_descendants = true
          AND EXISTS (SELECT 1 FROM employee_ancestors a WHERE a.id = rule.unit_organisasi_id)
        )
      )
  )`
}

export async function listDocumentsService(userId: string, query: ListDocumentsQuery) {
  const actor = await getDocumentActorContext(userId, query.scope !== 'manage')
  const manageScope = query.scope === 'manage' && actor.role === 'super_admin'
  if (query.scope === 'manage' && !manageScope) throw httpError(403, 'Hanya administrator yang dapat melihat seluruh dokumen')
  const { page, limit, offset } = getPaginationParams(query)
  const conditions = documentFilters(query, manageScope)
  if (query.scope === 'mine') {
    conditions.push(eq(documents.uploadedBy, actor.employeeId!))
  } else if (!manageScope) {
    conditions.push(documentViewAccessFilter(actor.employeeId!))
  }
  const where = conditions.length ? and(...conditions) : undefined

  const selection = {
    id: documents.id,
    categoryId: documents.categoryId,
    categoryName: documentCategories.name,
    categoryCode: documentCategories.code,
    title: documents.title,
    description: documents.description,
    fileSize: documents.fileSize,
    mimeType: documents.mimeType,
    ownerUnitId: documents.ownerUnitId,
    ownerUnitName: unitOrganisasi.nama,
    uploadedBy: documents.uploadedBy,
    uploadedByName: employee.nama,
    version: documents.version,
    isActive: documents.isActive,
    createdAt: documents.createdAt,
    updatedAt: documents.updatedAt,
    _total: sql<number>`count(*) over()`,
  }

  const baseQuery = db.select(selection)
    .from(documents)
    .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .leftJoin(unitOrganisasi, eq(documents.ownerUnitId, unitOrganisasi.id))
    .innerJoin(employee, eq(documents.uploadedBy, employee.id))

  const result = await (where ? baseQuery.where(where) : baseQuery)
    .orderBy(desc(documents.createdAt)).limit(limit).offset(offset)
  const total = Number(result[0]?._total ?? 0)
  const rows = result.map(({ _total, ...row }) => row)
  return { rows, meta: buildMeta(page, limit, total) }
}

export async function getDocumentTreeService(userId: string, query: DocumentTreeQuery): Promise<DocumentTreeResult> {
  const actor = await getDocumentActorContext(userId, query.scope !== 'manage')
  const manageScope = query.scope === 'manage' && actor.role === 'super_admin'
  if (query.scope === 'manage' && !manageScope) throw httpError(403, 'Hanya administrator yang dapat melihat seluruh dokumen')

  const conditions = documentFilters(query, manageScope)
  if (!manageScope) conditions.push(documentViewAccessFilter(actor.employeeId!))
  const where = conditions.length ? and(...conditions) : undefined

  const selection = {
    id: documents.id,
    categoryId: documents.categoryId,
    categoryName: documentCategories.name,
    categoryCode: documentCategories.code,
    title: documents.title,
    description: documents.description,
    fileSize: documents.fileSize,
    mimeType: documents.mimeType,
    ownerUnitId: documents.ownerUnitId,
    ownerUnitName: unitOrganisasi.nama,
    uploadedBy: documents.uploadedBy,
    uploadedByName: employee.nama,
    version: documents.version,
    isActive: documents.isActive,
    createdAt: documents.createdAt,
    updatedAt: documents.updatedAt,
  }
  const baseQuery = db.select(selection)
    .from(documents)
    .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .leftJoin(unitOrganisasi, eq(documents.ownerUnitId, unitOrganisasi.id))
    .innerJoin(employee, eq(documents.uploadedBy, employee.id))
  const documentRows = await (where ? baseQuery.where(where) : baseQuery).orderBy(documents.title)

  const units = await db.select({
    id: unitOrganisasi.id,
    nama: unitOrganisasi.nama,
    kode: unitOrganisasi.kode,
    tipe: unitOrganisasi.tipe,
    parentId: unitOrganisasi.parentId,
  }).from(unitOrganisasi)
    .where(eq(unitOrganisasi.isActive, true))
    .orderBy(unitOrganisasi.nama)

  const allUnits = new Map(units.map(unit => [unit.id, unit]))
  const documentsByUnit = new Map<string, DocumentTreeDocument[]>()
  const generalDocuments: DocumentTreeDocument[] = []
  for (const document of documentRows) {
    if (!document.ownerUnitId || !allUnits.has(document.ownerUnitId)) {
      generalDocuments.push(document)
      continue
    }
    const owned = documentsByUnit.get(document.ownerUnitId) || []
    owned.push(document)
    documentsByUnit.set(document.ownerUnitId, owned)
  }

  const visibleUnitIds = new Set<string>()
  const showCompleteHierarchy = manageScope && !query.search && !query.categoryId && query.isActive === undefined
  if (showCompleteHierarchy) {
    for (const unit of units) visibleUnitIds.add(unit.id)
  } else {
    for (const unitId of documentsByUnit.keys()) {
      let currentId: string | null = unitId
      const visited = new Set<string>()
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId)
        visibleUnitIds.add(currentId)
        currentId = allUnits.get(currentId)?.parentId || null
      }
    }
  }

  const nodeMap = new Map<string, DocumentTreeNode>()
  const roots: DocumentTreeNode[] = []
  for (const unit of units) {
    if (!visibleUnitIds.has(unit.id)) continue
    nodeMap.set(unit.id, {
      ...unit,
      documents: documentsByUnit.get(unit.id) || [],
      children: [],
      documentCount: 0,
    })
  }
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) nodeMap.get(node.parentId)!.children.push(node)
    else roots.push(node)
  }

  const sortAndCount = (node: DocumentTreeNode): number => {
    node.children.sort((left, right) => left.nama.localeCompare(right.nama, 'id'))
    node.documents.sort((left, right) => left.title.localeCompare(right.title, 'id'))
    node.documentCount = node.documents.length + node.children.reduce((total, child) => total + sortAndCount(child), 0)
    return node.documentCount
  }
  roots.sort((left, right) => left.nama.localeCompare(right.nama, 'id'))
  roots.forEach(sortAndCount)

  return {
    roots,
    generalDocuments,
    totals: {
      folders: nodeMap.size + (generalDocuments.length ? 1 : 0),
      documents: documentRows.length,
      categories: new Set(documentRows.map(document => document.categoryId)).size,
    },
  }
}

export async function getDocumentByIdService(userId: string, id: string, auditMetadata?: Record<string, unknown>) {
  const actor = await getDocumentActorContext(userId, false)
  const [document] = await db.select({
    id: documents.id,
    categoryId: documents.categoryId,
    categoryName: documentCategories.name,
    categoryCode: documentCategories.code,
    title: documents.title,
    description: documents.description,
    fileSize: documents.fileSize,
    mimeType: documents.mimeType,
    filePath: documents.filePath,
    ownerUnitId: documents.ownerUnitId,
    ownerUnitName: unitOrganisasi.nama,
    uploadedBy: documents.uploadedBy,
    uploadedByName: employee.nama,
    version: documents.version,
    isActive: documents.isActive,
    createdAt: documents.createdAt,
    updatedAt: documents.updatedAt,
  }).from(documents)
    .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .leftJoin(unitOrganisasi, eq(documents.ownerUnitId, unitOrganisasi.id))
    .innerJoin(employee, eq(documents.uploadedBy, employee.id))
    .where(eq(documents.id, id)).limit(1)
  if (!document) throw httpError(404, 'Dokumen tidak ditemukan')

  const canManage = actor.role === 'super_admin'
  const canView = actor.employeeId ? await checkDocumentViewAccess(actor.employeeId, id) : false
  if (!canView && !canManage) throw httpError(403, 'Anda tidak memiliki hak melihat dokumen ini')
  const [canEdit, canApproveRule] = actor.employeeId
    ? await Promise.all([
      checkDocumentRuleAccess(actor.employeeId, id, 'edit'),
      checkDocumentRuleAccess(actor.employeeId, id, 'approve'),
    ])
    : [false, false]
  if (actor.employeeId) {
    await logDocumentAction({
      documentId: id,
      employeeId: actor.employeeId,
      action: 'view',
      metadata: auditMetadata,
    })
  }

  const targetRules = await db.select({
    unitId: documentAccessRules.unitOrganisasiId,
    unitName: unitOrganisasi.nama,
    unitKode: unitOrganisasi.kode,
    includeDescendants: documentAccessRules.includeDescendants,
  }).from(documentAccessRules)
    .leftJoin(unitOrganisasi, eq(documentAccessRules.unitOrganisasiId, unitOrganisasi.id))
    .where(and(eq(documentAccessRules.documentId, id), eq(documentAccessRules.accessType, 'view')))

  const targetUnits = targetRules
    .filter(r => r.unitId)
    .map(r => ({ unitId: r.unitId!, unitName: r.unitName || '', unitKode: r.unitKode || '' }))
  const includeDescendants = targetRules.length > 0 ? (targetRules[0].includeDescendants ?? true) : true

  return { ...document, targetUnits, includeDescendants, access: { canView: canManage || canView, canEdit: canManage || canEdit, canManage, canApproveRule } }
}

export async function createDocumentService(userId: string, input: CreateDocumentInput & { filePath: string }) {
  const actor = await getDocumentActorContext(userId)
  const [created] = await db.transaction(async tx => {
    const rows = await tx.insert(documents).values({
      categoryId: input.categoryId,
      title: input.title,
      description: input.description ?? null,
      filePath: input.filePath,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      ownerUnitId: input.ownerUnitId ?? null,
      uploadedBy: actor.employeeId!,
    }).returning()

    /*
     * Aturan akses baca dibuat eksplisit. Karena pemeriksaan akses sekarang
     * fail-closed (tanpa rule = ditolak), unggahan tanpa `targetUnitIds` akan
     * tidak terlihat oleh siapa pun kecuali pengunggah dan super_admin. Supaya
     * dokumen tetap berguna, unit pemilik dipakai sebagai target bawaan.
     */
    const targetUnitIds = input.targetUnitIds && input.targetUnitIds.length > 0
      ? input.targetUnitIds
      : (input.ownerUnitId ? [input.ownerUnitId] : [])

    for (const unitId of targetUnitIds) {
      await tx.insert(documentAccessRules).values({
        documentId: rows[0].id,
        unitOrganisasiId: unitId,
        includeDescendants: input.includeDescendants ?? true,
        accessType: 'view',
      })
    }

    await tx.insert(documentVersions).values({
      documentId: rows[0].id,
      version: 1,
      filePath: input.filePath,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      changelog: 'Versi awal dokumen (v1)',
      uploadedBy: actor.employeeId!,
    })
    await logDocumentAction({
      documentId: rows[0].id,
      employeeId: actor.employeeId!,
      action: 'uploaded',
      metadata: { version: rows[0].version, mimeType: rows[0].mimeType, fileSize: rows[0].fileSize, targetUnitCount: input.targetUnitIds?.length || 0 },
    }, tx)
    return rows
  })
  return created
}

export async function updateDocumentService(userId: string, id: string, input: UpdateDocumentInput) {
  const actor = await getDocumentActorContext(userId)
  const canEdit = actor.role === 'super_admin' || await checkDocumentRuleAccess(actor.employeeId!, id, 'edit')
  if (!canEdit) throw httpError(403, 'Anda tidak memiliki hak mengubah dokumen ini')
  const { targetUnitIds, includeDescendants, ...docFields } = input
  const changes: Partial<typeof documents.$inferInsert> = { ...docFields, updatedAt: new Date() }
  if ('description' in input) changes.description = input.description ?? null
  if ('ownerUnitId' in input) changes.ownerUnitId = input.ownerUnitId ?? null

  const [updated] = await db.transaction(async tx => {
    const rows = await tx.update(documents).set(changes)
      .where(and(eq(documents.id, id), eq(documents.isActive, true))).returning()
    if (!rows[0]) throw httpError(404, 'Dokumen tidak ditemukan')

    if (targetUnitIds !== undefined) {
      await tx.delete(documentAccessRules).where(and(
        eq(documentAccessRules.documentId, id),
        eq(documentAccessRules.accessType, 'view'),
      ))
      if (targetUnitIds.length > 0) {
        for (const unitId of targetUnitIds) {
          await tx.insert(documentAccessRules).values({
            documentId: id,
            unitOrganisasiId: unitId,
            includeDescendants: includeDescendants ?? true,
            accessType: 'view',
          })
        }
      }
    }

    await logDocumentAction({ documentId: id, employeeId: actor.employeeId!, action: 'edited', metadata: { fields: Object.keys(input) } }, tx)
    return rows
  })
  return updated
}

export async function createDocumentRevisionService(
  userId: string,
  documentId: string,
  input: { filePath: string; fileSize: number; mimeType: string; changelog?: string | null }
) {
  const actor = await getDocumentActorContext(userId)
  const [document] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.isActive, true))).limit(1)
  if (!document) throw httpError(404, 'Dokumen tidak ditemukan')

  const canEdit = actor.role === 'super_admin' || await checkDocumentRuleAccess(actor.employeeId!, documentId, 'edit')
  if (!canEdit) throw httpError(403, 'Anda tidak memiliki hak untuk merevisi dokumen ini')

  const nextVersion = document.version + 1
  const changelogText = input.changelog?.trim() || `Revisi ke-${nextVersion}`

  const [updated] = await db.transaction(async tx => {
    await tx.insert(documentVersions).values({
      documentId: document.id,
      version: nextVersion,
      filePath: input.filePath,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      changelog: changelogText,
      uploadedBy: actor.employeeId!,
    })

    const rows = await tx.update(documents).set({
      version: nextVersion,
      filePath: input.filePath,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      updatedAt: new Date(),
    }).where(eq(documents.id, documentId)).returning()

    await logDocumentAction({
      documentId: document.id,
      employeeId: actor.employeeId!,
      action: 'edited',
      metadata: { isRevision: true, version: nextVersion, changelog: changelogText, fileSize: input.fileSize },
    }, tx)

    return rows
  })

  return updated
}

export async function activateDocumentVersionService(userId: string, documentId: string, versionNumber: number) {
  const actor = await getDocumentActorContext(userId)
  const canEdit = actor.role === 'super_admin' || await checkDocumentRuleAccess(actor.employeeId!, documentId, 'edit')
  if (!canEdit) throw httpError(403, 'Anda tidak memiliki hak untuk mengaktifkan versi dokumen ini')

  const [targetVersion] = await db.select().from(documentVersions)
    .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.version, versionNumber)))
    .limit(1)
  if (!targetVersion) throw httpError(404, `Revisi versi v${versionNumber} tidak ditemukan`)

  const [updated] = await db.transaction(async tx => {
    const rows = await tx.update(documents).set({
      version: targetVersion.version,
      filePath: targetVersion.filePath,
      fileSize: targetVersion.fileSize,
      mimeType: targetVersion.mimeType,
      updatedAt: new Date(),
    }).where(eq(documents.id, documentId)).returning()

    await logDocumentAction({
      documentId,
      employeeId: actor.employeeId!,
      action: 'edited',
      metadata: { action: 'activate_version', activeVersion: targetVersion.version },
    }, tx)

    return rows
  })

  return updated
}

export async function getDocumentVersionFileService(userId: string, documentId: string, versionNumber: number) {
  const actor = await getDocumentActorContext(userId, false)
  const [document] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  if (!document) throw httpError(404, 'Dokumen tidak ditemukan')

  const canManage = actor.role === 'super_admin'
  const canView = actor.employeeId ? await checkDocumentViewAccess(actor.employeeId, documentId) : false
  if (!canView && !canManage) throw httpError(403, 'Anda tidak memiliki hak untuk mengunduh versi revisi ini')

  const [version] = await db.select().from(documentVersions)
    .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.version, versionNumber)))
    .limit(1)
  if (!version) throw httpError(404, `Revisi versi v${versionNumber} tidak ditemukan`)

  /*
   * Unduhan revisi wajib tercatat. Sebelumnya fungsi ini tidak menulis audit apa pun,
   * sehingga pengambilan salinan versi aktif tidak meninggalkan jejak sama sekali.
   */
  if (actor.employeeId) {
    await logDocumentAction({
      documentId,
      employeeId: actor.employeeId,
      action: 'downloaded',
      metadata: { via: 'revision-download', version: versionNumber },
    })
  }

  return { document, version, actor }
}

export async function listDocumentRevisionsService(userId: string, documentId: string) {
  const actor = await getDocumentActorContext(userId)
  const canView = actor.role === 'super_admin' || await checkDocumentViewAccess(actor.employeeId!, documentId)
  if (!canView) throw httpError(403, 'Anda tidak memiliki hak melihat riwayat dokumen ini')

  const uploader = alias(employee, 'revision_uploader')
  const rows = await db.select({
    id: documentVersions.id,
    documentId: documentVersions.documentId,
    version: documentVersions.version,
    filePath: documentVersions.filePath,
    fileSize: documentVersions.fileSize,
    mimeType: documentVersions.mimeType,
    changelog: documentVersions.changelog,
    uploadedBy: documentVersions.uploadedBy,
    uploadedByName: uploader.nama,
    createdAt: documentVersions.createdAt,
  }).from(documentVersions)
    .innerJoin(uploader, eq(documentVersions.uploadedBy, uploader.id))
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.version))

  return rows
}

export async function softDeleteDocumentService(userId: string, id: string) {
  const actor = await getDocumentActorContext(userId)
  const canEdit = actor.role === 'super_admin' || await checkDocumentRuleAccess(actor.employeeId!, id, 'edit')
  if (!canEdit) throw httpError(403, 'Anda tidak memiliki hak menonaktifkan dokumen ini')
  const [updated] = await db.transaction(async tx => {
    const rows = await tx.update(documents).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.isActive, true))).returning()
    if (!rows[0]) throw httpError(404, 'Dokumen tidak ditemukan')
    await logDocumentAction({ documentId: id, employeeId: actor.employeeId!, action: 'deleted', metadata: { softDelete: true } }, tx)
    return rows
  })
  return updated
}

export async function reactivateDocumentService(userId: string, id: string) {
  const actor = await getDocumentActorContext(userId)
  const canEdit = actor.role === 'super_admin' || await checkDocumentRuleAccess(actor.employeeId!, id, 'edit')
  if (!canEdit) throw httpError(403, 'Anda tidak memiliki hak mengaktifkan kembali dokumen ini')
  const [updated] = await db.transaction(async tx => {
    const rows = await tx.update(documents).set({ isActive: true, updatedAt: new Date() })
      .where(eq(documents.id, id)).returning()
    if (!rows[0]) throw httpError(404, 'Dokumen tidak ditemukan')
    await logDocumentAction({ documentId: id, employeeId: actor.employeeId!, action: 'edited', metadata: { action: 'reactivate' } }, tx)
    return rows
  })
  return updated
}

export async function listAccessRulesService(query: ListAccessRulesQuery) {
  const { page, limit, offset } = getPaginationParams(query)
  const conditions: SQL[] = []
  if (query.documentId) conditions.push(eq(documentAccessRules.documentId, query.documentId))
  if (query.documentCategoryId) conditions.push(eq(documentAccessRules.documentCategoryId, query.documentCategoryId))
  if (query.accessType) conditions.push(eq(documentAccessRules.accessType, query.accessType))
  const where = conditions.length ? and(...conditions) : undefined
  const base = db.select({
    id: documentAccessRules.id,
    documentId: documentAccessRules.documentId,
    documentTitle: documents.title,
    documentCategoryId: documentAccessRules.documentCategoryId,
    categoryName: documentCategories.name,
    unitOrganisasiId: documentAccessRules.unitOrganisasiId,
    unitName: unitOrganisasi.nama,
    includeDescendants: documentAccessRules.includeDescendants,
    minGradeLevel: documentAccessRules.minGradeLevel,
    minGradeCode: refGrade.kode,
    accessType: documentAccessRules.accessType,
    createdAt: documentAccessRules.createdAt,
  }).from(documentAccessRules)
    .leftJoin(documents, eq(documentAccessRules.documentId, documents.id))
    .leftJoin(documentCategories, eq(documentAccessRules.documentCategoryId, documentCategories.id))
    .leftJoin(unitOrganisasi, eq(documentAccessRules.unitOrganisasiId, unitOrganisasi.id))
    .leftJoin(refGrade, eq(documentAccessRules.minGradeLevel, refGrade.level))
  const countBase = db.select({ total: count() }).from(documentAccessRules)
  const rows = await (where ? base.where(where) : base).orderBy(desc(documentAccessRules.createdAt)).limit(limit).offset(offset)
  const [{ total }] = await (where ? countBase.where(where) : countBase)
  return { rows, meta: buildMeta(page, limit, Number(total)) }
}

export async function createAccessRuleService(input: CreateAccessRuleInput) {
  const [created] = await db.insert(documentAccessRules).values({
    documentId: input.documentId ?? null,
    documentCategoryId: input.documentCategoryId ?? null,
    unitOrganisasiId: input.unitOrganisasiId ?? null,
    includeDescendants: input.includeDescendants,
    minGradeLevel: input.minGradeLevel ?? null,
    accessType: input.accessType,
  }).returning()
  return created
}

export async function updateAccessRuleService(id: string, input: CreateAccessRuleInput) {
  const [updated] = await db.update(documentAccessRules).set({
    documentId: input.documentId ?? null,
    documentCategoryId: input.documentCategoryId ?? null,
    unitOrganisasiId: input.unitOrganisasiId ?? null,
    includeDescendants: input.includeDescendants,
    minGradeLevel: input.minGradeLevel ?? null,
    accessType: input.accessType,
  }).where(eq(documentAccessRules.id, id)).returning()
  if (!updated) throw httpError(404, 'Access rule tidak ditemukan')
  return updated
}

export async function deleteAccessRuleService(id: string) {
  const [deleted] = await db.delete(documentAccessRules).where(eq(documentAccessRules.id, id)).returning()
  if (!deleted) throw httpError(404, 'Access rule tidak ditemukan')
  return deleted
}

export async function listDocumentApproversService(query: ListApproversQuery) {
  const { page, limit, offset } = getPaginationParams(query)
  const conditions: SQL[] = []
  if (query.documentCategoryId) conditions.push(eq(documentApprovers.documentCategoryId, query.documentCategoryId))
  if (query.unitOrganisasiId) conditions.push(eq(documentApprovers.unitOrganisasiId, query.unitOrganisasiId))
  const where = conditions.length ? and(...conditions) : undefined
  const base = db.select({
    id: documentApprovers.id,
    documentCategoryId: documentApprovers.documentCategoryId,
    categoryName: documentCategories.name,
    unitOrganisasiId: documentApprovers.unitOrganisasiId,
    unitName: unitOrganisasi.nama,
    employeeId: documentApprovers.employeeId,
    employeeName: employee.nama,
    employeeNrk: employee.nrk,
    approvalOrder: documentApprovers.approvalOrder,
    createdAt: documentApprovers.createdAt,
  }).from(documentApprovers)
    .leftJoin(documentCategories, eq(documentApprovers.documentCategoryId, documentCategories.id))
    .leftJoin(unitOrganisasi, eq(documentApprovers.unitOrganisasiId, unitOrganisasi.id))
    .innerJoin(employee, eq(documentApprovers.employeeId, employee.id))
  const countBase = db.select({ total: count() }).from(documentApprovers)
  const rows = await (where ? base.where(where) : base).orderBy(documentApprovers.approvalOrder, employee.nama).limit(limit).offset(offset)
  const [{ total }] = await (where ? countBase.where(where) : countBase)
  return { rows, meta: buildMeta(page, limit, Number(total)) }
}

export async function createDocumentApproverService(input: CreateDocumentApproverInput) {
  const [created] = await db.insert(documentApprovers).values({
    documentCategoryId: input.documentCategoryId ?? null,
    unitOrganisasiId: input.unitOrganisasiId ?? null,
    employeeId: input.employeeId,
    approvalOrder: input.approvalOrder,
  }).returning()
  return created
}

export async function updateDocumentApproverService(id: string, input: CreateDocumentApproverInput) {
  const [updated] = await db.update(documentApprovers).set({
    documentCategoryId: input.documentCategoryId ?? null,
    unitOrganisasiId: input.unitOrganisasiId ?? null,
    employeeId: input.employeeId,
    approvalOrder: input.approvalOrder,
  }).where(eq(documentApprovers.id, id)).returning()
  if (!updated) throw httpError(404, 'Approver dokumen tidak ditemukan')
  return updated
}

export async function deleteDocumentApproverService(id: string) {
  const [deleted] = await db.delete(documentApprovers).where(eq(documentApprovers.id, id)).returning()
  if (!deleted) throw httpError(404, 'Approver dokumen tidak ditemukan')
  return deleted
}
