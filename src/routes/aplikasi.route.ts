// ─── Routes: Aplikasi ─────────────────────────────────────────────────────────
import { FastifyInstance }   from 'fastify'
import { MultipartFile }     from '@fastify/multipart'
import {
  createAplikasiSchema, updateAplikasiSchema, listAplikasiQuerySchema,
} from '../validators/aplikasi.validator'
import {
  listAplikasiService, getAplikasiByIdService,
  createAplikasiService, updateAplikasiService, deleteAplikasiService,
  updateAplikasiIconService, logAppAccessService,
  getAppAccessListService, grantAppAccessService, revokeAppAccessService,
  updateAppAccessModeService, getAppAccessSummaryService,
} from '../services/aplikasi.service'
import { saveUploadedFile }  from '../utils/file'
import { ok } from '../utils/response'
import { checkUserEmployeeLinkService } from '../services/auth.service'

export default async function aplikasiRoutes(fastify: FastifyInstance) {
  const authOnly  = [fastify.authenticate]
  const adminOnly = [fastify.authenticate, fastify.authorize(['super_admin'])]

  // GET /api/apps
  fastify.get('/', { preHandler: authOnly }, async (request, reply) => {
    const query  = listAplikasiQuerySchema.parse(request.query)
    const result = await listAplikasiService(query, request.user.sub, request.user.role)
    return reply.send(ok(result.rows, result.meta))
  })

  // POST /api/apps
  fastify.post('/', { preHandler: adminOnly }, async (request, reply) => {
    const input  = createAplikasiSchema.parse(request.body)
    const result = await createAplikasiService(input, request.user.sub)
    return reply.code(201).send(ok(result))
  })

  // GET /api/apps/:id
  fastify.get('/:id', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    return reply.send(ok(await getAplikasiByIdService(id)))
  })

  // PUT /api/apps/:id
  fastify.put('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const input  = updateAplikasiSchema.parse(request.body)
    return reply.send(ok(await updateAplikasiService(id, input, request.user.sub)))
  })

  // DELETE /api/apps/:id
  fastify.delete('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteAplikasiService(id, request.user.sub)
    return reply.code(204).send()
  })

  // POST /api/apps/:id/access — log access to independent app
  fastify.post('/:id/access', { preHandler: authOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user.sub
    await checkUserEmployeeLinkService(userId)
    await logAppAccessService(userId, id)
    return reply.send(ok({ success: true }))
  })

  // GET /api/apps/:id/user-access — list users with access to app
  fastify.get('/:id/user-access', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const list = await getAppAccessListService(id)
    return reply.send(ok(list))
  })

  // POST /api/apps/:id/user-access — grant access to userIds
  fastify.post('/:id/user-access', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { userIds } = request.body as { userIds: string[] }
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error('Pilih minimal satu pengguna untuk diberikan hak akses')
    }
    const result = await grantAppAccessService(id, userIds, request.user.sub)
    return reply.send(ok(result))
  })

  // DELETE /api/apps/:id/user-access/:userId — revoke access
  fastify.delete('/:id/user-access/:userId', { preHandler: adminOnly }, async (request, reply) => {
    const { id, userId } = request.params as { id: string; userId: string }
    await revokeAppAccessService(id, userId, request.user.sub)
    return reply.code(204).send()
  })

  // PUT /api/apps/:id/access-mode — update mode privasi akses (all_employees | all_except | specific_only | by_unit)
  fastify.put('/:id/access-mode', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { accessMode, targetUnitIds } = request.body as {
      accessMode: 'all_employees' | 'all_except' | 'specific_only' | 'by_unit'
      targetUnitIds?: string[] | null
    }
    const result = await updateAppAccessModeService(id, accessMode, targetUnitIds || null, request.user.sub)
    return reply.send(ok(result))
  })

  // GET /api/apps/:id/access-summary — get access summary & percentage stats
  fastify.get('/:id/access-summary', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const summary = await getAppAccessSummaryService(id)
    return reply.send(ok(summary))
  })

  // POST /api/apps/:id/icon — upload icon aplikasi (multipart)
  fastify.post('/:id/icon', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const file: MultipartFile | undefined = await request.file()
    if (!file) throw new Error('File icon tidak ditemukan dalam request')

    const filename = await saveUploadedFile(file, 'apps')
    const result   = await updateAplikasiIconService(id, filename, request.user.sub)

    return reply.send(ok(result))
  })
}
