// ─── Routes: Master Data ──────────────────────────────────────────────────────
import { FastifyInstance }   from 'fastify'
import { db }                from '../db'
import { refStatusKaryawan, refPendidikan, refStatusPernikahan } from '../db/schema'
import { ok }                from '../utils/response'

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
}
