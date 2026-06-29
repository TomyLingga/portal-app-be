// ─── Service: User ────────────────────────────────────────────────────────────
import { eq, ilike, and, count, SQL } from 'drizzle-orm'
import { db }              from '../db'
import { user as userTable, appUserAccess, aplikasi, employee, userPasskey } from '../db/schema'
import { hashPassword }    from '../utils/hash'
import { getPaginationParams, buildMeta } from '../utils/pagination'
import type { CreateUserInput, UpdateUserInput, ListUserQuery } from '../validators/user.validator'

export async function listUsersService(query: ListUserQuery) {
  const { page, limit, offset } = getPaginationParams(query)

  const conditions: SQL[] = []
  if (query.search) {
    conditions.push(ilike(userTable.email, `%${query.search}%`))
  }
  if (query.role) {
    conditions.push(eq(userTable.role, query.role))
  }
  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(userTable).where(where)

  const rows = await db
    .select({
      id:          userTable.id,
      email:       userTable.email,
      role:        userTable.role,
      isActive:    userTable.isActive,
      lastLogin:   userTable.lastLogin,
      employeeId:  userTable.employeeId,
      createdAt:   userTable.createdAt,
      totpEnabled: userTable.totpEnabled,
      passkeyCount: count(userPasskey.id),
    })
    .from(userTable)
    .leftJoin(userPasskey, eq(userTable.id, userPasskey.userId))
    .where(where)
    .groupBy(userTable.id)
    .limit(limit)
    .offset(offset)
    .orderBy(userTable.createdAt)

  return { rows, meta: buildMeta(page, limit, Number(total)) }
}

export async function getUserByIdService(id: string) {
  const [found] = await db
    .select({
      id:         userTable.id,
      email:      userTable.email,
      role:       userTable.role,
      isActive:   userTable.isActive,
      lastLogin:  userTable.lastLogin,
      employeeId: userTable.employeeId,
      createdAt:  userTable.createdAt,
    })
    .from(userTable)
    .where(eq(userTable.id, id))
    .limit(1)

  if (!found) throw new Error('User tidak ditemukan')
  return found
}

export async function createUserService(input: CreateUserInput) {
  // Cek email duplikat
  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, input.email))
    .limit(1)

  if (existing) throw new Error('Email sudah digunakan')

  const passwordHash = await hashPassword(input.password)
  const [created] = await db
    .insert(userTable)
    .values({
      email:        input.email,
      passwordHash,
      role:         input.role,
      isActive:     input.isActive,
      employeeId:   input.employeeId ?? null,
    })
    .returning({
      id:         userTable.id,
      email:      userTable.email,
      role:       userTable.role,
      isActive:   userTable.isActive,
      employeeId: userTable.employeeId,
      createdAt:  userTable.createdAt,
    })

  return created
}

export async function updateUserService(id: string, input: UpdateUserInput) {
  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, id))
    .limit(1)

  if (!existing) throw new Error('User tidak ditemukan')

  const updateData: Partial<typeof userTable.$inferInsert> = {}
  if (input.email      !== undefined) updateData.email      = input.email
  if (input.role       !== undefined) updateData.role       = input.role
  if (input.isActive   !== undefined) updateData.isActive   = input.isActive
  if (input.employeeId !== undefined) updateData.employeeId = input.employeeId ?? null
  if (input.password) {
    updateData.passwordHash = await hashPassword(input.password)
  }
  updateData.updatedAt = new Date()

  const [updated] = await db
    .update(userTable)
    .set(updateData)
    .where(eq(userTable.id, id))
    .returning({
      id:         userTable.id,
      email:      userTable.email,
      role:       userTable.role,
      isActive:   userTable.isActive,
      employeeId: userTable.employeeId,
      updatedAt:  userTable.updatedAt,
    })

  return updated
}

export async function deleteUserService(id: string) {
  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, id))
    .limit(1)

  if (!existing) throw new Error('User tidak ditemukan')

  await db.delete(userTable).where(eq(userTable.id, id))
}

export async function grantAppService(userId: string, appId: string, grantedById: string) {
  // Cek apakah sudah ada akses
  const [existing] = await db
    .select({ id: appUserAccess.id })
    .from(appUserAccess)
    .where(and(eq(appUserAccess.userId, userId), eq(appUserAccess.appId, appId)))
    .limit(1)

  if (existing) {
    // Jika sudah ada akses, update saja grantedById-nya
    const [updated] = await db
      .update(appUserAccess)
      .set({ grantedById })
      .where(eq(appUserAccess.id, existing.id))
      .returning()
    return updated
  }

  const [created] = await db
    .insert(appUserAccess)
    .values({ userId, appId, grantedById })
    .returning()

  return created
}

export async function revokeAppService(userId: string, appId: string) {
  const [existing] = await db
    .select({ id: appUserAccess.id })
    .from(appUserAccess)
    .where(and(eq(appUserAccess.userId, userId), eq(appUserAccess.appId, appId)))
    .limit(1)

  if (!existing) throw new Error('Akses tidak ditemukan')

  await db
    .delete(appUserAccess)
    .where(and(eq(appUserAccess.userId, userId), eq(appUserAccess.appId, appId)))
}

export async function getUserAppsService(userId: string) {
  return db
    .select({
      accessId:  appUserAccess.id,
      grantedAt: appUserAccess.grantedAt,
      app: {
        id:       aplikasi.id,
        nama:     aplikasi.nama,
        url:      aplikasi.url,
        authMode: aplikasi.authMode,
        icon:     aplikasi.icon,
        urutan:   aplikasi.urutan,
      },
    })
    .from(appUserAccess)
    .innerJoin(aplikasi, eq(appUserAccess.appId, aplikasi.id))
    .where(and(eq(appUserAccess.userId, userId), eq(aplikasi.isActive, true)))
    .orderBy(aplikasi.urutan)
}

export async function listAllPasskeysService() {
  return db
    .select({
      id: userPasskey.id,
      name: userPasskey.name,
      counter: userPasskey.counter,
      createdAt: userPasskey.createdAt,
      user: {
        id: userTable.id,
        email: userTable.email,
      },
      employee: {
        id: employee.id,
        nama: employee.nama,
        jabatan: employee.jabatan,
      }
    })
    .from(userPasskey)
    .innerJoin(userTable, eq(userPasskey.userId, userTable.id))
    .leftJoin(employee, eq(userTable.employeeId, employee.id))
    .orderBy(userPasskey.createdAt)
}

export async function deletePasskeyAdminService(id: string) {
  const [deleted] = await db
    .delete(userPasskey)
    .where(eq(userPasskey.id, id))
    .returning()
  if (!deleted) throw new Error('Passkey tidak ditemukan')
  return deleted
}

export async function deleteAllUserPasskeysService(userId: string) {
  const deleted = await db
    .delete(userPasskey)
    .where(eq(userPasskey.userId, userId))
    .returning()
  return deleted
}

export async function listUsers2faService() {
  return db
    .select({
      id: userTable.id,
      email: userTable.email,
      role: userTable.role,
      totpEnabled: userTable.totpEnabled,
      employee: {
        id: employee.id,
        nama: employee.nama,
        jabatan: employee.jabatan,
      }
    })
    .from(userTable)
    .leftJoin(employee, eq(userTable.employeeId, employee.id))
    .orderBy(userTable.email)
}

export async function disableUser2faService(userId: string) {
  const [updated] = await db
    .update(userTable)
    .set({
      totpEnabled: false,
      totpSecret: null
    })
    .where(eq(userTable.id, userId))
    .returning()
  if (!updated) throw new Error('User tidak ditemukan')
  return updated
}
