// ─── Service: SSO ─────────────────────────────────────────────────────────────
import crypto           from 'crypto'
import { eq, and }      from 'drizzle-orm'
import { db }           from '../db'
import { ssoToken, aplikasi, user as userTable, appUserAccess } from '../db/schema'
import { config }       from '../config/env'

/**
 * Generate SSO token untuk user yang klik aplikasi SSO di portal.
 * Token berlaku hanya 5 menit (dari SSO_TOKEN_EXPIRES_IN di .env).
 */
export async function generateSSOTokenService(userId: string, appId: string) {
  // Cek aplikasi ada & bertipe SSO
  const [app] = await db
    .select({ id: aplikasi.id, authMode: aplikasi.authMode, url: aplikasi.url, nama: aplikasi.nama })
    .from(aplikasi)
    .where(and(eq(aplikasi.id, appId), eq(aplikasi.isActive, true)))
    .limit(1)

  if (!app) throw new Error('Aplikasi tidak ditemukan atau tidak aktif')
  if (app.authMode !== 'sso') throw new Error('Aplikasi ini tidak menggunakan mode SSO')

  // Cek user memiliki akses ke aplikasi ini
  const [access] = await db
    .select({ id: appUserAccess.id })
    .from(appUserAccess)
    .where(and(eq(appUserAccess.userId, userId), eq(appUserAccess.appId, appId)))
    .limit(1)

  if (!access) throw new Error('Kamu tidak memiliki akses ke aplikasi ini')

  // Parse expiry (misal '5m' → 5 * 60000 ms)
  const expMs = parseExpiry(config.sso.tokenExpiresIn)
  const expiresAt = new Date(Date.now() + expMs)

  // Generate token random & simpan hash-nya
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  await db.insert(ssoToken).values({
    userId,
    appId,
    tokenHash,
    expiresAt,
  })

  return { token: rawToken, expiresAt, redirectUrl: app.url }
}

/**
 * Verifikasi SSO token dari aplikasi client.
 * Kembalikan data user jika valid.
 */
export async function verifySSOTokenService(rawToken: string, appId: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  const [found] = await db
    .select()
    .from(ssoToken)
    .where(and(
      eq(ssoToken.tokenHash, tokenHash),
      eq(ssoToken.appId, appId),
      eq(ssoToken.isRevoked, false),
    ))
    .limit(1)

  if (!found) throw new Error('Token tidak valid')
  if (found.expiresAt < new Date()) throw new Error('Token sudah expired')

  // Revoke token (satu kali pakai)
  await db
    .update(ssoToken)
    .set({ isRevoked: true })
    .where(eq(ssoToken.id, found.id))

  // Ambil data user
  const [userData] = await db
    .select({
      id:        userTable.id,
      email:     userTable.email,
      role:      userTable.role,
      isActive:  userTable.isActive,
      employeeId:userTable.employeeId,
    })
    .from(userTable)
    .where(eq(userTable.id, found.userId))
    .limit(1)

  if (!userData || !userData.isActive) throw new Error('User tidak aktif')

  return userData
}

// Helper: parse expiry string (e.g. '5m', '1h', '30s') → milliseconds
function parseExpiry(str: string): number {
  const unit = str.slice(-1)
  const val  = parseInt(str.slice(0, -1), 10)
  switch (unit) {
    case 's': return val * 1000
    case 'm': return val * 60 * 1000
    case 'h': return val * 3600 * 1000
    default:  return 5 * 60 * 1000 // default 5 menit
  }
}
