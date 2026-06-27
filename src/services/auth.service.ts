// ─── Service: Auth ────────────────────────────────────────────────────────────
import crypto            from 'crypto'
import { eq, sql, and, desc, or, isNull } from 'drizzle-orm'
import { db }            from '../db'
import { user as userTable, refreshToken as refreshTokenTable, ssoToken, aplikasi, notification, userNotificationStatus } from '../db/schema'
import { hashPassword, verifyPassword } from '../utils/hash'
import { LoginInput }    from '../validators/auth.validator'
import { config }        from '../config/env'
import type { FastifyInstance } from 'fastify'

// ─── Helper: parse expiry string ke ms ────────────────────────────────────────
function parseExpiry(str: string): number {
  const unit = str.slice(-1)
  const val  = parseInt(str.slice(0, -1), 10)
  switch (unit) {
    case 's': return val * 1000
    case 'm': return val * 60 * 1000
    case 'h': return val * 3600 * 1000
    case 'd': return val * 86400 * 1000
    default:  return 7 * 86400 * 1000 // default 7 hari
  }
}

// ─── Helper: buat & simpan refresh token ──────────────────────────────────────
async function createRefreshToken(userId: string): Promise<string> {
  const raw      = crypto.randomBytes(40).toString('hex')
  const hash     = crypto.createHash('sha256').update(raw).digest('hex')
  const expMs    = parseExpiry(config.refreshToken.expiresIn)
  const expiresAt = new Date(Date.now() + expMs)

  await db.insert(refreshTokenTable).values({ userId, tokenHash: hash, expiresAt })
  return raw
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function loginService(fastify: FastifyInstance, input: LoginInput) {
  const [found] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, input.email))
    .limit(1)

  if (!found)         throw new Error('Email atau password salah')
  if (!found.isActive) throw new Error('Akun dinonaktifkan, hubungi administrator')

  const valid = await verifyPassword(input.password, found.passwordHash)
  if (!valid) throw new Error('Email atau password salah')

  // Update lastLogin
  await db.update(userTable).set({ lastLogin: new Date() }).where(eq(userTable.id, found.id))

  const accessToken  = fastify.jwt.sign({
    sub:          found.id,
    email:        found.email,
    role:         found.role,
    tokenVersion: found.tokenVersion,
  })
  const refreshTokenRaw = await createRefreshToken(found.id)

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    expiresIn:    config.jwt.expiresIn,
    user: {
      id:        found.id,
      email:     found.email,
      role:      found.role,
      isActive:  found.isActive,
      lastLogin: found.lastLogin,
    },
  }
}

