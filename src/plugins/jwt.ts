// ─── Plugin: JWT ──────────────────────────────────────────────────────────────
import fp           from 'fastify-plugin'
import fastifyJwt   from '@fastify/jwt'
import { FastifyInstance } from 'fastify'
import { config }   from '../config/env'

export default fp(async function jwtPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyJwt, {
    secret:  config.jwt.secret,
    sign:    { expiresIn: config.jwt.expiresIn },
  })
})
