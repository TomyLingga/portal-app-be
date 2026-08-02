import { and, count, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  documentAccessRules,
  documentCategories,
  documents,
  employee,
  refGrade,
  unitOrganisasi,
  user,
} from '../db/schema'
import { httpError } from '../utils/httpError'

export type DocumentAccessType = 'view' | 'edit' | 'approve'

export async function getDocumentActorContext(userId: string, requireEmployee = true) {
  const [actor] = await db
    .select({
      userId: user.id,
      role: user.role,
      employeeId: user.employeeId,
      employeeName: employee.nama,
      employeeNrk: employee.nrk,
      unitOrganisasiId: employee.unitOrganisasiId,
    })
    .from(user)
    .leftJoin(employee, eq(user.employeeId, employee.id))
    .where(eq(user.id, userId))
    .limit(1)

  if (!actor) throw httpError(401, 'User tidak ditemukan')
  if (requireEmployee && !actor.employeeId && actor.role !== 'super_admin') {
    throw httpError(403, 'Akun ini belum terhubung dengan data karyawan')
  }
  return actor
}

export async function checkDocumentRuleAccess(employeeId: string, documentId: string, accessType: DocumentAccessType) {
  const [doc] = await db.select({ uploadedBy: documents.uploadedBy, categoryId: documents.categoryId })
    .from(documents).where(eq(documents.id, documentId)).limit(1)
  if (doc?.uploadedBy === employeeId) {
    return true
  }

  /*
   * FAIL-CLOSED.
   *
   * Dulu: jumlah rule dihitung HANYA untuk `document_id` + `access_type`; bila nol
   * fungsi mengembalikan `true`. Akibatnya (a) dokumen yang diunggah tanpa
   * `targetUnitIds` sama sekali tidak punya rule sehingga terbuka untuk semua
   * karyawan, dan (b) karena tidak ada jalur kode yang pernah membuat rule
   * bertipe `edit`, pemeriksaan hak edit/hapus SELALU lolos.
   *
   * Sekarang: rule tingkat kategori ikut dihitung, dan bila memang tidak ada rule
   * yang berlaku maka akses DITOLAK. Pemilik dokumen dan super_admin tetap punya
   * jalur sendiri (pemilik di atas, super_admin diperiksa di pemanggil).
   */
  const [ruleCountRow] = await db.select({ count: count() })
    .from(documentAccessRules)
    .where(and(
      eq(documentAccessRules.accessType, accessType),
      doc?.categoryId
        ? or(
            eq(documentAccessRules.documentId, documentId),
            eq(documentAccessRules.documentCategoryId, doc.categoryId),
          )
        : eq(documentAccessRules.documentId, documentId),
    ))
  if (!ruleCountRow || Number(ruleCountRow.count) === 0) {
    return false
  }

  const result = await db.execute<{ allowed: boolean }>(sql`
    WITH RECURSIVE employee_context AS (
      SELECT e.id, e.unit_organisasi_id, g.level AS grade_level
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
    ), document_context AS (
      SELECT d.id, d.category_id
      FROM documents d
      WHERE d.id = ${documentId}::uuid AND d.is_active = true
    )
    SELECT EXISTS (
      SELECT 1
      FROM document_access_rules rule
      CROSS JOIN employee_context ec
      CROSS JOIN document_context dc
      WHERE rule.access_type = ${accessType}::document_access_type
        AND (rule.document_id = dc.id OR rule.document_category_id = dc.category_id)
        AND (rule.min_grade_level IS NULL OR ec.grade_level >= rule.min_grade_level)
        AND (
          rule.unit_organisasi_id IS NULL
          OR rule.unit_organisasi_id = ec.unit_organisasi_id
          OR (
            rule.include_descendants = true
            AND EXISTS (SELECT 1 FROM employee_ancestors a WHERE a.id = rule.unit_organisasi_id)
          )
        )
    ) AS allowed
  `)
  return Boolean(result[0]?.allowed)
}

export function checkDocumentViewAccess(employeeId: string, documentId: string) {
  return checkDocumentRuleAccess(employeeId, documentId, 'view')
}

export async function assertDocumentViewAccess(employeeId: string, documentId: string) {
  if (!await checkDocumentViewAccess(employeeId, documentId)) {
    throw httpError(403, 'Anda tidak memiliki hak melihat dokumen ini')
  }
}

/**
 * Menentukan approver berdasarkan hierarki organisasi (bukan tabel document_approvers).
 *
 * Approver yang sah:
 * 1. Karyawan yang berada di unit pemilik dokumen (owner_unit_id) DAN merupakan atasan (punya bawahan)
 * 2. Karyawan di unit ancestor (parent chain) dari unit pemilik dokumen, tipe sub_bagian ke atas
 * 3. Rantai atasan langsung pemohon ke atas (atasanId chain — BOM-2 ke atas)
 */
