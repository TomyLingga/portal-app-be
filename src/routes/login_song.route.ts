// ─── Routes: Login Song ──────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { MultipartFile } from '@fastify/multipart'
import {
  listLoginSongsService,
  createLoginSongService,
  updateLoginSongService,
  updateLoginSongFileService,
  deleteLoginSongService,
  activateLoginSongService,
  getActiveLoginSongService,
} from '../services/login_song.service'
import { saveUploadedAudioFile } from '../utils/file'
import { ok } from '../utils/response'
import { z } from 'zod'

const songInputSchema = z.object({
  title: z.string().min(1, 'Judul lagu wajib diisi').max(150, 'Judul lagu maksimal 150 karakter'),
})

export default async function loginSongRoutes(fastify: FastifyInstance) {
  const authOnly = [fastify.authenticate]
  const adminOnly = [fastify.authenticate, fastify.authorize(['super_admin'])]

  // GET /api/login-songs (Admin)
  fastify.get('/', { preHandler: adminOnly }, async (request, reply) => {
    const result = await listLoginSongsService()
    return reply.send(ok(result))
  })

  // GET /api/login-songs/active (Public)
  fastify.get('/active', async (_request, reply) => {
    const result = await getActiveLoginSongService()
    return reply.send(ok(result))
  })

  // POST /api/login-songs (Admin)
  fastify.post('/', { preHandler: adminOnly }, async (request, reply) => {
    const input = songInputSchema.parse(request.body)
    const result = await createLoginSongService(input, request.user.sub)
    return reply.code(201).send(ok(result))
  })

  // POST /api/login-songs/:id/file (Admin)
  fastify.post('/:id/file', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const file: MultipartFile | undefined = await request.file()

    if (!file) throw new Error('File lagu tidak ditemukan dalam request')

    const filename = await saveUploadedAudioFile(file)
    const result = await updateLoginSongFileService(id, filename, request.user.sub)

    return reply.send(ok(result))
  })

  // PUT /api/login-songs/:id (Admin)
  fastify.put('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const input = songInputSchema.parse(request.body)
    const result = await updateLoginSongService(id, input, request.user.sub)
    return reply.send(ok(result))
  })

  // DELETE /api/login-songs/:id (Admin)
  fastify.delete('/:id', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await deleteLoginSongService(id, request.user.sub)
    return reply.code(204).send()
  })

  // POST /api/login-songs/:id/activate (Admin)
  fastify.post('/:id/activate', { preHandler: adminOnly }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await activateLoginSongService(id, request.user.sub)
    return reply.send(ok(result))
  })
}
