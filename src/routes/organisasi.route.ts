// ─── Routes: Organisasi ───────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z }               from 'zod'
import {
  createBagianSchema, updateBagianSchema,
  createSubBagianSchema, updateSubBagianSchema,
  listQuerySchema,
} from '../validators/organisasi.validator'
import {
  listBagianService, getBagianByIdService, createBagianService, updateBagianService, deleteBagianService,
  listSubBagianService, getSubBagianByIdService, createSubBagianService, updateSubBagianService, deleteSubBagianService,
} from '../services/organisasi.service'
import { ok } from '../utils/response'

export default async function organisasiRoutes(fastify: FastifyInstance) {
  const authOnly  = [fastify.authenticate]
  const adminOnly = [fastify.authenticate, fastify.authorize(['super_admin'])]

  // ── Bagian ──────────────────────────────────────────────────────────────────
  fastify.get('/bagian', { preHandler: authOnly }, async (request, reply) => {
    const query  = listQuerySchema.parse(request.query)
    const result = await listBagianService(query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.get('/bagian/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(ok(await getBagianByIdService(id)))
  })

  fastify.post('/bagian', { preHandler: adminOnly }, async (request, reply) => {
    const input  = createBagianSchema.parse(request.body)
    return reply.code(201).send(ok(await createBagianService(input)))
  })

  fastify.put('/bagian/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const input  = updateBagianSchema.parse(request.body)
    return reply.send(ok(await updateBagianService(id, input)))
  })

  fastify.delete('/bagian/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteBagianService(id)
    return reply.code(204).send()
  })

  // ── Sub Bagian ──────────────────────────────────────────────────────────────
  const subListQuerySchema = listQuerySchema.extend({ bagianId: z.string().uuid().optional() })

  fastify.get('/sub-bagian', { preHandler: authOnly }, async (request, reply) => {
    const query  = subListQuerySchema.parse(request.query)
    const result = await listSubBagianService(query)
    return reply.send(ok(result.rows, result.meta))
  })

  fastify.get('/sub-bagian/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(ok(await getSubBagianByIdService(id)))
  })

  fastify.post('/sub-bagian', { preHandler: adminOnly }, async (request, reply) => {
    const input  = createSubBagianSchema.parse(request.body)
    return reply.code(201).send(ok(await createSubBagianService(input)))
  })

  fastify.put('/sub-bagian/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const input  = updateSubBagianSchema.parse(request.body)
    return reply.send(ok(await updateSubBagianService(id, input)))
  })

  fastify.delete('/sub-bagian/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteSubBagianService(id)
    return reply.code(204).send()
  })
}
