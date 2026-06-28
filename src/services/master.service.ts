// ─── Service: Master (Master Data & Stats) ──────────────────────────────────────
import { db } from '../db'
import { user as userTable, aplikasi, activityLog } from '../db/schema'
import { eq, and, gte, lte, desc, or, ilike, count } from 'drizzle-orm'

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

  const logs = await db
    .select({
      id: activityLog.id,
      appId: activityLog.appId,
      issuedAt: activityLog.createdAt,
      userId: activityLog.userId,
    })
    .from(activityLog)
    .where(and(
      eq(activityLog.action, 'access_app'),
      gte(activityLog.createdAt, startDate),
      lte(activityLog.createdAt, endDate)
    ))

  const tokens = logs.filter(l => l.appId !== null) as { id: string; appId: string; issuedAt: Date; userId: string }[]

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

  // 3. Recent activity logs (comprehensive audit logs)
  const logsList = await db
    .select({
      email: userTable.email,
      action: activityLog.action,
      details: activityLog.details,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .innerJoin(userTable, eq(activityLog.userId, userTable.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(10)

  const finalActivities = logsList.map(act => {
    const diffMs = Date.now() - act.createdAt.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    let relativeTime = 'Baru saja'
    if (diffDays > 0) relativeTime = `${diffDays} hari lalu`
    else if (diffHours > 0) relativeTime = `${diffHours} jam lalu`
    else if (diffMins > 0) relativeTime = `${diffMins} mnt lalu`

    let type = 'info'
    let text = act.details
    if (act.action === 'login') {
      type = 'login'
      text = `User "${act.email}" masuk portal`
    } else if (act.action === 'logout') {
      type = 'logout'
      text = `User "${act.email}" keluar portal`
    } else if (act.action === 'access_app') {
      type = 'access'
      text = `User "${act.email}" ${act.details.toLowerCase()}`
    } else if (act.action === 'update_profile_photo') {
      type = 'profile'
      text = `User "${act.email}" mengubah foto profil`
    }

    return {
      type,
      text,
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

export async function getPaginatedLogsService(params: {
  page: number
  limit: number
  search?: string
  startDate?: string
  endDate?: string
}) {
  const page = Math.max(1, params.page)
  const limit = Math.max(1, params.limit)
  const offset = (page - 1) * limit

  const conditions: any[] = []

  if (params.startDate) {
    conditions.push(gte(activityLog.createdAt, new Date(params.startDate)))
  }
  if (params.endDate) {
    conditions.push(lte(activityLog.createdAt, new Date(params.endDate)))
  }

  if (params.search) {
    conditions.push(
      or(
        ilike(userTable.email, `%${params.search}%`),
        ilike(activityLog.details, `%${params.search}%`),
        ilike(activityLog.action, `%${params.search}%`)
      )
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  let query = db
    .select({
      id: activityLog.id,
      email: userTable.email,
      action: activityLog.action,
      details: activityLog.details,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .innerJoin(userTable, eq(activityLog.userId, userTable.id))

  const countQuery = db
    .select({ total: count() })
    .from(activityLog)
    .innerJoin(userTable, eq(activityLog.userId, userTable.id))

  const finalQuery = whereClause ? query.where(whereClause) : query
  const finalCountQuery = whereClause ? countQuery.where(whereClause) : countQuery

  const data = await finalQuery
    .orderBy(desc(activityLog.createdAt))
    .limit(limit)
    .offset(offset)

  const [{ total }] = await finalCountQuery

  return {
    data,
    meta: {
      page,
      limit,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / limit),
    }
  }
}
