// ─── Utils: Global Error Handler ──────────────────────────────────────────────
import { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { config } from '../config/env'

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.code(422).send({
      success: false,
      error:   'Validasi gagal',
      details: error.issues.map(e => ({ field: e.path.join('.'), message: e.message })),
    })
  }

  const err = error as Error & { statusCode?: number; code?: string }

  // Handle foreign key constraint violation (linked to other data)
  if (err.code === '23503') {
    return reply.code(400).send({
      success: false,
      error: 'Data tidak dapat dihapus karena sedang digunakan atau terikat dengan data lain.'
    })
  }

  if (err.message && !err.statusCode) {
    return reply.code(400).send({ success: false, error: err.message })
  }

  request.log.error(err)
  
  return reply.code(err.statusCode ?? 500).send({
    success: false,
    error: config.app.nodeEnv === 'production' ? 'Internal server error' : err.message,
  })
}
