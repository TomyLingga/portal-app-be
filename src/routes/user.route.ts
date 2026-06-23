// ─── Routes: User ─────────────────────────────────────────────────────────────
import { FastifyInstance }   from 'fastify'
import {
  createUserSchema, updateUserSchema, grantAppSchema, listUserQuerySchema,
} from '../validators/user.validator'
import {
  listUsersService, getUserByIdService, createUserService,
  updateUserService, deleteUserService,
  grantAppService, revokeAppService, getUserAppsService,
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
    const result = await createUserService(input)
    return reply.code(201).send(ok(result))
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
    const result = await updateUserService(id, input)
    return reply.send(ok(result))
  })

  // DELETE /api/users/:id
  fastify.delete('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteUserService(id)
    return reply.code(204).send()
  })

  // GET /api/users/:id/apps — daftar aplikasi yang bisa diakses user
  fastify.get('/:id/apps', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await getUserAppsService(id)
    return reply.send(ok(result))
  })

  // POST /api/users/:id/grant-app
  fastify.post('/:id/grant-app', { preHandler: adminOnly }, async (request, reply) => {
    const { id }     = request.params as { id: string }
    const { appId }  = grantAppSchema.parse(request.body)
    const result = await grantAppService(id, appId, request.user.sub)
    return reply.code(201).send(ok(result))
  })

  // DELETE /api/users/:id/revoke-app/:appId
  fastify.delete('/:id/revoke-app/:appId', { preHandler: adminOnly }, async (request, reply) => {
    const { id, appId } = request.params as { id: string; appId: string }
    await revokeAppService(id, appId)
    return reply.code(204).send()
  })
}
