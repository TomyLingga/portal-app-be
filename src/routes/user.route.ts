// ─── Routes: User ─────────────────────────────────────────────────────────────
import { FastifyInstance }   from 'fastify'
import {
  createUserSchema, updateUserSchema, listUserQuerySchema,
} from '../validators/user.validator'
import {
  listUsersService, getUserByIdService, createUserService,
  updateUserService, deleteUserService,
  listAllPasskeysService, deletePasskeyAdminService,
  listUsers2faService, disableUser2faService,
  deleteAllUserPasskeysService,
} from '../services/user.service'
import { ok } from '../utils/response'

export default async function userRoutes(fastify: FastifyInstance) {
  const adminOnly = [fastify.authenticate, fastify.authorize(['super_admin'])]

  // GET /api/users
  fastify.get('/', { preHandler: adminOnly }, async (request, reply) => {
    const query  = listUserQuerySchema.parse(request.query)
    const result = await listUsersService(query)
    return reply.send(ok(result.rows, result.meta))
  })

  // POST /api/users
  fastify.post('/', { preHandler: adminOnly }, async (request, reply) => {
    const input  = createUserSchema.parse(request.body)
    const result = await createUserService(input, request.user.sub)
    return reply.code(201).send(ok(result))
  })

  // GET /api/users/passkeys
  fastify.get('/passkeys', { preHandler: adminOnly }, async (_request, reply) => {
    const result = await listAllPasskeysService()
    return reply.send(ok(result))
  })

  // DELETE /api/users/passkeys/:id
  fastify.delete('/passkeys/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deletePasskeyAdminService(id, request.user.sub)
    return reply.code(204).send()
  })

  // DELETE /api/users/:id/passkeys
  fastify.delete('/:id/passkeys', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteAllUserPasskeysService(id, request.user.sub)
    return reply.code(204).send()
  })

  // GET /api/users/2fa
  fastify.get('/2fa', { preHandler: adminOnly }, async (_request, reply) => {
    const result = await listUsers2faService()
    return reply.send(ok(result))
  })

  // POST /api/users/:id/2fa/disable
  fastify.post('/:id/2fa/disable', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await disableUser2faService(id, request.user.sub)
    return reply.send(ok({ message: '2FA berhasil dinonaktifkan' }))
  })

  // GET /api/users/:id
  fastify.get('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await getUserByIdService(id)
    return reply.send(ok(result))
  })

  // PUT /api/users/:id
  fastify.put('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const input  = updateUserSchema.parse(request.body)
    const result = await updateUserService(id, input, request.user.sub)
    return reply.send(ok(result))
  })

  // DELETE /api/users/:id
  fastify.delete('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteUserService(id, request.user.sub)
    return reply.code(204).send()
  })

}
