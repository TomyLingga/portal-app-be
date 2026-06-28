// ─── Service: Auth ────────────────────────────────────────────────────────────
import crypto            from 'crypto'
import { eq, sql, and, desc, or, isNull } from 'drizzle-orm'
import { db }            from '../db'
import { user as userTable, refreshToken as refreshTokenTable, ssoToken, aplikasi, activityLog, employee, userPasskey } from '../db/schema'
import { hashPassword, verifyPassword } from '../utils/hash'
import { LoginInput }    from '../validators/auth.validator'
import { config }        from '../config/env'
import { buildFileUrl }  from '../utils/file'
import { generateTOTPSecret, verifyTOTP, getTOTPKeyURI } from '../utils/totp'
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
export async function createRefreshToken(userId: string): Promise<string> {
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

  if (found.totpEnabled) {
    const totpToken = fastify.jwt.sign({
      sub:     found.id,
      purpose: 'totp_login',
    } as any, { expiresIn: '5m' })
    return {
      requiresTotp: true,
      totpToken,
    }
  }

  // Update lastLogin
  await db.update(userTable).set({ lastLogin: new Date() }).where(eq(userTable.id, found.id))

  // Log activity
  try {
    await db.insert(activityLog).values({
      userId: found.id,
      action: 'login',
      details: 'Login ke portal dengan password',
    })
  } catch (err) {
    // Ignore logging error
  }

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
  try {
    await db.insert(activityLog).values({
      userId,
      action: 'logout',
      details: 'Logout dari portal',
    })
  } catch (err) {
    // Ignore logging error
  }
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
      totpEnabled: userTable.totpEnabled,
      createdAt:  userTable.createdAt,
      employee: {
        id:           employee.id,
        nama:         employee.nama,
        nrk:          employee.nrk,
        nik:          employee.nik,
        jabatan:      employee.jabatan,
        jenisKelamin: employee.jenisKelamin,
        nomorHp:      employee.nomorHp,
        alamat:       employee.alamat,
        fotoProfil:   employee.fotoProfil,
      }
    })
    .from(userTable)
    .leftJoin(employee, eq(userTable.employeeId, employee.id))
    .where(eq(userTable.id, userId))
    .limit(1)

  if (!found) throw new Error('User tidak ditemukan')
  
  return {
    ...found,
    employee: found.employee?.id ? {
      ...found.employee,
      fotoProfil: buildFileUrl(found.employee.fotoProfil),
    } : null,
  }
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




export async function verifyTotpLoginService(
  fastify: FastifyInstance,
  totpToken: string,
  code: string
) {
  let decoded: any
  try {
    decoded = fastify.jwt.verify(totpToken)
  } catch (err) {
    throw new Error('Token 2FA kadaluwarsa atau tidak valid')
  }

  if (decoded.purpose !== 'totp_login') {
    throw new Error('Tantangan tidak valid')
  }

  const userId = decoded.sub

  const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
  if (!user) throw new Error('User tidak ditemukan')
  if (!user.isActive) throw new Error('Akun dinonaktifkan')
  if (!user.totpSecret) throw new Error('Authenticator belum dikonfigurasi')

  const valid = verifyTOTP(user.totpSecret, code)
  if (!valid) {
    throw new Error('Kode Authenticator salah atau kadaluwarsa')
  }

  // Update lastLogin
  await db.update(userTable).set({ lastLogin: new Date() }).where(eq(userTable.id, user.id))

  // Log activity
  try {
    await db.insert(activityLog).values({
      userId: user.id,
      action: 'login',
      details: 'Login ke portal dengan verifikasi TOTP (2FA)',
    })
  } catch (err) {
    // Ignore logging error
  }

  const accessToken  = fastify.jwt.sign({
    sub:          user.id,
    email:        user.email,
    role:         user.role,
    tokenVersion: user.tokenVersion,
  })
  const refreshTokenRaw = await createRefreshToken(user.id)

  return {
    accessToken,
    refreshToken: refreshTokenRaw,
    expiresIn:    config.jwt.expiresIn,
    user: {
      id:        user.id,
      email:     user.email,
      role:      user.role,
      isActive:  user.isActive,
      lastLogin: user.lastLogin,
    },
  }
}

export async function setupTotpService(userId: string) {
  const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
  if (!user) throw new Error('User tidak ditemukan')
  if (user.role === 'super_admin') throw new Error('Dua-Factor Authentication (2FA) tidak diperbolehkan untuk Admin')

  const secret = generateTOTPSecret()
  const keyURI = getTOTPKeyURI(user.email, secret)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(keyURI)}`

  return {
    secret,
    qrCodeUrl
  }
}

export async function enableTotpService(userId: string, secret: string, code: string) {
  const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
  if (!user) throw new Error('User tidak ditemukan')
  if (user.role === 'super_admin') throw new Error('Dua-Factor Authentication (2FA) tidak diperbolehkan untuk Admin')

  const valid = verifyTOTP(secret, code)
  if (!valid) throw new Error('Kode verifikasi salah atau kadaluwarsa')

  await db
    .update(userTable)
    .set({
      totpSecret: secret,
      totpEnabled: true
    })
    .where(eq(userTable.id, userId))

  return { success: true }
}

export async function disableTotpService(userId: string, password?: string) {
  const [user] = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
  if (!user) throw new Error('User tidak ditemukan')

  if (password) {
    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) throw new Error('Password salah')
  }

  await db
    .update(userTable)
    .set({
      totpSecret: null,
      totpEnabled: false
    })
    .where(eq(userTable.id, userId))

  return { success: true }
}
