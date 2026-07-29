import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
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
      employeeId: employee.id,
      employeeName: employee.nama,
      employeeNrk: employee.nrk,
      unitOrganisasiId: employee.unitOrganisasiId,
      gradeLevel: refGrade.level,
      gradeCode: refGrade.kode,
    })
    .from(user)
    .leftJoin(employee, eq(user.employeeId, employee.id))
    .leftJoin(refGrade, eq(employee.gradeId, refGrade.id))
    .where(and(eq(user.id, userId), eq(user.isActive, true)))
    .limit(1)

  if (!actor) throw httpError(401, 'User Portal tidak ditemukan')
  if (requireEmployee && !actor.employeeId) {
    throw httpError(403, 'Akun Portal harus terhubung dengan data karyawan untuk mengakses dokumen')
  }
  return actor
}

export async function checkDocumentRuleAccess(employeeId: string, documentId: string, accessType: DocumentAccessType) {
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
  const rows = await db
    .selectDistinct({ employeeId: documentApprovers.employeeId })
    .from(documentApprovers)
    .innerJoin(documents, eq(documents.id, documentId))
    .where(or(
      eq(documentApprovers.documentCategoryId, documents.categoryId),
      and(
        eq(documentApprovers.unitOrganisasiId, documents.ownerUnitId),
        sql`${documents.ownerUnitId} IS NOT NULL`,
      ),
    ))
  const approvers = rows.map(row => row.employeeId)

  if (requesterEmployeeId) {
    const [reqEmp] = await db
      .select({ atasanId: employee.atasanId })
      .from(employee)
      .where(eq(employee.id, requesterEmployeeId))
      .limit(1)
    if (reqEmp?.atasanId && !approvers.includes(reqEmp.atasanId)) {
      approvers.push(reqEmp.atasanId)
    }
  }

  return approvers
}

export async function assertDocumentApprover(employeeId: string, documentId: string, requesterEmployeeId?: string | null) {
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
      autoApproveGradeLevel: documentCategories.autoApproveGradeLevel,
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
