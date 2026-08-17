import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  recordHeartbeatService,
  removeUserPresenceService,
  getLiveUsersService,
  getLiveCountService,
} from '../services/presence.service'
import { ok } from '../utils/response'
import { config } from '../config/env'

const heartbeatSchema = z.object({
  appId: z.string().optional().default('portal'),
  appName: z.string().optional().default('Portal SSO'),
  currentPath: z.string().min(1).default('/'),
  pageTitle: z.string().optional().default('Beranda'),
})

const liveQuerySchema = z.object({
  appId: z.string().optional(),
})

export default async function presenceRoutes(fastify: FastifyInstance) {
  // POST /api/presence/heartbeat - Heartbeat from active browser tabs
  fastify.post('/heartbeat', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = heartbeatSchema.parse(request.body || {})
    const userAgent = request.headers['user-agent'] || ''
    const presence = await recordHeartbeatService(request.user.sub, body, userAgent, request.ip)
    const liveCount = getLiveCountService()
    return reply.send(ok({ presence, liveCount }))
  })

  // POST /api/presence/leave - Sent when user logs out or closes browser
  fastify.post('/leave', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    removeUserPresenceService(request.user.sub)
    return reply.send(ok({ left: true }))
  })

  // POST /api/presence/app-heartbeat - Internal endpoint for connected SSO apps (e.g. MeeTrip)
  fastify.post('/app-heartbeat', async (request, reply) => {
    const internalHeader = request.headers['x-internal'] || request.headers['x-sso-internal-token']
    if (internalHeader !== config.sso.internalToken) {
      return reply.code(403).send({ success: false, error: 'Forbidden: invalid internal SSO token' })
    }

    const appHeartbeatSchema = z.object({
      userId: z.string().min(1),
      appId: z.string().default('meetrip'),
      appName: z.string().default('MeeTrip'),
      currentPath: z.string().default('/dashboard'),
      pageTitle: z.string().default('MeeTrip'),
    })

    const body = appHeartbeatSchema.parse(request.body || {})
    const userAgent = request.headers['user-agent'] || ''
    const presence = await recordHeartbeatService(body.userId, body, userAgent, request.ip)
    const liveCount = getLiveCountService()
    return reply.send(ok({ presence, liveCount }))
  })

  // POST /api/presence/app-leave - Internal endpoint when user leaves connected SSO app
  fastify.post('/app-leave', async (request, reply) => {
    const internalHeader = request.headers['x-internal'] || request.headers['x-sso-internal-token']
    if (internalHeader !== config.sso.internalToken) {
      return reply.code(403).send({ success: false, error: 'Forbidden: invalid internal SSO token' })
    }
    const leaveSchema = z.object({ userId: z.string().min(1) })
    const { userId } = leaveSchema.parse(request.body || {})
    removeUserPresenceService(userId)
    return reply.send(ok({ left: true }))
  })

  // GET /api/presence/live - List live active users with app & page details
  fastify.get('/live', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = liveQuerySchema.parse(request.query || {})
    const liveUsers = getLiveUsersService(query.appId)
    return reply.send(ok({
      liveUsers,
      totalOnline: liveUsers.length,
    }))
  })
}
