// ─── Routes: SSO ──────────────────────────────────────────────────────────────
import { FastifyInstance }   from 'fastify'
import { z }                 from 'zod'
import { generateSSOTokenService, verifySSOTokenService } from '../services/sso.service'
import { ok }                from '../utils/response'
import { db }                from '../db'
import { employee, refGrade, unitOrganisasi, refPenempatanArea, user as userTable } from '../db/schema'
import { eq, gt, and, isNotNull } from 'drizzle-orm'
import { config }             from '../config/env'

const generateQuerySchema = z.object({
  app_id: z.string().uuid('app_id tidak valid'),
})

const verifyBodySchema = z.object({
  token:  z.string().min(1, 'token wajib diisi'),
  app_id: z.string().uuid('app_id tidak valid'),
})

export default async function ssoRoutes(fastify: FastifyInstance) {

  /**
   * GET /api/sso/token?app_id=xxx
   * User (yang sudah login portal) klik aplikasi SSO.
   * Backend generate short-lived token lalu kembalikan redirect URL.
   */
  fastify.get('/token', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { app_id } = generateQuerySchema.parse(request.query)
    const result = await generateSSOTokenService(request.user.sub, app_id)
    return reply.send(ok(result))
  })

  /**
   * POST /api/sso/verify
   * Dipanggil oleh aplikasi client untuk memverifikasi token SSO.
   * Tidak butuh JWT — ini untuk aplikasi eksternal.
   */
  fastify.post('/verify', async (request, reply) => {
    const { token, app_id } = verifyBodySchema.parse(request.body)
    const userData = await verifySSOTokenService(token, app_id)
    return reply.send(ok(userData))
  })

  /**
   * GET /api/sso/employees
   * Endpoint internal untuk aplikasi SSO client seperti MeeTrip agar bisa mengisi
   * dropdown pemberi tugas dari data employee Portal.
   */
  fastify.get('/employees', async (request, reply) => {
    if (request.headers['x-internal'] !== config.sso.internalToken) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }

    const query = z.object({
      id: z.string().uuid().optional(),
      minGradeLevel: z.coerce.number().optional(),
      aboveGradeLevel: z.coerce.number().optional(),
    }).parse(request.query)

    const conditions = [isNotNull(userTable.id), eq(userTable.isActive, true)]
    if (query.id) conditions.push(eq(employee.id, query.id))
    const aboveGradeLevel = query.aboveGradeLevel ?? query.minGradeLevel
    if (aboveGradeLevel !== undefined) conditions.push(gt(refGrade.level, aboveGradeLevel))

    const rows = await db
      .select({
        id: userTable.id,
        employeeId: employee.id,
        namaLengkap: employee.nama,
        jabatan: employee.jabatan,
        gradeLevel: refGrade.level,
        gradeKode: refGrade.kode,
        unitNama: unitOrganisasi.nama,
        penempatanNama: refPenempatanArea.nama,
        atasanId: employee.atasanId,
      })
      .from(employee)
      .leftJoin(userTable, eq(userTable.employeeId, employee.id))
      .leftJoin(refGrade, eq(employee.gradeId, refGrade.id))
      .leftJoin(unitOrganisasi, eq(employee.unitOrganisasiId, unitOrganisasi.id))
      .leftJoin(refPenempatanArea, eq(employee.penempatanAreaId, refPenempatanArea.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(refGrade.level, employee.nama)
      .limit(100)

    return reply.send(ok(rows))
  })

  /**
   * GET /api/sso/grades
   * Endpoint internal untuk aplikasi SSO client seperti MeeTrip agar bisa mengambil
   * data grade dari Portal.
   */
  fastify.get('/grades', async (request, reply) => {
    if (request.headers['x-internal'] !== config.sso.internalToken) {
      return reply.code(403).send({ success: false, error: 'Forbidden' })
    }
    const rows = await db.select().from(refGrade).orderBy(refGrade.level)
    return reply.send(ok(rows))
  })
}
