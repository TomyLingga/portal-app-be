// ─── Service: User ────────────────────────────────────────────────────────────
import { eq, ilike, and, count, SQL } from 'drizzle-orm'
import { db }              from '../db'
import { user as userTable, appUserAccess, aplikasi } from '../db/schema'
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
      id:         userTable.id,
      email:      userTable.email,
      role:       userTable.role,
      isActive:   userTable.isActive,
      lastLogin:  userTable.lastLogin,
      employeeId: userTable.employeeId,
      createdAt:  userTable.createdAt,
    })
    .from(userTable)
    .where(where)
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

  if (existing) throw new Error('User sudah memiliki akses ke aplikasi ini')

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