export async function listMatchingApproverIds(documentId: string, requesterEmployeeId?: string | null) {
  const result = await db.execute<{ employee_id: string }>(sql`
    WITH RECURSIVE
    -- Walk up the org tree from the document's owner unit
    doc_unit_ancestors AS (
      SELECT u.id, u.parent_id, u.tipe
      FROM unit_organisasi u
      JOIN documents d ON d.owner_unit_id = u.id
      WHERE d.id = ${documentId}::uuid
      UNION ALL
      SELECT parent.id, parent.parent_id, parent.tipe
      FROM unit_organisasi parent
      JOIN doc_unit_ancestors child ON child.parent_id = parent.id
    )
    -- Employees in the owner unit + ancestor units (sub_bagian and above)
    -- who are superiors (have at least 1 subordinate)
    SELECT DISTINCT e.id AS employee_id
    FROM employee e
    WHERE e.is_active = true
      AND e.unit_organisasi_id IN (SELECT id FROM doc_unit_ancestors)
      AND EXISTS (SELECT 1 FROM employee sub WHERE sub.atasan_id = e.id)
    ${requesterEmployeeId ? sql`
    UNION
    -- Walk up the requester's superior chain (atasan → atasan → ...)
    SELECT superior_id AS employee_id FROM (
      WITH RECURSIVE requester_superiors AS (
        SELECT e.atasan_id AS superior_id
        FROM employee e
        WHERE e.id = ${requesterEmployeeId}::uuid AND e.atasan_id IS NOT NULL
        UNION ALL
        SELECT parent_emp.atasan_id AS superior_id
        FROM employee parent_emp
        JOIN requester_superiors s ON s.superior_id = parent_emp.id
        WHERE parent_emp.atasan_id IS NOT NULL
      )
      SELECT superior_id FROM requester_superiors
    ) superiors
    ` : sql``}
  `)

  return result.map(r => r.employee_id)
}

export async function assertDocumentApprover(employeeId: string, documentId: string, requesterEmployeeId?: string | null) {
  const [userRow] = await db.select({ role: user.role }).from(user).where(eq(user.employeeId, employeeId)).limit(1)
  if (userRow?.role === 'super_admin') return
  const approvers = await listMatchingApproverIds(documentId, requesterEmployeeId)
  if (!approvers.includes(employeeId)) throw httpError(403, 'Anda bukan approver download yang sah untuk dokumen ini')
}

export async function getDocumentAccessContext(documentId: string) {
  const [row] = await db
    .select({
      id: documents.id,
      title: documents.title,
      categoryId: documents.categoryId,
      categoryName: documentCategories.name,
      ownerUnitId: documents.ownerUnitId,
      ownerUnitName: unitOrganisasi.nama,
      filePath: documents.filePath,
      isActive: documents.isActive,
    })
    .from(documents)
    .innerJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .leftJoin(unitOrganisasi, eq(documents.ownerUnitId, unitOrganisasi.id))
    .where(eq(documents.id, documentId))
    .limit(1)
  if (!row || !row.isActive) throw httpError(404, 'Dokumen tidak ditemukan')
  return row
}

/**
 * Returns the approver hierarchy for display in the FE (read-only informational).
 * Groups approvers by their source: unit hierarchy or superior chain.
 */
export async function listApproverHierarchyService() {
  // Get all units that own at least 1 document, plus their ancestors
  const rows = await db.execute<{
    unit_id: string
    unit_nama: string
    unit_kode: string
    unit_tipe: string
    parent_id: string | null
    employee_id: string
    employee_nama: string
    employee_nrk: string
    employee_jabatan: string | null
  }>(sql`
    WITH RECURSIVE
    owner_units AS (
      SELECT DISTINCT d.owner_unit_id AS id
      FROM documents d
      WHERE d.is_active = true AND d.owner_unit_id IS NOT NULL
    ),
    all_ancestor_units AS (
      SELECT u.id, u.nama, u.kode, u.tipe, u.parent_id
      FROM unit_organisasi u
      WHERE u.id IN (SELECT id FROM owner_units)
      UNION
      SELECT parent.id, parent.nama, parent.kode, parent.tipe, parent.parent_id
      FROM unit_organisasi parent
      JOIN all_ancestor_units child ON child.parent_id = parent.id
    )
    SELECT
      u.id AS unit_id,
      u.nama AS unit_nama,
      u.kode AS unit_kode,
      u.tipe AS unit_tipe,
      u.parent_id,
      e.id AS employee_id,
      e.nama AS employee_nama,
      e.nrk AS employee_nrk,
      e.jabatan AS employee_jabatan
    FROM all_ancestor_units u
    JOIN employee e ON e.unit_organisasi_id = u.id AND e.is_active = true
    WHERE EXISTS (SELECT 1 FROM employee sub WHERE sub.atasan_id = e.id)
    ORDER BY
      CASE u.tipe
        WHEN 'direktorat' THEN 1
        WHEN 'sevp' THEN 2
        WHEN 'bagian' THEN 3
        WHEN 'sub_bagian' THEN 4
        WHEN 'seksi' THEN 5
      END,
      u.nama, e.nama
  `)

  // Group by unit
  const unitMap = new Map<string, {
    unitId: string
    unitNama: string
    unitKode: string
    unitTipe: string
    parentId: string | null
    approvers: { employeeId: string; nama: string; nrk: string; jabatan: string | null }[]
  }>()

  for (const row of rows) {
    let unit = unitMap.get(row.unit_id)
    if (!unit) {
      unit = {
        unitId: row.unit_id,
        unitNama: row.unit_nama,
        unitKode: row.unit_kode,
        unitTipe: row.unit_tipe,
        parentId: row.parent_id,
        approvers: [],
      }
      unitMap.set(row.unit_id, unit)
    }
    unit.approvers.push({
      employeeId: row.employee_id,
      nama: row.employee_nama,
      nrk: row.employee_nrk,
      jabatan: row.employee_jabatan,
    })
  }

  return Array.from(unitMap.values())
}
