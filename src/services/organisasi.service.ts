// ─── Service: Organisasi (Bagian & Sub Bagian) ────────────────────────────────
import { eq, ilike, and, count, SQL } from 'drizzle-orm'
import { db }          from '../db'
import { bagian, subBagian } from '../db/schema'
import { getPaginationParams, buildMeta } from '../utils/pagination'
import type {
  CreateBagianInput, UpdateBagianInput,
  CreateSubBagianInput, UpdateSubBagianInput,
  ListQuery,
} from '../validators/organisasi.validator'

// ─── Bagian ───────────────────────────────────────────────────────────────────
export async function listBagianService(query: ListQuery) {
  const { page, limit, offset } = getPaginationParams(query)
  const conditions: SQL[] = []
  if (query.search)              conditions.push(ilike(bagian.nama, `%${query.search}%`))
  if (query.isActive !== undefined) conditions.push(eq(bagian.isActive, query.isActive))
  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(bagian).where(where)
  const rows = await db.select().from(bagian).where(where).limit(limit).offset(offset).orderBy(bagian.nama)

  return { rows, meta: buildMeta(page, limit, Number(total)) }
}

export async function getBagianByIdService(id: string) {
  const [found] = await db.select().from(bagian).where(eq(bagian.id, id)).limit(1)
  if (!found) throw new Error('Bagian tidak ditemukan')
  return found
}

export async function createBagianService(input: CreateBagianInput) {
  const [dup] = await db.select({ id: bagian.id }).from(bagian).where(eq(bagian.kode, input.kode)).limit(1)
  if (dup) throw new Error('Kode bagian sudah digunakan')

  const [created] = await db.insert(bagian).values(input).returning()
  return created
}

export async function updateBagianService(id: string, input: UpdateBagianInput) {
  const [existing] = await db.select({ id: bagian.id }).from(bagian).where(eq(bagian.id, id)).limit(1)
  if (!existing) throw new Error('Bagian tidak ditemukan')

  const [updated] = await db.update(bagian).set(input).where(eq(bagian.id, id)).returning()
  return updated
}

export async function deleteBagianService(id: string) {
  const [existing] = await db.select({ id: bagian.id }).from(bagian).where(eq(bagian.id, id)).limit(1)
  if (!existing) throw new Error('Bagian tidak ditemukan')
  await db.delete(bagian).where(eq(bagian.id, id))
}

// ─── Sub Bagian ───────────────────────────────────────────────────────────────
export async function listSubBagianService(query: ListQuery & { bagianId?: string }) {
  const { page, limit, offset } = getPaginationParams(query)
  const conditions: SQL[] = []
  if (query.search)              conditions.push(ilike(subBagian.nama, `%${query.search}%`))
  if (query.isActive !== undefined) conditions.push(eq(subBagian.isActive, query.isActive))
  if (query.bagianId)            conditions.push(eq(subBagian.bagianId, query.bagianId))
  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(subBagian).where(where)
  const rows = await db.select().from(subBagian).where(where).limit(limit).offset(offset).orderBy(subBagian.nama)

  return { rows, meta: buildMeta(page, limit, Number(total)) }
}

export async function getSubBagianByIdService(id: string) {
  const [found] = await db.select().from(subBagian).where(eq(subBagian.id, id)).limit(1)
  if (!found) throw new Error('Sub bagian tidak ditemukan')
  return found
}

export async function createSubBagianService(input: CreateSubBagianInput) {
  const [dup] = await db.select({ id: subBagian.id }).from(subBagian).where(eq(subBagian.kode, input.kode)).limit(1)
  if (dup) throw new Error('Kode sub bagian sudah digunakan')

  const [created] = await db.insert(subBagian).values(input).returning()
  return created
}

export async function updateSubBagianService(id: string, input: UpdateSubBagianInput) {
  const [existing] = await db.select({ id: subBagian.id }).from(subBagian).where(eq(subBagian.id, id)).limit(1)
  if (!existing) throw new Error('Sub bagian tidak ditemukan')

  const [updated] = await db.update(subBagian).set(input).where(eq(subBagian.id, id)).returning()
  return updated
}

export async function deleteSubBagianService(id: string) {
  const [existing] = await db.select({ id: subBagian.id }).from(subBagian).where(eq(subBagian.id, id)).limit(1)
  if (!existing) throw new Error('Sub bagian tidak ditemukan')
  await db.delete(subBagian).where(eq(subBagian.id, id))
}
