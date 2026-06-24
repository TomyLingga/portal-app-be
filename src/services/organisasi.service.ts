// ─── Service: Organisasi (Unit Organisasi — hierarki) ──────────────────────────
import { eq, ilike, and, count, SQL } from 'drizzle-orm'
import { db }              from '../db'
import { unitOrganisasi }  from '../db/schema'
import { getPaginationParams, buildMeta } from '../utils/pagination'
import type {
  CreateUnitOrganisasiInput, UpdateUnitOrganisasiInput,
  ListUnitOrganisasiQuery,
} from '../validators/organisasi.validator'

export async function listUnitOrganisasiService(query: ListUnitOrganisasiQuery) {
  const { page, limit, offset } = getPaginationParams(query)
  const conditions: SQL[] = []
  if (query.search)                 conditions.push(ilike(unitOrganisasi.nama, `%${query.search}%`))
  if (query.tipe)                   conditions.push(eq(unitOrganisasi.tipe, query.tipe))
  if (query.parentId)               conditions.push(eq(unitOrganisasi.parentId, query.parentId))
  if (query.isActive !== undefined) conditions.push(eq(unitOrganisasi.isActive, query.isActive))
  const where = conditions.length ? and(...conditions) : undefined

  const [{ total }] = await db.select({ total: count() }).from(unitOrganisasi).where(where)
  const rows = await db.select().from(unitOrganisasi).where(where).limit(limit).offset(offset).orderBy(unitOrganisasi.tipe, unitOrganisasi.nama)

  return { rows, meta: buildMeta(page, limit, Number(total)) }
}

export async function getUnitOrganisasiByIdService(id: string) {
  const [found] = await db.select().from(unitOrganisasi).where(eq(unitOrganisasi.id, id)).limit(1)
  if (!found) throw new Error('Unit organisasi tidak ditemukan')
  return found
}

/**
 * Get children (satu level di bawah) dari unit tertentu.
 * Contoh: parentId = SEVP → return semua Bagian di bawah SEVP.
 */
export async function getChildrenService(parentId: string) {
  return db
    .select()
    .from(unitOrganisasi)
    .where(and(eq(unitOrganisasi.parentId, parentId), eq(unitOrganisasi.isActive, true)))
    .orderBy(unitOrganisasi.nama)
}

/**
 * Get full tree dari root (parentId = null) ke bawah.
 * Recursive query via application-level (bukan CTE).
 * Cocok untuk render org chart di frontend.
 */
export async function getTreeService() {
  const all = await db
    .select()
    .from(unitOrganisasi)
    .where(eq(unitOrganisasi.isActive, true))
    .orderBy(unitOrganisasi.tipe, unitOrganisasi.nama)

  type UnitNode = (typeof all)[0] & { children: UnitNode[] }

  const map = new Map<string, UnitNode>()
  const roots: UnitNode[] = []

  // Pass 1: create all nodes
  for (const row of all) {
    map.set(row.id, { ...row, children: [] })
  }

  // Pass 2: build tree
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

export async function createUnitOrganisasiService(input: CreateUnitOrganisasiInput) {
  const [dup] = await db.select({ id: unitOrganisasi.id }).from(unitOrganisasi).where(eq(unitOrganisasi.kode, input.kode)).limit(1)
  if (dup) throw new Error('Kode unit organisasi sudah digunakan')

  // Validasi parent exists jika disertakan
  if (input.parentId) {
    const [parent] = await db.select({ id: unitOrganisasi.id }).from(unitOrganisasi).where(eq(unitOrganisasi.id, input.parentId)).limit(1)
    if (!parent) throw new Error('Parent unit organisasi tidak ditemukan')
  }

  const [created] = await db.insert(unitOrganisasi).values({
    ...input,
    parentId: input.parentId ?? null,
  }).returning()
  return created
}

export async function updateUnitOrganisasiService(id: string, input: UpdateUnitOrganisasiInput) {
  const [existing] = await db.select({ id: unitOrganisasi.id }).from(unitOrganisasi).where(eq(unitOrganisasi.id, id)).limit(1)
  if (!existing) throw new Error('Unit organisasi tidak ditemukan')

  // Jangan bisa jadi parent diri sendiri
  if (input.parentId === id) throw new Error('Unit tidak bisa menjadi parent dari dirinya sendiri')

  const [updated] = await db.update(unitOrganisasi).set(input).where(eq(unitOrganisasi.id, id)).returning()
  return updated
}

export async function deleteUnitOrganisasiService(id: string) {
  const [existing] = await db.select({ id: unitOrganisasi.id }).from(unitOrganisasi).where(eq(unitOrganisasi.id, id)).limit(1)
  if (!existing) throw new Error('Unit organisasi tidak ditemukan')

  // Cek apakah ada children
  const [{ childCount }] = await db.select({ childCount: count() }).from(unitOrganisasi).where(eq(unitOrganisasi.parentId, id))
  if (Number(childCount) > 0) throw new Error('Tidak bisa hapus unit yang masih memiliki sub-unit. Hapus sub-unit terlebih dahulu.')

  await db.delete(unitOrganisasi).where(eq(unitOrganisasi.id, id))
}
