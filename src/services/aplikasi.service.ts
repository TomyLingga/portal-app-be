// ─── Service: Aplikasi ────────────────────────────────────────────────────────
import { eq, ilike, and, count, SQL, inArray, isNotNull } from 'drizzle-orm'
import { db }        from '../db'
import { aplikasi, activityLog, appUserAccess, user, employee, unitOrganisasi }  from '../db/schema'
import { getPaginationParams, buildMeta } from '../utils/pagination'
import type { CreateAplikasiInput, UpdateAplikasiInput, ListAplikasiQuery } from '../validators/aplikasi.validator'
import { deleteFile, buildFileUrl } from '../utils/file'

export async function listAplikasiService(query: ListAplikasiQuery, userId?: string, userRole?: string) {
  const { page, limit, offset } = getPaginationParams(query)
  const conditions: SQL[] = []
  if (query.search)              conditions.push(ilike(aplikasi.nama, `%${query.search}%`))
  if (query.authMode)            conditions.push(eq(aplikasi.authMode, query.authMode))
  if (query.isActive !== undefined) conditions.push(eq(aplikasi.isActive, query.isActive))
  const where = conditions.length ? and(...conditions) : undefined

  let rows = await db
    .select()
    .from(aplikasi)
    .where(where)
    .orderBy(aplikasi.urutan, aplikasi.nama)

  const isSuperAdmin = userRole?.split(',').includes('super_admin') ?? false

  // Filter apps by accessMode for normal employees if userId is provided
  if (userId && !isSuperAdmin) {
    const [u] = await db
      .select({ employeeId: user.employeeId, unitOrganisasiId: employee.unitOrganisasiId })
      .from(user)
      .leftJoin(employee, eq(user.employeeId, employee.id))
      .where(eq(user.id, userId))
      .limit(1)

    // Get user's records in app_user_access
    const userAccessRecords = await db
      .select({ appId: appUserAccess.appId })
      .from(appUserAccess)
      .where(eq(appUserAccess.userId, userId))

    const grantedAppIds = new Set(userAccessRecords.map(a => a.appId))

    rows = rows.filter(app => {
      if (app.authMode === 'independent') return true

      const mode = app.accessMode ?? 'all_employees'
      if (mode === 'all_employees') return true
      if (mode === 'all_except') return !grantedAppIds.has(app.id) // Blacklist: true if not in list
      if (mode === 'specific_only') return grantedAppIds.has(app.id) // Whitelist: true if in list
      if (mode === 'by_unit') {
        if (!u || !u.unitOrganisasiId) return false
        const targetUnits = app.targetUnitIds ? app.targetUnitIds.split(',').map(s => s.trim()) : []
        return targetUnits.includes(u.unitOrganisasiId)
      }
      return true
    })
  }

  const total = rows.length
  const paginatedRows = rows.slice(offset, offset + limit)

  return { rows: paginatedRows, meta: buildMeta(page, limit, total) }
}

export async function getAplikasiByIdService(id: string) {
  const [found] = await db.select().from(aplikasi).where(eq(aplikasi.id, id)).limit(1)
  if (!found) throw new Error('Aplikasi tidak ditemukan')
  return found
}

export async function createAplikasiService(input: CreateAplikasiInput, userId: string) {
  const [created] = await db.insert(aplikasi).values(input).returning()

  // Log activity
  await db.insert(activityLog).values({
    userId,
    action: 'create_aplikasi',
    details: `Menambahkan aplikasi baru: "${created.nama}"`,
  })

  return created
}

export async function updateAplikasiService(id: string, input: UpdateAplikasiInput, userId: string) {
  const [existing] = await db.select({ id: aplikasi.id, nama: aplikasi.nama }).from(aplikasi).where(eq(aplikasi.id, id)).limit(1)
  if (!existing) throw new Error('Aplikasi tidak ditemukan')

  const [updated] = await db
    .update(aplikasi)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(aplikasi.id, id))
    .returning()

  // Log activity
  await db.insert(activityLog).values({
    userId,
    action: 'update_aplikasi',
    details: `Memperbarui aplikasi: "${updated.nama}"`,
  })

  return updated
}

