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

  const err = error as any

  // Handle foreign key constraint violation (linked to other data)
  const isForeignKeyError =
    err.code === '23503' ||
    err.cause?.code === '23503' ||
    err.originalError?.code === '23503' ||
    String(err.message || '').includes('violates foreign key constraint') ||
    String(err.cause?.message || '').includes('violates foreign key constraint') ||
    String(err.originalError?.message || '').includes('violates foreign key constraint') ||
    String(err.message || '').includes('foreign key constraint') ||
    String(err.cause?.message || '').includes('foreign key constraint') ||
    String(err.detail || '').includes('referenced from table');

  if (isForeignKeyError) {
    return reply.code(400).send({
      success: false,
      error: 'Data tidak dapat dihapus karena sedang digunakan atau terikat dengan data lain.'
    })
  }

  if (err.message && !err.statusCode) {
    // If it's a raw query failure error message, sanitize it so SQL queries are not leaked
    const cleanMessage = String(err.message).startsWith('Failed query:')
      ? 'Gagal memproses permintaan database.'
      : err.message;
    return reply.code(400).send({ success: false, error: cleanMessage })
  }

  request.log.error(err)
  
  return reply.code(err.statusCode ?? 500).send({
    success: false,
    error: config.app.nodeEnv === 'production' ? 'Internal server error' : err.message,
  })
}
