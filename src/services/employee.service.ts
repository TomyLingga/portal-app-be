// ─── Service: Employee ────────────────────────────────────────────────────────
import { eq, ilike, and, count, or, SQL } from 'drizzle-orm'
import { db }            from '../db'
import { employee }      from '../db/schema'
import { getPaginationParams, buildMeta } from '../utils/pagination'
import { buildFileUrl, deleteFile }       from '../utils/file'
import type { CreateEmployeeInput, UpdateEmployeeInput, ListEmployeeQuery } from '../validators/employee.validator'

function withFileUrl(row: typeof employee.$inferSelect) {
  return {
    ...row,
    fotoProfil: buildFileUrl(row.fotoProfil),
  }
}

export async function listEmployeesService(query: ListEmployeeQuery) {
  const { page, limit, offset } = getPaginationParams(query)

  const conditions: SQL[] = []
  if (query.search) {
    conditions.push(
      or(
        ilike(employee.nama, `%${query.search}%`),
        ilike(employee.nrk,  `%${query.search}%`),
        ilike(employee.nik,  `%${query.search}%`),
      )!
    )
  }
  if (query.unitOrganisasiId) conditions.push(eq(employee.unitOrganisasiId, query.unitOrganisasiId))
  if (query.gradeId)          conditions.push(eq(employee.gradeId, query.gradeId))
  if (query.isActive !== undefined) conditions.push(eq(employee.isActive, query.isActive))

  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(employee).where(where)

  const rows = await db
    .select()
    .from(employee)
    .where(where)
    .limit(limit)
    .offset(offset)
    .orderBy(employee.nama)

  return {
    rows: rows.map(withFileUrl),
    meta: buildMeta(page, limit, Number(total)),
  }
}

export async function getEmployeeByIdService(id: string) {
  const [found] = await db
    .select()
    .from(employee)
    .where(eq(employee.id, id))
    .limit(1)

  if (!found) throw new Error('Employee tidak ditemukan')
  return withFileUrl(found)
}

export async function createEmployeeService(input: CreateEmployeeInput) {
  // Cek nrk & nik duplikat
  const [dupNrk] = await db.select({ id: employee.id }).from(employee).where(eq(employee.nrk, input.nrk)).limit(1)
  if (dupNrk) throw new Error('NRK sudah terdaftar')

  const [dupNik] = await db.select({ id: employee.id }).from(employee).where(eq(employee.nik, input.nik)).limit(1)
  if (dupNik) throw new Error('NIK sudah terdaftar')

  const [created] = await db
    .insert(employee)
    .values({
      ...input,
      gradeId:              input.gradeId              ?? null,
      atasanId:             input.atasanId             ?? null,
      unitOrganisasiId:     input.unitOrganisasiId     ?? null,
      statusKaryawanId:     input.statusKaryawanId     ?? null,
      pendidikanTerakhirId: input.pendidikanTerakhirId ?? null,
      statusPernikahanId:   input.statusPernikahanId   ?? null,
    })
    .returning()

  return withFileUrl(created)
}

export async function updateEmployeeService(id: string, input: UpdateEmployeeInput) {
  const [existing] = await db
    .select({ id: employee.id })
    .from(employee)
    .where(eq(employee.id, id))
    .limit(1)

  if (!existing) throw new Error('Employee tidak ditemukan')

  const [updated] = await db
    .update(employee)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(employee.id, id))
    .returning()

  return withFileUrl(updated)
}

export async function updateEmployeePhotoService(id: string, filename: string) {
  const [existing] = await db
    .select({ id: employee.id, fotoProfil: employee.fotoProfil })
    .from(employee)
    .where(eq(employee.id, id))
    .limit(1)

  if (!existing) throw new Error('Employee tidak ditemukan')

  // Hapus foto lama jika ada
  if (existing.fotoProfil) deleteFile(existing.fotoProfil)

  const [updated] = await db
    .update(employee)
    .set({ fotoProfil: filename, updatedAt: new Date() })
    .where(eq(employee.id, id))
    .returning({ fotoProfil: employee.fotoProfil })

  return { fotoUrl: buildFileUrl(updated.fotoProfil) }
}

export async function deleteEmployeeService(id: string) {
  const [existing] = await db
    .select({ id: employee.id, fotoProfil: employee.fotoProfil })
    .from(employee)
    .where(eq(employee.id, id))
    .limit(1)

  if (!existing) throw new Error('Employee tidak ditemukan')

  // Hapus foto jika ada
  if (existing.fotoProfil) deleteFile(existing.fotoProfil)

  await db.delete(employee).where(eq(employee.id, id))
}
