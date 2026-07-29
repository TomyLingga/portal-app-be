import type { FastifyInstance } from 'fastify'
import {
  getPortalBrandingService,
  restorePortalBrandingService,
  updatePortalBrandingService,
} from '../services/portal-branding.service'
import { updatePortalBrandingSchema } from '../validators/portal-branding.validator'
import { ok } from '../utils/response'

export default async function portalBrandingRoutes(fastify: FastifyInstance) {
  const adminOnly = [fastify.authenticate, fastify.authorize(['super_admin'])]

  // Public because the portal name is needed before the user signs in.
  fastify.get('/branding', async (_request, reply) => {
    return reply.send(ok(await getPortalBrandingService()))
  })

  fastify.put('/branding', { preHandler: adminOnly }, async (request, reply) => {
    const input = updatePortalBrandingSchema.parse(request.body)
    return reply.send(ok(await updatePortalBrandingService(input, request.user.sub)))
  })

  fastify.post('/branding/restore', { preHandler: adminOnly }, async (request, reply) => {
    return reply.send(ok(await restorePortalBrandingService(request.user.sub)))
  })
}
