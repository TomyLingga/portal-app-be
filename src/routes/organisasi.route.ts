// ─── Routes: Organisasi (Unit Organisasi) ─────────────────────────────────────
import { FastifyInstance } from 'fastify'
import {
  createUnitOrganisasiSchema, updateUnitOrganisasiSchema, listUnitOrganisasiQuerySchema,
} from '../validators/organisasi.validator'
import {
  listUnitOrganisasiService, getUnitOrganisasiByIdService,
  createUnitOrganisasiService, updateUnitOrganisasiService, deleteUnitOrganisasiService,
  getChildrenService, getTreeService,
} from '../services/organisasi.service'
import { ok } from '../utils/response'

export default async function organisasiRoutes(fastify: FastifyInstance) {
  const authOnly  = [fastify.authenticate]
  const adminOnly = [fastify.authenticate, fastify.authorize(['super_admin'])]

  // GET /api/org/unit — list dengan pagination & filter
  fastify.get('/unit', { preHandler: authOnly }, async (request, reply) => {
    const query  = listUnitOrganisasiQuerySchema.parse(request.query)
    const result = await listUnitOrganisasiService(query)
    return reply.send(ok(result.rows, result.meta))
  })

  // GET /api/org/tree — full org tree (untuk org chart)
  fastify.get('/tree', { preHandler: authOnly }, async (_request, reply) => {
    const tree = await getTreeService()
    return reply.send(ok(tree))
  })

  // GET /api/org/unit/:id
  fastify.get('/unit/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(ok(await getUnitOrganisasiByIdService(id)))
  })

  // GET /api/org/unit/:id/children — sub-unit langsung
  fastify.get('/unit/:id/children', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(ok(await getChildrenService(id)))
  })

  // POST /api/org/unit
  fastify.post('/unit', { preHandler: adminOnly }, async (request, reply) => {
    const input = createUnitOrganisasiSchema.parse(request.body)
    return reply.code(201).send(ok(await createUnitOrganisasiService(input)))
  })

  // PUT /api/org/unit/:id
  fastify.put('/unit/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const input  = updateUnitOrganisasiSchema.parse(request.body)
    return reply.send(ok(await updateUnitOrganisasiService(id, input)))
  })

  // DELETE /api/org/unit/:id
  fastify.delete('/unit/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteUnitOrganisasiService(id)
    return reply.code(204).send()
  })
}