export async function deleteAplikasiService(id: string, userId: string) {
  const [existing] = await db.select({ id: aplikasi.id, icon: aplikasi.icon, nama: aplikasi.nama }).from(aplikasi).where(eq(aplikasi.id, id)).limit(1)
  if (!existing) throw new Error('Aplikasi tidak ditemukan')

  if (existing.icon && (existing.icon.includes('/') || existing.icon.includes('.'))) {
    deleteFile(existing.icon)
  }

  await db.delete(aplikasi).where(eq(aplikasi.id, id))

  // Log activity
  await db.insert(activityLog).values({
    userId,
    action: 'delete_aplikasi',
    details: `Menghapus aplikasi: "${existing.nama}"`,
  })
}

export async function updateAplikasiIconService(id: string, filename: string, userId: string) {
  const [existing] = await db
    .select({ id: aplikasi.id, icon: aplikasi.icon, nama: aplikasi.nama })
    .from(aplikasi)
    .where(eq(aplikasi.id, id))
    .limit(1)

  if (!existing) throw new Error('Aplikasi tidak ditemukan')

  // Hapus icon lama jika berupa berkas gambar
  if (existing.icon && (existing.icon.includes('/') || existing.icon.includes('.'))) {
    deleteFile(existing.icon)
  }

  const [updated] = await db
    .update(aplikasi)
    .set({ icon: filename, updatedAt: new Date() })
    .where(eq(aplikasi.id, id))
    .returning({ icon: aplikasi.icon, nama: aplikasi.nama })

  // Log activity
  await db.insert(activityLog).values({
    userId,
    action: 'update_aplikasi_icon',
    details: `Memperbarui icon aplikasi: "${updated.nama}"`,
  })

  return { iconUrl: buildFileUrl(updated.icon) }
}

export async function logAppAccessService(userId: string, appId: string) {
  const [app] = await db
    .select({
      nama: aplikasi.nama,
      authMode: aplikasi.authMode,
      isActive: aplikasi.isActive,
    })
    .from(aplikasi)
    .where(eq(aplikasi.id, appId))
    .limit(1)
  if (!app || !app.isActive) throw new Error('Aplikasi tidak ditemukan atau tidak aktif')
  if (app.authMode !== 'independent') {
    throw new Error('Aplikasi SSO harus dibuka melalui proses login SSO Portal.')
  }

  await db.insert(activityLog).values({
    userId,
    appId,
    action: 'access_app',
    details: `Mengakses aplikasi Independent "${app.nama}"`,
  })
}

// ─── App User Access Services ────────────────────────────────────────────────
export async function getAppAccessListService(appId: string) {
  const rows = await db
    .select({
      id: appUserAccess.id,
      userId: appUserAccess.userId,
      appId: appUserAccess.appId,
      grantedAt: appUserAccess.grantedAt,
      email: user.email,
      role: user.role,
      employeeNama: employee.nama,
      employeeNrk: employee.nrk,
      jabatan: employee.jabatan,
      unitNama: unitOrganisasi.nama,
    })
    .from(appUserAccess)
    .innerJoin(user, eq(appUserAccess.userId, user.id))
    .leftJoin(employee, eq(user.employeeId, employee.id))
    .leftJoin(unitOrganisasi, eq(employee.unitOrganisasiId, unitOrganisasi.id))
    .where(eq(appUserAccess.appId, appId))

  return rows
}

export async function grantAppAccessService(appId: string, userIds: string[], grantedById: string) {
  const [app] = await db.select({ nama: aplikasi.nama }).from(aplikasi).where(eq(aplikasi.id, appId)).limit(1)
  if (!app) throw new Error('Aplikasi tidak ditemukan')

  const grantedResults = []
  for (const userId of userIds) {
    const [existing] = await db
      .select({ id: appUserAccess.id })
      .from(appUserAccess)
      .where(and(eq(appUserAccess.appId, appId), eq(appUserAccess.userId, userId)))
      .limit(1)

    if (!existing) {
      const [inserted] = await db
        .insert(appUserAccess)
        .values({ appId, userId, grantedById })
        .returning()
      grantedResults.push(inserted)
    }
  }

  await db.insert(activityLog).values({
    userId: grantedById,
    appId,
    action: 'grant_app_access',
    details: `Memberikan hak akses aplikasi "${app.nama}" kepada ${grantedResults.length} pengguna`,
  })

  return grantedResults
}

