// ─── Routes: Employee ─────────────────────────────────────────────────────────
import { FastifyInstance }   from 'fastify'
import { MultipartFile }     from '@fastify/multipart'
import {
  createEmployeeSchema, updateEmployeeSchema, listEmployeeQuerySchema,
} from '../validators/employee.validator'
import {
  listEmployeesService, getEmployeeByIdService, createEmployeeService,
  updateEmployeeService, deleteEmployeeService, updateEmployeePhotoService,
} from '../services/employee.service'
import { saveUploadedFile }  from '../utils/file'
import { ok }                from '../utils/response'

export default async function employeeRoutes(fastify: FastifyInstance) {
  const authOnly  = [fastify.authenticate]
  const adminOnly = [fastify.authenticate, fastify.authorize(['super_admin'])]

  // GET /api/employees
  fastify.get('/', { preHandler: authOnly }, async (request, reply) => {
    const query  = listEmployeeQuerySchema.parse(request.query)
    const result = await listEmployeesService(query)
    return reply.send(ok(result.rows, result.meta))
  })

  // POST /api/employees
  fastify.post('/', { preHandler: adminOnly }, async (request, reply) => {
    const input  = createEmployeeSchema.parse(request.body)
    const result = await createEmployeeService(input)
    return reply.code(201).send(ok(result))
  })

  // GET /api/employees/:id
  fastify.get('/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await getEmployeeByIdService(id)
    return reply.send(ok(result))
  })

  // PUT /api/employees/:id
  fastify.put('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const input  = updateEmployeeSchema.parse(request.body)
    const result = await updateEmployeeService(id, input)
    return reply.send(ok(result))
  })

  // DELETE /api/employees/:id
  fastify.delete('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteEmployeeService(id)
    return reply.code(204).send()
  })

  // POST /api/employees/:id/photo — upload foto profil (multipart)
  fastify.post('/:id/photo', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const file: MultipartFile | undefined = await request.file()
    if (!file) throw new Error('File foto tidak ditemukan dalam request')

    const filename = await saveUploadedFile(file)
    const result   = await updateEmployeePhotoService(id, filename)

    return reply.send(ok(result))
  })
}
