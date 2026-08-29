// ─── Service: Employee ────────────────────────────────────────────────────────
import { eq, ilike, and, count, or, SQL, gte, lte, isNull, isNotNull, sql } from 'drizzle-orm'
import { db }            from '../db'
import { employee, activityLog, user, unitOrganisasi } from '../db/schema'
import { getPaginationParams, buildMeta } from '../utils/pagination'
import { buildFileUrl, deleteFile }       from '../utils/file'
import { hashPassword }                    from '../utils/hash'
import type { CreateEmployeeInput, UpdateEmployeeInput, ImportEmployeeInput, ListEmployeeQuery } from '../validators/employee.validator'

// Password default untuk akun yang dibuat otomatis saat import employee.
export const IMPORT_DEFAULT_PASSWORD = 'User@123'

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
  if (query.jenisKelamin) conditions.push(eq(employee.jenisKelamin, query.jenisKelamin))
  if (query.penempatanAreaId) conditions.push(eq(employee.penempatanAreaId, query.penempatanAreaId))
  if (query.statusKaryawanId) conditions.push(eq(employee.statusKaryawanId, query.statusKaryawanId))
  if (query.statusPernikahanId) conditions.push(eq(employee.statusPernikahanId, query.statusPernikahanId))
  if (query.tanggalMasukFrom) conditions.push(gte(employee.tanggalMasuk, query.tanggalMasukFrom))
  if (query.tanggalMasukTo) conditions.push(lte(employee.tanggalMasuk, query.tanggalMasukTo))
  if (query.hasUser !== undefined) conditions.push(query.hasUser ? isNotNull(user.id) : isNull(user.id))

  const where = conditions.length ? and(...conditions) : undefined

  // Agregat dihitung di seluruh hasil filter sebelum limit/offset diterapkan.
  // Dengan begitu kartu statistik tidak ikut terpotong oleh pagination tabel.
  const [summary] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${employee.isActive} = true)`,
      inactive: sql<number>`count(*) filter (where ${employee.isActive} = false)`,
      male: sql<number>`count(*) filter (where ${employee.jenisKelamin} = 'L')`,
      female: sql<number>`count(*) filter (where ${employee.jenisKelamin} = 'P')`,
    })
    .from(employee)
    .leftJoin(user, eq(employee.id, user.employeeId))
    .where(where)

  const stats = {
    total: Number(summary?.total ?? 0),
    active: Number(summary?.active ?? 0),
    inactive: Number(summary?.inactive ?? 0),
    male: Number(summary?.male ?? 0),
    female: Number(summary?.female ?? 0),
  }

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
    meta: {
      ...buildMeta(page, limit, stats.total),
      stats,
    },
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

const unitCodePrefix: Record<ImportEmployeeInput['unitPath'][number]['tipe'], string> = {
  direktorat: 'DIR',
  sevp: 'SEVP',
  bagian: 'BAG',
  sub_bagian: 'SUB',
  seksi: 'SEK',
}

function normalizeUnitName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // Samakan angka Romawi umum dgn angka Arab agar "PMG II" = "PMG 2", dst.
    // Hindari duplikat unit karena beda penulisan angka.
    .replace(/\biii\b/g, '3')
    .replace(/\bii\b/g, '2')
    .replace(/\biv\b/g, '4')
    .replace(/\bi\b/g, '1')
    .replace(/\bv\b/g, '5')
}

function createUniqueUnitCode(name: string, tipe: ImportEmployeeInput['unitPath'][number]['tipe'], usedCodes: Set<string>) {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const token = words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] || 'UNIT').slice(0, 10)
  const base = `${unitCodePrefix[tipe]}-${token}`.slice(0, 20)
  let code = base
  let suffix = 2
  while (usedCodes.has(code)) {
    const tail = `-${suffix}`
    code = `${base.slice(0, 20 - tail.length)}${tail}`
    suffix += 1
  }
  usedCodes.add(code)
  return code
}

export async function importEmployeeService(input: ImportEmployeeInput, userId: string) {
  return db.transaction(async (tx) => {
    if (input.nrk) {
      const [dupNrk] = await tx.select({ id: employee.id }).from(employee).where(eq(employee.nrk, input.nrk)).limit(1)
      if (dupNrk) throw new Error('NRK sudah terdaftar')
    }

    if (input.nik) {
      const [dupNik] = await tx.select({ id: employee.id }).from(employee).where(eq(employee.nik, input.nik)).limit(1)
      if (dupNik) throw new Error('NIK sudah terdaftar')
    }

    const units = await tx.select().from(unitOrganisasi)
    const usedCodes = new Set(units.map((unit) => unit.kode))
    const createdUnits: Array<typeof unitOrganisasi.$inferSelect> = []
    let parentId: string | null = null

    for (const pathItem of input.unitPath) {
      const wantedName = normalizeUnitName(pathItem.nama)
      let unit = units.find((candidate) => (
        normalizeUnitName(candidate.nama) === wantedName && candidate.parentId === parentId
      ))

      if (!unit) {
        const createdRows: Array<typeof unitOrganisasi.$inferSelect> = await tx.insert(unitOrganisasi).values({
          nama: pathItem.nama.trim(),
          kode: createUniqueUnitCode(pathItem.nama, pathItem.tipe, usedCodes),
          tipe: pathItem.tipe,
          parentId,
          isActive: true,
        }).returning()
        const createdUnit = createdRows[0]
        if (!createdUnit) throw new Error(`Gagal membuat unit organisasi ${pathItem.nama}`)
        unit = createdUnit
        units.push(createdUnit)
        createdUnits.push(createdUnit)
        await tx.insert(activityLog).values({
          userId,
          action: 'create_unit_import',
          details: `Membuat unit organisasi dari import employee: "${createdUnit.nama}" (Kode: ${createdUnit.kode})`,
        })
      }

      if (!unit) throw new Error(`Unit organisasi ${pathItem.nama} tidak dapat diproses`)
      parentId = unit.id
    }

    const { unitPath, email, password, ...employeeInput } = input
    const [created] = await tx.insert(employee).values({
      ...employeeInput,
      nrk: employeeInput.nrk ?? null,
      nik: employeeInput.nik ?? null,
      nama: employeeInput.nama ?? null,
      jenisKelamin: employeeInput.jenisKelamin ?? null,
      jabatan: employeeInput.jabatan ?? null,
      atasanId: null,
      unitOrganisasiId: parentId,
      tanggalMasuk: employeeInput.tanggalMasuk ?? null,
      tempatLahir: employeeInput.tempatLahir ?? null,
      tanggalLahir: employeeInput.tanggalLahir ?? null,
      statusKaryawanId: employeeInput.statusKaryawanId ?? null,
      pendidikanTerakhirId: employeeInput.pendidikanTerakhirId ?? null,
      statusPernikahanId: employeeInput.statusPernikahanId ?? null,
      penempatanAreaId: employeeInput.penempatanAreaId ?? null,
      nomorHp: employeeInput.nomorHp ?? null,
      alamat: employeeInput.alamat ?? null,
      agama: employeeInput.agama ?? null,
    }).returning()

    await tx.insert(activityLog).values({
      userId,
      action: 'import_employee',
      details: `Mengimport karyawan: ${created.nama ?? '(tanpa nama)'} (NRK: ${created.nrk ?? '-'}), Unit: ${unitPath.map((item) => item.nama).join(' > ')}`,
    })

    /*
     * Buat akun user otomatis bila email tersedia dan belum terpakai.
     * Password diambil dari kolom `password` di Excel; bila kolomnya tidak ada
     * atau kosong, dipakai IMPORT_DEFAULT_PASSWORD. Validasi kekuatan password
     * sudah dilakukan di importEmployeeSchema.
     */
    let createdUser: { id: string; email: string; usedDefaultPassword: boolean } | null = null
    if (email) {
      const [existingUser] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1)
      if (!existingUser) {
        const plainPassword = password?.trim() ? password.trim() : IMPORT_DEFAULT_PASSWORD
        const usedDefaultPassword = plainPassword === IMPORT_DEFAULT_PASSWORD
        const passwordHash = await hashPassword(plainPassword)
        const [newUser] = await tx.insert(user).values({
          email,
          passwordHash,
          role: 'user',
          isActive: true,
          employeeId: created.id,
        }).returning({ id: user.id, email: user.email })
        createdUser = { ...newUser, usedDefaultPassword }
        await tx.insert(activityLog).values({
          userId,
          action: 'import_user',
          details: `Membuat akun user dari import employee: ${newUser.email} (${usedDefaultPassword ? 'password default' : 'password dari file Excel'})`,
        })
      }
    }

    return {
      employee: withFileUrl(created),
      createdUser,
      createdUnits: createdUnits.map(({ id, nama, kode, tipe, parentId: unitParentId }) => ({
        id,
        nama,
        kode,
        tipe,
        parentId: unitParentId,
      })),
    }
  })
}

export async function updateEmployeeService(id: string, input: UpdateEmployeeInput, userId: string) {
  const [existing] = await db
    .select({ id: employee.id })
    .from(employee)
    .where(eq(employee.id, id))
    .limit(1)

  if (!existing) throw new Error('Employee tidak ditemukan')

  if (input.nrk) {
    const [dupNrk] = await db.select({ id: employee.id }).from(employee).where(eq(employee.nrk, input.nrk)).limit(1)
    if (dupNrk && dupNrk.id !== id) throw new Error('NRK sudah terdaftar pada karyawan lain')
  }

  if (input.nik) {
    const [dupNik] = await db.select({ id: employee.id }).from(employee).where(eq(employee.nik, input.nik)).limit(1)
    if (dupNik && dupNik.id !== id) throw new Error('NIK sudah terdaftar pada karyawan lain')
  }

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
