// ─── Service: Master (Master Data & Stats) ──────────────────────────────────────
import { db } from '../db'
import { user as userTable, aplikasi, ssoToken } from '../db/schema'
import { eq, and, gte, lte, desc } from 'drizzle-orm'

export async function getMasterStatsService(currentYear: number, currentMonth: number) {
  // 1. Counts
  const allUsers = await db.select().from(userTable)
  const allApps = await db.select().from(aplikasi).where(eq(aplikasi.isActive, true))

  const appsCount = allApps.length
  const usersCount = allUsers.length
  const activeCount = allUsers.filter(u => u.isActive).length
  const suspendedCount = allUsers.filter(u => !u.isActive).length

  // 2. Daily logs (SSO Token activities)
  const startDate = new Date(currentYear, currentMonth - 1, 1)
  const endDate = new Date(currentYear, currentMonth, 1)

  const tokens = await db
    .select({
      id: ssoToken.id,
      appId: ssoToken.appId,
      issuedAt: ssoToken.issuedAt,
      userId: ssoToken.userId,
    })
    .from(ssoToken)
    .where(and(
      gte(ssoToken.issuedAt, startDate),
      lte(ssoToken.issuedAt, endDate)
    ))

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
  const dailyLogs: any[] = []

  const appsList = allApps.map((app) => ({
    id: app.id,
    name: app.nama,
    color: app.warna
  }))

  for (let day = 1; day <= daysInMonth; day++) {
    const label = day.toString().padStart(2, '0')
    const key = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${label}`
    const appsRecord: Record<string, number> = {}
    appsList.forEach(app => {
      appsRecord[app.id] = 0
    })

    dailyLogs.push({
      key,
      label,
      day,
      apps: appsRecord,
      total: 0
    })
  }

  tokens.forEach(tok => {
    const date = new Date(tok.issuedAt)
    const day = date.getDate()
    const logEntry = dailyLogs[day - 1]
    if (logEntry && logEntry.apps[tok.appId] !== undefined) {
      logEntry.apps[tok.appId]++
      logEntry.total++
    }
  })

  // 3. Recent activity logs (users registration + app access)
  const activities: any[] = []

  // Add recent user registrations
  const recentUsers = await db
    .select({ email: userTable.email, createdAt: userTable.createdAt })
    .from(userTable)
    .orderBy(desc(userTable.createdAt))
    .limit(5)

  recentUsers.forEach(u => {
    activities.push({
      type: 'user_reg',
      text: `User "${u.email}" bergabung ke portal`,
      time: u.createdAt,
    })
  })

  // Add recent app access tokens
  const recentTokens = await db
    .select({
      email: userTable.email,
      appName: aplikasi.nama,
      issuedAt: ssoToken.issuedAt
    })
    .from(ssoToken)
    .innerJoin(userTable, eq(ssoToken.userId, userTable.id))
    .innerJoin(aplikasi, eq(ssoToken.appId, aplikasi.id))
    .orderBy(desc(ssoToken.issuedAt))
    .limit(5)

  recentTokens.forEach(t => {
    activities.push({
      type: 'app_access',
      text: `User "${t.email}" mengakses aplikasi "${t.appName}"`,
      time: t.issuedAt,
    })
  })

  // Sort activities by time desc
  activities.sort((a, b) => b.time.getTime() - a.time.getTime())
  const finalActivities = activities.slice(0, 6).map(act => {
    const diffMs = Date.now() - act.time.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    let relativeTime = 'Baru saja'
    if (diffDays > 0) relativeTime = `${diffDays} hari lalu`
    else if (diffHours > 0) relativeTime = `${diffHours} jam lalu`
    else if (diffMins > 0) relativeTime = `${diffMins} mnt lalu`

    return {
      type: act.type,
      text: act.text,
      time: relativeTime
    }
  })

  return {
    appsCount,
    usersCount,
    activeCount,
    suspendedCount,
    dailyLogs,
    appsList,
    recentActivities: finalActivities
  }
}
