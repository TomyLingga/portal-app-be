// ─── Service: Employee ────────────────────────────────────────────────────────
import { eq, ilike, and, count, or, SQL } from 'drizzle-orm'
import { db }            from '../db'
import { employee, activityLog, user }      from '../db/schema'
import { getPaginationParams, buildMeta } from '../utils/pagination'
import { buildFileUrl, deleteFile }       from '../utils/file'
import type { CreateEmployeeInput, UpdateEmployeeInput, ListEmployeeQuery } from '../validators/employee.validator'

function withFileUrl(row: any) {
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
        ilike(employee.nrk, `%${query.search}%`),
        ilike(employee.nik, `%${query.search}%`),
        ilike(employee.nama, `%${query.search}%`),
        ilike(employee.jabatan, `%${query.search}%`),
        ilike(employee.tempatLahir, `%${query.search}%`)
      ) as SQL
    )
  }
  if (query.unitOrganisasiId) conditions.push(eq(employee.unitOrganisasiId, query.unitOrganisasiId))
  if (query.gradeId)          conditions.push(eq(employee.gradeId, query.gradeId))
  if (query.isActive !== undefined) conditions.push(eq(employee.isActive, query.isActive))

  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(employee).where(where)

  const rows = await db
    .select({
      id: employee.id,
      nrk: employee.nrk,
      nik: employee.nik,
      nama: employee.nama,
      jenisKelamin: employee.jenisKelamin,
      jabatan: employee.jabatan,
      gradeId: employee.gradeId,
      atasanId: employee.atasanId,
      unitOrganisasiId: employee.unitOrganisasiId,
      tanggalMasuk: employee.tanggalMasuk,
      tempatLahir: employee.tempatLahir,
      tanggalLahir: employee.tanggalLahir,
      nomorHp: employee.nomorHp,
      alamat: employee.alamat,
      isActive: employee.isActive,
      fotoProfil: employee.fotoProfil,
      statusKaryawanId: employee.statusKaryawanId,
      pendidikanTerakhirId: employee.pendidikanTerakhirId,
      statusPernikahanId: employee.statusPernikahanId,
      penempatanAreaId: employee.penempatanAreaId,
      agama: employee.agama,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      // joined user fields:
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      userIsActive: user.isActive,
    })
    .from(employee)
    .leftJoin(user, eq(employee.id, user.employeeId))
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

export async function createEmployeeService(input: CreateEmployeeInput, userId: string) {
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
      penempatanAreaId:     input.penempatanAreaId     ?? null,
      agama:                input.agama                ?? null,
    })
    .returning()

  // Log activity
  await db.insert(activityLog).values({
    userId,
    action: 'create_employee',
    details: `Menambahkan karyawan baru: ${created.nama} (NRK: ${created.nrk})`,
  })

  return withFileUrl(created)
}

export async function updateEmployeeService(id: string, input: UpdateEmployeeInput, userId: string) {
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

  // Log activity
  await db.insert(activityLog).values({
    userId,
    action: 'update_employee',
    details: `Memperbarui data karyawan: ${updated.nama} (NRK: ${updated.nrk})`,
  })

  return withFileUrl(updated)
}

export async function updateEmployeePhotoService(id: string, filename: string, userId: string) {
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
    .returning({ fotoProfil: employee.fotoProfil, nama: employee.nama, nrk: employee.nrk })

  // Log activity
  await db.insert(activityLog).values({
    userId,
    action: 'update_employee_photo',
    details: `Memperbarui foto profil karyawan: ${updated.nama} (NRK: ${updated.nrk})`,
  })

  return { fotoUrl: buildFileUrl(updated.fotoProfil) }
}

export async function deleteEmployeeService(id: string, userId: string) {
  const [existing] = await db
    .select({ id: employee.id, fotoProfil: employee.fotoProfil, nama: employee.nama, nrk: employee.nrk })
    .from(employee)
    .where(eq(employee.id, id))
    .limit(1)

  if (!existing) throw new Error('Employee tidak ditemukan')

  // Hapus foto jika ada
  if (existing.fotoProfil) deleteFile(existing.fotoProfil)

  await db.delete(employee).where(eq(employee.id, id))

  // Log activity
  await db.insert(activityLog).values({
    userId,
    action: 'delete_employee',
    details: `Menghapus karyawan: ${existing.nama} (NRK: ${existing.nrk})`,
  })
}
