// ─── Service: Aplikasi ────────────────────────────────────────────────────────
import { eq, ilike, and, count, SQL } from 'drizzle-orm'
import { db }        from '../db'
import { aplikasi, notification }  from '../db/schema'
import { getPaginationParams, buildMeta } from '../utils/pagination'
import type { CreateAplikasiInput, UpdateAplikasiInput, ListAplikasiQuery } from '../validators/aplikasi.validator'
import { deleteFile, buildFileUrl } from '../utils/file'

export async function listAplikasiService(query: ListAplikasiQuery) {
  const { page, limit, offset } = getPaginationParams(query)
  const conditions: SQL[] = []
  if (query.search)              conditions.push(ilike(aplikasi.nama, `%${query.search}%`))
  if (query.authMode)            conditions.push(eq(aplikasi.authMode, query.authMode))
  if (query.isActive !== undefined) conditions.push(eq(aplikasi.isActive, query.isActive))
  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(aplikasi).where(where)
  const rows = await db
    .select()
    .from(aplikasi)
    .where(where)
    .limit(limit)
    .offset(offset)
    .orderBy(aplikasi.urutan, aplikasi.nama)

  return { rows, meta: buildMeta(page, limit, Number(total)) }
}

export async function getAplikasiByIdService(id: string) {
  const [found] = await db.select().from(aplikasi).where(eq(aplikasi.id, id)).limit(1)
  if (!found) throw new Error('Aplikasi tidak ditemukan')
  return found
}

export async function createAplikasiService(input: CreateAplikasiInput) {
  const [created] = await db.insert(aplikasi).values(input).returning()

  // Log notification to database
  try {
    await db.insert(notification).values({
      category: 'info',
      title: 'Aplikasi Baru Terintegrasi',
      message: `Aplikasi "${created.nama}" kini telah terintegrasi di Portal SSO PT INL dan siap diakses.`,
      userId: null,
    })
  } catch (err) {
    // Ignore notification log error
  }

  return created
}

export async function updateAplikasiService(id: string, input: UpdateAplikasiInput) {
  const [existing] = await db.select({ id: aplikasi.id }).from(aplikasi).where(eq(aplikasi.id, id)).limit(1)
  if (!existing) throw new Error('Aplikasi tidak ditemukan')

  const [updated] = await db
    .update(aplikasi)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(aplikasi.id, id))
    .returning()

  return updated
}

export async function deleteAplikasiService(id: string) {
  const [existing] = await db.select({ id: aplikasi.id, icon: aplikasi.icon }).from(aplikasi).where(eq(aplikasi.id, id)).limit(1)
  if (!existing) throw new Error('Aplikasi tidak ditemukan')

  if (existing.icon && (existing.icon.includes('/') || existing.icon.includes('.'))) {
    deleteFile(existing.icon)
  }

  await db.delete(aplikasi).where(eq(aplikasi.id, id))
}

export async function updateAplikasiIconService(id: string, filename: string) {
  const [existing] = await db
    .select({ id: aplikasi.id, icon: aplikasi.icon })
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
    .returning({ icon: aplikasi.icon })

  return { iconUrl: buildFileUrl(updated.icon) }
}
