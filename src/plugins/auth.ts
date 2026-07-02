// ─── Plugin: Auth Decorators ──────────────────────────────────────────────────
// Menyediakan fastify.authenticate & fastify.authorize sebagai preHandler
import fp                from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { eq }            from 'drizzle-orm'
import { db }            from '../db'
import { user as userTable } from '../db/schema'
import { getAccessCookie } from '../utils/cookie'

export default fp(async function authPlugin(fastify: FastifyInstance) {

  /**
   * authenticate: verifikasi JWT & cek tokenVersion agar logout benar-benar invalid.
   * Gunakan sebagai preHandler di route yang butuh login.
   */
  fastify.decorate('authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        if (!request.headers.authorization) {
          const token = getAccessCookie(request)
          if (token) {
            request.headers.authorization = `Bearer ${token}`
          }
        }
        await request.jwtVerify()
      } catch (err: any) {
        fastify.log.warn(`[Auth] JWT verification failed for request ${request.url}: ${err.message}`)
        return reply.code(401).send({ success: false, error: 'Unauthorized — token tidak valid atau expired' })
      }

      // Cek tokenVersion: kalau user sudah logout, versi tidak cocok
      const payload = request.user
      const [dbUser] = await db
        .select({ tokenVersion: userTable.tokenVersion, isActive: userTable.isActive })
        .from(userTable)
        .where(eq(userTable.id, payload.sub))
        .limit(1)

      if (!dbUser) {
        fastify.log.warn(`[Auth] User not found in database for ID: ${payload.sub}`)
        return reply.code(401).send({ success: false, error: 'User tidak ditemukan' })
      }
      if (!dbUser.isActive) {
        fastify.log.warn(`[Auth] Inactive user blocked: ${payload.sub}`)
        return reply.code(403).send({ success: false, error: 'Akun dinonaktifkan' })
      }
      if (dbUser.tokenVersion !== payload.tokenVersion) {
        fastify.log.warn(`[Auth] Token version mismatch for user ${payload.sub}: DB has ${dbUser.tokenVersion}, payload has ${payload.tokenVersion}`)
        return reply.code(401).send({ success: false, error: 'Session sudah berakhir, silakan login ulang' })
      }
    }
  )

  /**
   * authorize: cek role setelah authenticate.
   * Contoh: preHandler: [fastify.authenticate, fastify.authorize(['super_admin'])]
   */
  fastify.decorate('authorize',
    function (roles: Array<'user' | 'super_admin'>) {
      return async function (request: FastifyRequest, reply: FastifyReply) {
        if (!roles.includes(request.user.role)) {
          return reply.code(403).send({ success: false, error: 'Akses ditolak — role tidak mencukupi' })
        }
      }
    }
  )
})
