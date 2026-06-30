// ─── Routes: Master Data ──────────────────────────────────────────────────────
import { FastifyInstance, FastifyReply }   from 'fastify'
import path from 'path'
import { config } from '../config/env'
import { db }                from '../db'
import { refStatusKaryawan, refPendidikan, refStatusPernikahan, refGrade, refTipeUnit, refPenempatanArea, refKategoriAplikasi, refAgama, activityLog } from '../db/schema'
import { ok }                from '../utils/response'
import { eq, desc }          from 'drizzle-orm'
import { getMasterStatsService, getPaginatedLogsService } from '../services/master.service'
import { checkDomainStatus, checkDatabaseStatus, checkStorageStatus, checkSSLCertificate } from '../services/health.service'

/**
 * Helper to validate required request body fields.
 * Sends 400 response and returns false if any field is missing or empty.
 */
function validateRequired(reply: FastifyReply, fields: Record<string, any>, errorMessage: string): boolean {
  for (const value of Object.values(fields)) {
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      reply.code(400).send({ success: false, error: errorMessage })
      return false
    }
  }
  return true
}

export default async function masterRoutes(fastify: FastifyInstance) {
  const authOnly = [fastify.authenticate]

  // GET /api/master/status-karyawan
  fastify.get('/status-karyawan', { preHandler: authOnly }, async (_request, reply) => {
    const rows = await db.select().from(refStatusKaryawan).orderBy(refStatusKaryawan.label)
    return reply.send(ok(rows))
  })

  // GET /api/master/pendidikan
  fastify.get('/pendidikan', { preHandler: authOnly }, async (_request, reply) => {
    const rows = await db.select().from(refPendidikan).orderBy(refPendidikan.urutan)
    return reply.send(ok(rows))
  })

  // GET /api/master/status-pernikahan
  fastify.get('/status-pernikahan', { preHandler: authOnly }, async (_request, reply) => {
    const rows = await db.select().from(refStatusPernikahan).orderBy(refStatusPernikahan.label)
    return reply.send(ok(rows))
  })

  // GET /api/master/grade
  fastify.get('/grade', { preHandler: authOnly }, async (_request, reply) => {
    const rows = await db.select().from(refGrade).orderBy(refGrade.level)
    return reply.send(ok(rows))
  })

  // GET /api/master/tipe-unit
  fastify.get('/tipe-unit', { preHandler: authOnly }, async (_request, reply) => {
    const rows = await db.select().from(refTipeUnit).orderBy(desc(refTipeUnit.level))
    return reply.send(ok(rows))
  })

  // POST /api/master/tipe-unit
  fastify.post('/tipe-unit', { preHandler: authOnly }, async (request, reply) => {
    const { kode, label, level, warna } = request.body as { kode: string; label: string; level: number; warna: string }
    if (!validateRequired(reply, { kode, label, level, warna }, 'Kode, Label, Level, dan Warna wajib diisi.')) return

    const [row] = await db.insert(refTipeUnit).values({ kode, label, level: Number(level), warna }).returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'create_master_tipe_unit',
      details: `Menambahkan tipe unit baru: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  // PUT /api/master/tipe-unit/:id  (only label & warna are editable)
  fastify.put('/tipe-unit/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { label, warna } = request.body as { label: string; warna: string }
    if (!validateRequired(reply, { label, warna }, 'Label dan Warna wajib diisi.')) return

    const [row] = await db
      .update(refTipeUnit)
      .set({ label, warna })
      .where(eq(refTipeUnit.id, id))
      .returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'update_master_tipe_unit',
      details: `Memperbarui tipe unit: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  // DELETE /api/master/tipe-unit/:id
  fastify.delete('/tipe-unit/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ label: refTipeUnit.label, kode: refTipeUnit.kode }).from(refTipeUnit).where(eq(refTipeUnit.id, id)).limit(1)
    await db.delete(refTipeUnit).where(eq(refTipeUnit.id, id))
    if (existing) {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'delete_master_tipe_unit',
        details: `Menghapus tipe unit: "${existing.label}" (Kode: ${existing.kode})`,
      })
    }
    return reply.send(ok({ deleted: true }))
  })

  // ─── CRUD: Status Karyawan ────────────────────────────────────────────────────
  fastify.post('/status-karyawan', { preHandler: authOnly }, async (request, reply) => {
    const { kode, label } = request.body as { kode: string; label: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db.insert(refStatusKaryawan).values({ kode, label }).returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'create_master_status_karyawan',
      details: `Menambahkan status karyawan baru: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  fastify.put('/status-karyawan/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { kode, label } = request.body as { kode: string; label: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db
      .update(refStatusKaryawan)
      .set({ kode, label })
      .where(eq(refStatusKaryawan.id, id))
      .returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'update_master_status_karyawan',
      details: `Memperbarui status karyawan: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  fastify.delete('/status-karyawan/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ label: refStatusKaryawan.label, kode: refStatusKaryawan.kode }).from(refStatusKaryawan).where(eq(refStatusKaryawan.id, id)).limit(1)
    await db.delete(refStatusKaryawan).where(eq(refStatusKaryawan.id, id))
    if (existing) {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'delete_master_status_karyawan',
        details: `Menghapus status karyawan: "${existing.label}" (Kode: ${existing.kode})`,
      })
    }
    return reply.send(ok({ deleted: true }))
  })

  // ─── CRUD: Pendidikan ─────────────────────────────────────────────────────────
  fastify.post('/pendidikan', { preHandler: authOnly }, async (request, reply) => {
    const { kode, label, urutan } = request.body as { kode: string; label: string; urutan?: number }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db.insert(refPendidikan).values({ kode, label, urutan: urutan !== undefined ? Number(urutan) : 0 }).returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'create_master_pendidikan',
      details: `Menambahkan ref pendidikan baru: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  fastify.put('/pendidikan/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { kode, label, urutan } = request.body as { kode: string; label: string; urutan?: number }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db
      .update(refPendidikan)
      .set({ kode, label, urutan: urutan !== undefined ? Number(urutan) : 0 })
      .where(eq(refPendidikan.id, id))
      .returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'update_master_pendidikan',
      details: `Memperbarui ref pendidikan: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  fastify.delete('/pendidikan/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ label: refPendidikan.label, kode: refPendidikan.kode }).from(refPendidikan).where(eq(refPendidikan.id, id)).limit(1)
    await db.delete(refPendidikan).where(eq(refPendidikan.id, id))
    if (existing) {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'delete_master_pendidikan',
        details: `Menghapus ref pendidikan: "${existing.label}" (Kode: ${existing.kode})`,
      })
    }
    return reply.send(ok({ deleted: true }))
  })

  // ─── CRUD: Status Pernikahan ──────────────────────────────────────────────────
  fastify.post('/status-pernikahan', { preHandler: authOnly }, async (request, reply) => {
    const { kode, label } = request.body as { kode: string; label: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db.insert(refStatusPernikahan).values({ kode, label }).returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'create_master_status_pernikahan',
      details: `Menambahkan ref status pernikahan baru: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  fastify.put('/status-pernikahan/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { kode, label } = request.body as { kode: string; label: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db
      .update(refStatusPernikahan)
      .set({ kode, label })
      .where(eq(refStatusPernikahan.id, id))
      .returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'update_master_status_pernikahan',
      details: `Memperbarui ref status pernikahan: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  fastify.delete('/status-pernikahan/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ label: refStatusPernikahan.label, kode: refStatusPernikahan.kode }).from(refStatusPernikahan).where(eq(refStatusPernikahan.id, id)).limit(1)
    await db.delete(refStatusPernikahan).where(eq(refStatusPernikahan.id, id))
    if (existing) {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'delete_master_status_pernikahan',
        details: `Menghapus ref status pernikahan: "${existing.label}" (Kode: ${existing.kode})`,
      })
    }
    return reply.send(ok({ deleted: true }))
  })

  // ─── CRUD: Grade ─────────────────────────────────────────────────────────────
  fastify.post('/grade', { preHandler: authOnly }, async (request, reply) => {
    const { kode, label, level, keterangan } = request.body as { kode: string; label: string; level?: number; keterangan?: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db.insert(refGrade).values({
      kode,
      label,
      level: level !== undefined ? Number(level) : 0,
      keterangan: keterangan || null
    }).returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'create_master_grade',
      details: `Menambahkan ref grade baru: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  fastify.put('/grade/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { kode, label, level, keterangan } = request.body as { kode: string; label: string; level?: number; keterangan?: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db
      .update(refGrade)
      .set({
        kode,
        label,
        level: level !== undefined ? Number(level) : 0,
        keterangan: keterangan || null
      })
      .where(eq(refGrade.id, id))
      .returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'update_master_grade',
      details: `Memperbarui ref grade: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  fastify.delete('/grade/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ label: refGrade.label, kode: refGrade.kode }).from(refGrade).where(eq(refGrade.id, id)).limit(1)
    await db.delete(refGrade).where(eq(refGrade.id, id))
    if (existing) {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'delete_master_grade',
        details: `Menghapus ref grade: "${existing.label}" (Kode: ${existing.kode})`,
      })
    }
    return reply.send(ok({ deleted: true }))
  })

  // GET /api/master/stats
  fastify.get('/stats', { preHandler: authOnly }, async (request, reply) => {
    const query = request.query as { year?: string; month?: string }
    const currentYear = query.year ? parseInt(query.year, 10) : new Date().getFullYear()
    const currentMonth = query.month ? parseInt(query.month, 10) : new Date().getMonth() + 1

    try {
      const stats = await getMasterStatsService(currentYear, currentMonth)
      return reply.send(ok(stats))
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: 'Internal Server Error' })
    }
  })

  // GET /api/master/logs
  fastify.get('/logs', { preHandler: authOnly }, async (request, reply) => {
    const query = request.query as {
      page?: string
      limit?: string
      search?: string
      startDate?: string
      endDate?: string
    }
    const page = query.page ? parseInt(query.page, 10) : 1
    const limit = query.limit ? parseInt(query.limit, 10) : 10
    const search = query.search
    const startDate = query.startDate
    const endDate = query.endDate

    try {
      const result = await getPaginatedLogsService({ page, limit, search, startDate, endDate })
      return reply.send(ok(result))
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: 'Internal Server Error' })
    }
  })

  // GET /api/master/health
  fastify.get('/health', { preHandler: authOnly }, async (_request, reply) => {
    try {
      const uploadDir = path.resolve(config.upload.dir)
      
      const [domain, database, storage, ssl] = await Promise.all([
        checkDomainStatus('inl.co.id'),
        checkDatabaseStatus(),
        checkStorageStatus(uploadDir),
        checkSSLCertificate('inl.co.id')
      ])

      return reply.send(ok({
        uptime: process.uptime(),
        domain,
        api: {
          status: 'online',
          timestamp: new Date().toISOString()
        },
        database,
        storage,
        ssl
      }))
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ success: false, error: 'Internal Server Error' })
    }
  })

  // GET /api/master/penempatan-area
  fastify.get('/penempatan-area', { preHandler: authOnly }, async (_request, reply) => {
    const rows = await db.select().from(refPenempatanArea).orderBy(refPenempatanArea.nama)
    return reply.send(ok(rows))
  })

  // POST /api/master/penempatan-area
  fastify.post('/penempatan-area', { preHandler: authOnly }, async (request, reply) => {
    const { nama, longitude, latitude } = request.body as { nama: string; longitude: string; latitude: string }
    if (!validateRequired(reply, { nama, longitude, latitude }, 'Nama, Longitude, dan Latitude wajib diisi.')) return

    const [row] = await db.insert(refPenempatanArea).values({ nama, longitude, latitude }).returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'create_master_penempatan_area',
      details: `Menambahkan penempatan area baru: "${row.nama}"`,
    })
    return reply.send(ok(row))
  })

  // PUT /api/master/penempatan-area/:id
  fastify.put('/penempatan-area/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { nama, longitude, latitude } = request.body as { nama: string; longitude: string; latitude: string }
    if (!validateRequired(reply, { nama, longitude, latitude }, 'Nama, Longitude, dan Latitude wajib diisi.')) return

    const [row] = await db
      .update(refPenempatanArea)
      .set({ nama, longitude, latitude })
      .where(eq(refPenempatanArea.id, id))
      .returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'update_master_penempatan_area',
      details: `Memperbarui penempatan area: "${row.nama}"`,
    })
    return reply.send(ok(row))
  })

  // DELETE /api/master/penempatan-area/:id
  fastify.delete('/penempatan-area/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ nama: refPenempatanArea.nama }).from(refPenempatanArea).where(eq(refPenempatanArea.id, id)).limit(1)
    await db.delete(refPenempatanArea).where(eq(refPenempatanArea.id, id))
    if (existing) {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'delete_master_penempatan_area',
        details: `Menghapus penempatan area: "${existing.nama}"`,
      })
    }
    return reply.send(ok({ deleted: true }))
  })

  // ─── CRUD: Kategori Aplikasi ────────────────────────────────────────────────
  // GET /api/master/kategori-aplikasi
  fastify.get('/kategori-aplikasi', { preHandler: authOnly }, async (_request, reply) => {
    const rows = await db.select().from(refKategoriAplikasi).orderBy(refKategoriAplikasi.label)
    return reply.send(ok(rows))
  })

  // POST /api/master/kategori-aplikasi
  fastify.post('/kategori-aplikasi', { preHandler: authOnly }, async (request, reply) => {
    const { kode, label } = request.body as { kode: string; label: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db.insert(refKategoriAplikasi).values({ kode, label }).returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'create_master_kategori_aplikasi',
      details: `Menambahkan kategori aplikasi baru: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  // PUT /api/master/kategori-aplikasi/:id
  fastify.put('/kategori-aplikasi/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { kode, label } = request.body as { kode: string; label: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return

    const [row] = await db
      .update(refKategoriAplikasi)
      .set({ kode, label })
      .where(eq(refKategoriAplikasi.id, id))
      .returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'update_master_kategori_aplikasi',
      details: `Memperbarui kategori aplikasi: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  // DELETE /api/master/kategori-aplikasi/:id
  fastify.delete('/kategori-aplikasi/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ label: refKategoriAplikasi.label, kode: refKategoriAplikasi.kode }).from(refKategoriAplikasi).where(eq(refKategoriAplikasi.id, id)).limit(1)
    await db.delete(refKategoriAplikasi).where(eq(refKategoriAplikasi.id, id))
    if (existing) {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'delete_master_kategori_aplikasi',
        details: `Menghapus kategori aplikasi: "${existing.label}" (Kode: ${existing.kode})`,
      })
    }
    return reply.send(ok({ deleted: true }))
  })

  // ─── CRUD: Agama ──────────────────────────────────────────────────────────────
  // GET /api/master/agama
  fastify.get('/agama', { preHandler: authOnly }, async (_request, reply) => {
    const rows = await db.select().from(refAgama).orderBy(refAgama.label)
    return reply.send(ok(rows))
  })

  // POST /api/master/agama
  fastify.post('/agama', { preHandler: authOnly }, async (request, reply) => {
    const { kode, label } = request.body as { kode: string; label: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return
    const [row] = await db.insert(refAgama).values({ kode, label }).returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'create_master_agama',
      details: `Menambahkan ref agama: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.code(201).send(ok(row))
  })

  // PUT /api/master/agama/:id
  fastify.put('/agama/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { kode, label } = request.body as { kode: string; label: string }
    if (!validateRequired(reply, { kode, label }, 'Kode dan Label wajib diisi.')) return
    const [row] = await db
      .update(refAgama)
      .set({ kode, label })
      .where(eq(refAgama.id, id))
      .returning()
    await db.insert(activityLog).values({
      userId: request.user.sub,
      action: 'update_master_agama',
      details: `Memperbarui ref agama: "${row.label}" (Kode: ${row.kode})`,
    })
    return reply.send(ok(row))
  })

  // DELETE /api/master/agama/:id
  fastify.delete('/agama/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const [existing] = await db.select({ label: refAgama.label, kode: refAgama.kode }).from(refAgama).where(eq(refAgama.id, id)).limit(1)
    await db.delete(refAgama).where(eq(refAgama.id, id))
    if (existing) {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'delete_master_agama',
        details: `Menghapus ref agama: "${existing.label}" (Kode: ${existing.kode})`,
      })
    }
    return reply.send(ok({ deleted: true }))
  })
}
