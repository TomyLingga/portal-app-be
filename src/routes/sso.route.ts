// ─── Routes: SSO ──────────────────────────────────────────────────────────────
import { FastifyInstance }   from 'fastify'
import { z }                 from 'zod'
import { generateSSOTokenService, verifySSOTokenService } from '../services/sso.service'
import { ok }                from '../utils/response'

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
}
