// ─── Service: Global Document Viewers ─────────────────────────────────────────
// Mengelola unit organisasi atau karyawan individu yang mendapat akses view-only
// ke SEMUA dokumen aktif di seluruh organisasi.

import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { documentGlobalViewers, employee, unitOrganisasi } from '../db/schema'
import { httpError } from '../utils/httpError'

export interface AddGlobalViewerInput {
  unitOrganisasiId?: string | null
  employeeId?: string | null
  includeDescendants?: boolean
  notes?: string | null
}

export async function listGlobalViewersService() {
  const rows = await db.select({
    id: documentGlobalViewers.id,
    unitOrganisasiId: documentGlobalViewers.unitOrganisasiId,
    unitName: unitOrganisasi.nama,
    unitKode: unitOrganisasi.kode,
    unitTipe: unitOrganisasi.tipe,
    employeeId: documentGlobalViewers.employeeId,
    employeeName: employee.nama,
    employeeNrk: employee.nrk,
    employeeJabatan: employee.jabatan,
    includeDescendants: documentGlobalViewers.includeDescendants,
    notes: documentGlobalViewers.notes,
    createdBy: documentGlobalViewers.createdBy,
    createdAt: documentGlobalViewers.createdAt,
  })
    .from(documentGlobalViewers)
    .leftJoin(unitOrganisasi, eq(documentGlobalViewers.unitOrganisasiId, unitOrganisasi.id))
    .leftJoin(employee, eq(documentGlobalViewers.employeeId, employee.id))
    .orderBy(documentGlobalViewers.createdAt)

  return rows
}

export async function addGlobalViewerService(input: AddGlobalViewerInput, createdBy: string) {
  if (!input.unitOrganisasiId && !input.employeeId) {
    throw httpError(400, 'Harus memilih salah satu: unit organisasi atau karyawan')
  }
  if (input.unitOrganisasiId && input.employeeId) {
    throw httpError(400, 'Tidak boleh mengisi keduanya: pilih unit organisasi ATAU karyawan')
  }

  // Check for duplicates
  if (input.unitOrganisasiId) {
    const [existing] = await db.select({ id: documentGlobalViewers.id })
      .from(documentGlobalViewers)
      .where(eq(documentGlobalViewers.unitOrganisasiId, input.unitOrganisasiId))
      .limit(1)
    if (existing) throw httpError(409, 'Unit organisasi ini sudah terdaftar sebagai global viewer')
  }
  if (input.employeeId) {
    const [existing] = await db.select({ id: documentGlobalViewers.id })
      .from(documentGlobalViewers)
      .where(eq(documentGlobalViewers.employeeId, input.employeeId))
      .limit(1)
    if (existing) throw httpError(409, 'Karyawan ini sudah terdaftar sebagai global viewer')
  }

  const [created] = await db.insert(documentGlobalViewers).values({
    unitOrganisasiId: input.unitOrganisasiId ?? null,
    employeeId: input.employeeId ?? null,
    includeDescendants: input.includeDescendants ?? true,
    notes: input.notes ?? null,
    createdBy,
  }).returning()

  return created
}

export async function removeGlobalViewerService(id: string) {
  const [deleted] = await db.delete(documentGlobalViewers)
    .where(eq(documentGlobalViewers.id, id))
    .returning()
  if (!deleted) throw httpError(404, 'Global viewer tidak ditemukan')
  return deleted
}

/**
 * Memeriksa apakah karyawan tertentu adalah global viewer, baik secara langsung
 * (per-employee) maupun melalui unit organisasinya (termasuk ancestor jika include_descendants).
 */
export async function isGlobalViewer(employeeId: string): Promise<boolean> {
  const result = await db.execute<{ is_global: boolean }>(sql`
    WITH RECURSIVE employee_unit AS (
      SELECT e.unit_organisasi_id
      FROM employee e
      WHERE e.id = ${employeeId}::uuid AND e.is_active = true
    ), unit_ancestors AS (
      SELECT u.id, u.parent_id
      FROM unit_organisasi u
      JOIN employee_unit eu ON eu.unit_organisasi_id = u.id
      UNION ALL
      SELECT parent.id, parent.parent_id
      FROM unit_organisasi parent
      JOIN unit_ancestors child ON child.parent_id = parent.id
    )
    SELECT EXISTS (
      -- Direct employee match
      SELECT 1 FROM document_global_viewers gv
      WHERE gv.employee_id = ${employeeId}::uuid
      UNION ALL
      -- Unit match (exact unit)
      SELECT 1 FROM document_global_viewers gv
      JOIN employee_unit eu ON gv.unit_organisasi_id = eu.unit_organisasi_id
      WHERE gv.unit_organisasi_id IS NOT NULL
      UNION ALL
      -- Unit match (ancestor unit with include_descendants = true)
      SELECT 1 FROM document_global_viewers gv
      JOIN unit_ancestors ua ON gv.unit_organisasi_id = ua.id
      WHERE gv.unit_organisasi_id IS NOT NULL
        AND gv.include_descendants = true
    ) AS is_global
  `)
  return Boolean(result[0]?.is_global)
}
