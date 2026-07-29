import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import { portalNotification, user } from '../db/schema'
import { buildMeta, getPaginationParams } from '../utils/pagination'
import { httpError } from '../utils/httpError'

export interface CreateNotificationInput {
  type: string
  title: string
  message: string
  entityType?: string | null
  entityId?: string | null
}

export async function notifyEmployees(employeeIds: string[], input: CreateNotificationInput) {
  const ids = [...new Set(employeeIds)]
  if (!ids.length) return []
  const recipients = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.employeeId, ids), eq(user.isActive, true)))
  if (!recipients.length) return []
  return db.insert(portalNotification).values(recipients.map(recipient => ({
    userId: recipient.id,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
  }))).returning()
}

export async function listNotificationsService(userId: string, query: { page?: number; limit?: number; unreadOnly?: boolean }) {
  const { page, limit, offset } = getPaginationParams(query)
  const where = query.unreadOnly
    ? and(eq(portalNotification.userId, userId), eq(portalNotification.isRead, false))
    : eq(portalNotification.userId, userId)
  const [{ total }] = await db.select({ total: count() }).from(portalNotification).where(where)
  const rows = await db.select().from(portalNotification).where(where)
    .orderBy(desc(portalNotification.createdAt)).limit(limit).offset(offset)
  const [{ unread }] = await db.select({ unread: count() }).from(portalNotification)
    .where(and(eq(portalNotification.userId, userId), eq(portalNotification.isRead, false)))
  return { rows, meta: { ...buildMeta(page, limit, Number(total)), unread: Number(unread) } }
}

export async function markNotificationReadService(userId: string, id: string) {
  const [updated] = await db.update(portalNotification)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(portalNotification.id, id), eq(portalNotification.userId, userId)))
    .returning()
  if (!updated) throw httpError(404, 'Notifikasi tidak ditemukan')
  return updated
}

export async function markAllNotificationsReadService(userId: string) {
  const rows = await db.update(portalNotification)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(portalNotification.userId, userId), eq(portalNotification.isRead, false)))
    .returning({ id: portalNotification.id })
  return { updated: rows.length }
}

export async function deleteNotificationService(userId: string, id: string) {
  const [deleted] = await db.delete(portalNotification)
    .where(and(eq(portalNotification.id, id), eq(portalNotification.userId, userId)))
    .returning()
  if (!deleted) throw httpError(404, 'Notifikasi tidak ditemukan')
  return deleted
}

export async function clearAllNotificationsService(userId: string) {
  const rows = await db.delete(portalNotification)
    .where(eq(portalNotification.userId, userId))
    .returning({ id: portalNotification.id })
  return { deleted: rows.length }
}