// ─── Refresh Access Token ─────────────────────────────────────────────────────
// Client kirim refresh token → dapat access token baru (+ refresh token baru / rotasi)
export async function refreshTokenService(fastify: FastifyInstance, rawToken: string) {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex')

  const [found] = await db
    .select()
    .from(refreshTokenTable)
    .where(and(
      eq(refreshTokenTable.tokenHash, hash),
      eq(refreshTokenTable.isRevoked, false),
    ))
    .limit(1)

  if (!found)                    throw new Error('Refresh token tidak valid')
  if (found.expiresAt < new Date()) throw new Error('Refresh token sudah expired, silakan login ulang')

  // Ambil data user
  const [userData] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, found.userId))
    .limit(1)

  if (!userData || !userData.isActive) throw new Error('Akun tidak aktif')

  // Rotasi: revoke refresh token lama, buat yang baru
  await db
    .update(refreshTokenTable)
    .set({ isRevoked: true })
    .where(eq(refreshTokenTable.id, found.id))

  const newAccessToken   = fastify.jwt.sign({
    sub:          userData.id,
    email:        userData.email,
    role:         userData.role,
    tokenVersion: userData.tokenVersion,
  })
  const newRefreshToken = await createRefreshToken(userData.id)

  return {
    accessToken:  newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn:    config.jwt.expiresIn,
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
// Increment tokenVersion → access token lama invalid.
// Revoke SEMUA refresh token user → tidak bisa renew dari device manapun.
export async function logoutService(userId: string) {
  await Promise.all([
    db.update(userTable)
      .set({ tokenVersion: sql`${userTable.tokenVersion} + 1` })
      .where(eq(userTable.id, userId)),
    db.update(refreshTokenTable)
      .set({ isRevoked: true })
      .where(eq(refreshTokenTable.userId, userId)),
  ])
}

// ─── Get Me ───────────────────────────────────────────────────────────────────
export async function getMeService(userId: string) {
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
    .where(eq(userTable.id, userId))
    .limit(1)

  if (!found) throw new Error('User tidak ditemukan')
  return found
}

// ─── Helper: relative time formatter ──────────────────────────────────────────
function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays} hari lalu`
  if (diffHours > 0) return `${diffHours} jam lalu`
  if (diffMins > 0) return `${diffMins} menit lalu`
  return 'Baru saja'
}

// ─── Get Notifications ────────────────────────────────────────────────────────
export async function getNotificationsService(userId: string) {
  // Check if there are no notifications at all, seed with defaults
  const countRes = await db.select({ val: sql<number>`count(*)` }).from(notification)
  if (Number(countRes[0].val) === 0) {
    await db.insert(notification).values([
      {
        category: 'warning',
        title: 'Pemeliharaan Sistem Terjadwal',
        message: 'Portal SSO akan menjalani pemeliharaan rutin pada hari Sabtu pukul 23.00-01.00 WIB. Simpan pekerjaan Anda sebelum waktu tersebut.',
        userId: null,
      },
      {
        category: 'success',
        title: 'Kebijakan Keamanan 2FA Baru',
        message: 'Untuk meningkatkan keamanan data perusahaan, autentikasi dua faktor (2FA) diwajibkan untuk seluruh akun karyawan mulai bulan depan.',
        userId: null,
      }
    ])
  }

  // Query notifications for user (personal + global)
  const list = await db
    .select({
      id: notification.id,
      category: notification.category,
      title: notification.title,
      message: notification.message,
      createdAt: notification.createdAt,
      isRead: sql<boolean>`COALESCE(${userNotificationStatus.isRead}, false)`.mapWith(Boolean),
    })
    .from(notification)
    .leftJoin(
      userNotificationStatus,
      and(
        eq(userNotificationStatus.notificationId, notification.id),
        eq(userNotificationStatus.userId, userId)
      )
    )
    .where(
      and(
        or(
          eq(notification.userId, userId),
          isNull(notification.userId)
        ),
        or(
          eq(userNotificationStatus.isCleared, false),
          isNull(userNotificationStatus.isCleared)
        )
      )
    )
    .orderBy(desc(notification.createdAt))

  const formatted = list.map(item => ({
    id: item.id,
    category: item.category,
    title: item.title,
    message: item.message,
    timestamp: formatRelativeTime(item.createdAt),
    isRead: item.isRead,
  }))

  return formatted
}

export async function markNotificationAsReadService(userId: string, notificationId: string) {
  const [existing] = await db
    .select()
    .from(userNotificationStatus)
    .where(and(
      eq(userNotificationStatus.userId, userId),
      eq(userNotificationStatus.notificationId, notificationId)
    ))
    .limit(1)

  if (existing) {
    await db
      .update(userNotificationStatus)
      .set({ isRead: true, updatedAt: new Date() })
      .where(eq(userNotificationStatus.id, existing.id))
  } else {
    await db
      .insert(userNotificationStatus)
      .values({
        userId,
        notificationId,
        isRead: true,
      })
  }
}

export async function markAllNotificationsAsReadService(userId: string) {
  const list = await db
    .select({ id: notification.id })
    .from(notification)
    .where(or(
      eq(notification.userId, userId),
      isNull(notification.userId)
    ))

  for (const item of list) {
    const [existing] = await db
      .select()
      .from(userNotificationStatus)
      .where(and(
        eq(userNotificationStatus.userId, userId),
        eq(userNotificationStatus.notificationId, item.id)
      ))
      .limit(1)

    if (existing) {
      await db
        .update(userNotificationStatus)
        .set({ isRead: true, updatedAt: new Date() })
        .where(eq(userNotificationStatus.id, existing.id))
    } else {
      await db
        .insert(userNotificationStatus)
        .values({
          userId,
          notificationId: item.id,
          isRead: true,
        })
    }
  }
}

export async function clearAllNotificationsService(userId: string) {
  const list = await db
    .select({ id: notification.id })
    .from(notification)
    .where(or(
      eq(notification.userId, userId),
      isNull(notification.userId)
    ))

  for (const item of list) {
    const [existing] = await db
      .select()
      .from(userNotificationStatus)
      .where(and(
        eq(userNotificationStatus.userId, userId),
        eq(userNotificationStatus.notificationId, item.id)
      ))
      .limit(1)

    if (existing) {
      await db
        .update(userNotificationStatus)
        .set({ isCleared: true, updatedAt: new Date() })
        .where(eq(userNotificationStatus.id, existing.id))
    } else {
      await db
        .insert(userNotificationStatus)
        .values({
          userId,
          notificationId: item.id,
          isRead: true,
          isCleared: true,
        })
    }
  }
}
