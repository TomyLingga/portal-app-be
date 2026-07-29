import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  clearAllNotificationsService,
  deleteNotificationService,
  listNotificationsService,
  markAllNotificationsReadService,
  markNotificationReadService,
} from '../services/notification.service'
import { ok } from '../utils/response'

const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
})

export default async function notificationRoutes(fastify: FastifyInstance) {
  const authOnly = [fastify.authenticate]

  fastify.get('/', { preHandler: authOnly }, async (request, reply) => {
    const query = notificationQuerySchema.parse(request.query)
    const result = await listNotificationsService(request.user.sub, query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.put('/read-all', { preHandler: authOnly }, async (request, reply) => {
    return reply.send(ok(await markAllNotificationsReadService(request.user.sub)))
  })

  fastify.put('/:id/read', { preHandler: authOnly }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    return reply.send(ok(await markNotificationReadService(request.user.sub, id)))
  })

  fastify.delete('/clear-all', { preHandler: authOnly }, async (request, reply) => {
    return reply.send(ok(await clearAllNotificationsService(request.user.sub)))
  })

  fastify.delete('/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    return reply.send(ok(await deleteNotificationService(request.user.sub, id)))
  })
}