export async function revokeAppAccessService(appId: string, userId: string, revokedById: string) {
  const [app] = await db.select({ nama: aplikasi.nama }).from(aplikasi).where(eq(aplikasi.id, appId)).limit(1)
  if (!app) throw new Error('Aplikasi tidak ditemukan')

  await db
    .delete(appUserAccess)
    .where(and(eq(appUserAccess.appId, appId), eq(appUserAccess.userId, userId)))

  await db.insert(activityLog).values({
    userId: revokedById,
    appId,
    action: 'revoke_app_access',
    details: `Menghapus hak akses aplikasi "${app.nama}" dari pengguna`,
  })
}

export async function updateAppAccessModeService(
  appId: string,
  accessMode: 'all_employees' | 'all_except' | 'specific_only' | 'by_unit',
  targetUnitIds: string[] | null,
  userId: string
) {
  const [app] = await db.select({ nama: aplikasi.nama }).from(aplikasi).where(eq(aplikasi.id, appId)).limit(1)
  if (!app) throw new Error('Aplikasi tidak ditemukan')

  const targetUnitsStr = targetUnitIds && targetUnitIds.length > 0 ? targetUnitIds.join(',') : null

  const [updated] = await db
    .update(aplikasi)
    .set({
      accessMode,
      targetUnitIds: targetUnitsStr,
      updatedAt: new Date(),
    })
    .where(eq(aplikasi.id, appId))
    .returning()

  await db.insert(activityLog).values({
    userId,
    appId,
    action: 'update_access_mode',
    details: `Memperbarui mode akses aplikasi "${app.nama}" menjadi mode "${accessMode}"`,
  })

  return updated
}

export async function getAppAccessSummaryService(appId: string) {
  const [app] = await db
    .select({
      id: aplikasi.id,
      nama: aplikasi.nama,
      accessMode: aplikasi.accessMode,
      targetUnitIds: aplikasi.targetUnitIds,
    })
    .from(aplikasi)
    .where(eq(aplikasi.id, appId))
    .limit(1)

  if (!app) throw new Error('Aplikasi tidak ditemukan')

  // Total active employees connected to users
  const [{ totalEmployees }] = await db
    .select({ totalEmployees: count() })
    .from(user)
    .where(and(eq(user.isActive, true), isNotNull(user.employeeId)))

  // Custom user access count
  const [{ customAccessCount }] = await db
    .select({ customAccessCount: count() })
    .from(appUserAccess)
    .where(eq(appUserAccess.appId, appId))

  const mode = app.accessMode ?? 'all_employees'
  let estimatedAllowed = Number(totalEmployees)

  if (mode === 'all_except') {
    estimatedAllowed = Math.max(0, Number(totalEmployees) - Number(customAccessCount))
  } else if (mode === 'specific_only') {
    estimatedAllowed = Number(customAccessCount)
  } else if (mode === 'by_unit') {
    const unitIds = app.targetUnitIds ? app.targetUnitIds.split(',') : []
    if (unitIds.length > 0) {
      const [{ unitEmployees }] = await db
        .select({ unitEmployees: count() })
        .from(user)
        .innerJoin(employee, eq(user.employeeId, employee.id))
        .where(and(eq(user.isActive, true), inArray(employee.unitOrganisasiId, unitIds)))
      estimatedAllowed = Number(unitEmployees)
    } else {
      estimatedAllowed = 0
    }
  }

  const percentage = Number(totalEmployees) > 0 ? ((estimatedAllowed / Number(totalEmployees)) * 100).toFixed(1) : '0'

  return {
    appId: app.id,
    accessMode: mode,
    targetUnitIds: app.targetUnitIds ? app.targetUnitIds.split(',') : [],
    totalEmployees: Number(totalEmployees),
    customAccessCount: Number(customAccessCount),
    estimatedAllowed,
    percentage: Number(percentage),
  }
}
