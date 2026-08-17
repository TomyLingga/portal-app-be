import { db } from '../db'
import { user as userTable, employee, unitOrganisasi, activityLog, aplikasi } from '../db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { buildFileUrl } from '../utils/file'

export interface UserPresence {
  userId: string
  email: string
  nama: string
  nrk?: string | null
  fotoProfil?: string | null
  role: string
  jabatan: string
  bagian: string
  appId: string
  appName: string
  currentPath: string
  pageTitle: string
  device: string
  browser: string
  ipAddress: string
  lastSeenAt: Date
  onlineSince: Date
}

export interface HeartbeatPayload {
  appId?: string
  appName?: string
  currentPath: string
  pageTitle?: string
}

// In-Memory Presence Storage (Zero DB Changes required)
const presenceStore = new Map<string, UserPresence>()

// User info cache to minimize DB queries during frequent heartbeats
interface CachedProfile {
  nama: string
  email: string
  nrk?: string | null
  fotoProfil?: string | null
  role: string
  jabatan: string
  bagian: string
  expiresAt: number
}

const profileCache = new Map<string, CachedProfile>()

// Parse user agent to readable device & browser
export function parseUserAgent(uaString: string = ''): { device: string; browser: string } {
  let device = 'Desktop'
  let browser = 'Browser'

  if (/windows/i.test(uaString)) device = 'Windows'
  else if (/macintosh|mac os/i.test(uaString)) device = 'macOS'
  else if (/android/i.test(uaString)) device = 'Android'
  else if (/iphone|ipad|ipod/i.test(uaString)) device = 'iOS'
  else if (/linux/i.test(uaString)) device = 'Linux'

  if (/edg/i.test(uaString)) browser = 'Edge'
  else if (/chrome|crios/i.test(uaString)) browser = 'Chrome'
  else if (/safari/i.test(uaString) && !/chrome/i.test(uaString)) browser = 'Safari'
  else if (/firefox|fxios/i.test(uaString)) browser = 'Firefox'
  else if (/opr|opera/i.test(uaString)) browser = 'Opera'

  return { device, browser }
}

// Clean up inactive users (> 60 seconds of no heartbeat)
function pruneExpiredPresence() {
  const now = Date.now()
  const TTL_MS = 60_000 // 60 seconds timeout
  for (const [id, item] of presenceStore.entries()) {
    if (now - item.lastSeenAt.getTime() > TTL_MS) {
      presenceStore.delete(id)
    }
  }
}

// Periodic cleanup timer
setInterval(() => {
  pruneExpiredPresence()
}, 15_000).unref()

async function getCachedOrFetchProfile(userId: string): Promise<CachedProfile> {
  const now = Date.now()
  const cached = profileCache.get(userId)
  if (cached && cached.expiresAt > now) {
    return cached
  }

  const [found] = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      role: userTable.role,
      employeeNama: employee.nama,
      employeeNrk: employee.nrk,
      employeeJabatan: employee.jabatan,
      employeeFotoProfil: employee.fotoProfil,
      unitNama: unitOrganisasi.nama,
    })
    .from(userTable)
    .leftJoin(employee, eq(userTable.employeeId, employee.id))
    .leftJoin(unitOrganisasi, eq(employee.unitOrganisasiId, unitOrganisasi.id))
    .where(eq(userTable.id, userId))
    .limit(1)

  const profile: CachedProfile = {
    email: found?.email || 'user@inl.co.id',
    nama: found?.employeeNama || found?.email?.split('@')[0] || 'Pengguna',
    nrk: found?.employeeNrk || null,
    fotoProfil: found?.employeeFotoProfil ? buildFileUrl(found.employeeFotoProfil) : null,
    role: found?.role || 'user',
    jabatan: found?.employeeJabatan || (found?.role === 'super_admin' ? 'Super Administrator' : 'Staff'),
    bagian: found?.unitNama || 'Kantor Pusat',
    expiresAt: now + 5 * 60_000, // 5 minutes cache
  }

  profileCache.set(userId, profile)
  return profile
}

async function getLatestAppAccess(userId: string): Promise<{ appId: string; appName: string } | null> {
  try {
    const [recent] = await db
      .select({
        appId: activityLog.appId,
        appName: aplikasi.nama,
        createdAt: activityLog.createdAt,
      })
      .from(activityLog)
      .leftJoin(aplikasi, eq(activityLog.appId, aplikasi.id))
      .where(and(eq(activityLog.userId, userId), eq(activityLog.action, 'access_app')))
      .orderBy(desc(activityLog.createdAt))
      .limit(1)

    if (recent && recent.appName && recent.appId) {
      return {
        appId: recent.appId,
        appName: recent.appName,
      }
    }
  } catch (err) {
    // Non-blocking
  }
  return null
}

export async function recordHeartbeatService(
  userId: string,
  payload: HeartbeatPayload,
  userAgent: string = '',
  ipAddress: string = '127.0.0.1'
): Promise<UserPresence> {
  const profile = await getCachedOrFetchProfile(userId)
  const { device, browser } = parseUserAgent(userAgent)
  const existing = presenceStore.get(userId)

  const path = payload.currentPath || '/'
  let resolvedAppId = payload.appId || 'portal'
  let resolvedAppName = payload.appName || 'Portal SSO'
  let resolvedPageTitle = payload.pageTitle || 'Beranda'

  // If path is specifically the /launch redirector page, ensure app name is populated
  if (path.includes('/launch') && resolvedAppId === 'portal') {
    const latestAccess = await getLatestAppAccess(userId)
    if (latestAccess) {
      resolvedAppId = latestAccess.appId
      resolvedAppName = latestAccess.appName
      resolvedPageTitle = `Membuka Aplikasi: ${latestAccess.appName}`
    }
  }

  const now = new Date()
  const presence: UserPresence = {
    userId,
    email: profile.email,
    nama: profile.nama,
    nrk: profile.nrk,
    fotoProfil: profile.fotoProfil,
    role: profile.role,
    jabatan: profile.jabatan,
    bagian: profile.bagian,
    appId: resolvedAppId,
    appName: resolvedAppName,
    currentPath: path,
    pageTitle: resolvedPageTitle,
    device,
    browser,
    ipAddress,
    lastSeenAt: now,
    onlineSince: existing ? existing.onlineSince : now,
  }

  presenceStore.set(userId, presence)
  return presence
}

export function removeUserPresenceService(userId: string): boolean {
  return presenceStore.delete(userId)
}

export function getLiveUsersService(filterAppId?: string): UserPresence[] {
  pruneExpiredPresence()
  const users = Array.from(presenceStore.values())
  const filtered = filterAppId && filterAppId !== 'all'
    ? users.filter(u => u.appId === filterAppId)
    : users

  return filtered.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
}

export function getLiveCountService(): number {
  pruneExpiredPresence()
  return presenceStore.size
}
