// ─── TypeScript Augmentation ──────────────────────────────────────────────────
import '@fastify/jwt'
import { FastifyRequest, FastifyReply } from 'fastify'

// JWT payload & user shape
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub:          string
      email:        string
      role:         'user' | 'super_admin'
      tokenVersion: number
    }
    user: {
      sub:          string
      email:        string
      role:         'user' | 'super_admin'
      tokenVersion: number
    }
  }
}

// FastifyInstance decorators
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    authorize:    (roles: Array<'user' | 'super_admin'>) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
