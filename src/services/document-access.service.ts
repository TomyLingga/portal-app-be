import { and, count, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  documentAccessRules,
  documentApprovers,
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
  const [doc] = await db.select({ uploadedBy: documents.uploadedBy }).from(documents).where(eq(documents.id, documentId)).limit(1)
  if (doc?.uploadedBy === employeeId) {
    return true
  }

  const [ruleCountRow] = await db.select({ count: count() })
    .from(documentAccessRules)
    .where(and(eq(documentAccessRules.documentId, documentId), eq(documentAccessRules.accessType, accessType)))
  if (!ruleCountRow || Number(ruleCountRow.count) === 0) {
    return true
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

export async function listMatchingApproverIds(documentId: string, requesterEmployeeId?: string | null) {
  if (!requesterEmployeeId) {
    const rows = await db.selectDistinct({ employeeId: documentApprovers.employeeId })
      .from(documentApprovers)
      .innerJoin(documents, eq(documents.id, documentId))
      .where(or(
        eq(documentApprovers.documentCategoryId, documents.categoryId),
        eq(documentApprovers.unitOrganisasiId, documents.ownerUnitId),
      ))
    return rows.map(r => r.employeeId)
  }

  const result = await db.execute<{ employee_id: string }>(sql`
    WITH RECURSIVE requester_superiors AS (
      SELECT e.atasan_id AS superior_id
      FROM employee e
      WHERE e.id = ${requesterEmployeeId}::uuid AND e.atasan_id IS NOT NULL
      UNION ALL
      SELECT parent_emp.atasan_id AS superior_id
      FROM employee parent_emp
      JOIN requester_superiors s ON s.superior_id = parent_emp.id
      WHERE parent_emp.atasan_id IS NOT NULL
    ), requester_unit_ancestors AS (
      SELECT u.id, u.parent_id
      FROM unit_organisasi u
      JOIN employee e ON e.unit_organisasi_id = u.id
      WHERE e.id = ${requesterEmployeeId}::uuid
      UNION ALL
      SELECT parent.id, parent.parent_id
      FROM unit_organisasi parent
      JOIN requester_unit_ancestors child ON child.parent_id = parent.id
    ), doc_unit_ancestors AS (
      SELECT u.id, u.parent_id
      FROM unit_organisasi u
      JOIN documents d ON d.owner_unit_id = u.id
      WHERE d.id = ${documentId}::uuid
      UNION ALL
      SELECT parent.id, parent.parent_id
      FROM unit_organisasi parent
      JOIN doc_unit_ancestors child ON child.parent_id = parent.id
    )
    SELECT superior_id AS employee_id FROM requester_superiors
    UNION
    SELECT da.employee_id
    FROM document_approvers da
    CROSS JOIN documents d
    WHERE d.id = ${documentId}::uuid
      AND (
        da.document_category_id = d.category_id
        OR da.unit_organisasi_id IN (SELECT id FROM requester_unit_ancestors)
        OR da.unit_organisasi_id IN (SELECT id FROM doc_unit_ancestors)
      )
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
