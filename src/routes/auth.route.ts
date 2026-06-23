// ─── Routes: Auth ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { loginSchema, refreshTokenSchema }     from '../validators/auth.validator'
import { loginService, logoutService, getMeService, refreshTokenService } from '../services/auth.service'
import { ok, err }         from '../utils/response'

export default async function authRoutes(fastify: FastifyInstance) {

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const result = await loginService(fastify, input)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = refreshTokenSchema.parse(request.body)
    const result = await refreshTokenService(fastify, refreshToken)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/logout — butuh JWT yang valid
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    await logoutService(request.user.sub)
    return reply.code(200).send(ok({ message: 'Logout berhasil' }))
  })

  // GET /api/auth/me
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = await getMeService(request.user.sub)
    return reply.code(200).send(ok(data))
  })
}

