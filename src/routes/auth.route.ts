// ─── Routes: Auth ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { MultipartFile }  from '@fastify/multipart'
import { loginSchema, refreshTokenSchema }     from '../validators/auth.validator'
import {
  loginService,
  logoutService,
  getMeService,
  refreshTokenService,
  verifyTotpLoginService,
  setupTotpService,
  enableTotpService,
  disableTotpService,
  forgotPasswordService,
  resetPasswordService,
} from '../services/auth.service'
import {
  generatePasskeyRegistrationOptionsService,
  verifyPasskeyRegistrationService,
  generatePasskeyLoginOptionsService,
  verifyPasskeyLoginService,
  listPasskeysService,
  updatePasskeyService,
  deletePasskeyService,
} from '../services/passkey.service'
import { updateEmployeePhotoService } from '../services/employee.service'
import { saveUploadedFile }           from '../utils/file'
import { getUserByIdService }         from '../services/user.service'
import { ok, err }         from '../utils/response'
import { db }              from '../db'
import { activityLog }     from '../db/schema'

export default async function authRoutes(fastify: FastifyInstance) {

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const result = await loginService(fastify, input)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/login/totp-verify
  fastify.post('/login/totp-verify', async (request, reply) => {
    const { totpToken, code } = request.body as { totpToken: string; code: string }
    if (!totpToken || !code) {
      return reply.code(400).send(err('totpToken dan code wajib diisi'))
    }
    const result = await verifyTotpLoginService(fastify, totpToken, code)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = refreshTokenSchema.parse(request.body)
    const result = await refreshTokenService(fastify, refreshToken)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/logout — butuh JWT yang valid
  fastify.post('/logout', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    await logoutService(request.user.sub)
    return reply.code(200).send(ok({ message: 'Logout berhasil' }))
  })

  // GET /api/auth/me
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = await getMeService(request.user.sub)
    return reply.code(200).send(ok(data))
  })



  // ─── Passkey (WebAuthn) Endpoints ───────────────────────────────────────────

  // POST /api/auth/passkey/register/options
  fastify.post('/passkey/register/options', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const result = await generatePasskeyRegistrationOptionsService(fastify, request.user.sub)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/passkey/register/verify
  fastify.post('/passkey/register/verify', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { registrationResponse, challengeToken, name } = request.body as { registrationResponse: any; challengeToken: string; name?: string }
    if (!registrationResponse || !challengeToken) {
      return reply.code(400).send(err('registrationResponse dan challengeToken wajib diisi'))
    }
    const result = await verifyPasskeyRegistrationService(fastify, request.user.sub, registrationResponse, challengeToken, name)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/passkey/login/options
  fastify.post('/passkey/login/options', async (request, reply) => {
    const { email } = (request.body as { email?: string }) || {}
    const result = await generatePasskeyLoginOptionsService(fastify, email)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/passkey/login/verify
  fastify.post('/passkey/login/verify', async (request, reply) => {
    const { loginResponse, challengeToken } = request.body as { loginResponse: any; challengeToken: string }
    if (!loginResponse || !challengeToken) {
      return reply.code(400).send(err('loginResponse dan challengeToken wajib diisi'))
    }
    const result = await verifyPasskeyLoginService(fastify, loginResponse, challengeToken)
    return reply.code(200).send(ok(result))
  })

  // GET /api/auth/passkey — list all user's passkeys
  fastify.get('/passkey', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const result = await listPasskeysService(request.user.sub)
    return reply.code(200).send(ok(result))
  })

  // PUT /api/auth/passkey/:id — rename a passkey
  fastify.put('/passkey/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { name } = request.body as { name: string }
    const result = await updatePasskeyService(request.user.sub, id, name)
    return reply.code(200).send(ok(result))
  })

  // DELETE /api/auth/passkey/:id — delete a passkey
  fastify.delete('/passkey/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const result = await deletePasskeyService(request.user.sub, id)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/totp/setup
  fastify.post('/totp/setup', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const result = await setupTotpService(request.user.sub)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/totp/enable
  fastify.post('/totp/enable', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { secret, code } = request.body as { secret: string; code: string }
    if (!secret || !code) {
      return reply.code(400).send(err('secret dan code wajib diisi'))
    }
    const result = await enableTotpService(request.user.sub, secret, code)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/totp/disable
  fastify.post('/totp/disable', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { password } = request.body as { password?: string }
    const result = await disableTotpService(request.user.sub, password)
    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/me/photo — update foto profil sendiri (via linked employee)
  fastify.post('/me/photo', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const user = await getUserByIdService(request.user.sub)
    if (!user?.employeeId) {
      return reply.code(400).send(err('Akun Anda tidak terhubung ke data karyawan. Hubungi administrator.'))
    }

    const file: MultipartFile | undefined = await request.file()
    if (!file) {
      return reply.code(400).send(err('File foto tidak ditemukan dalam request.'))
    }

    const filename = await saveUploadedFile(file, 'employees')
    const result   = await updateEmployeePhotoService(user.employeeId, filename)

    // Log activity
    try {
      await db.insert(activityLog).values({
        userId: request.user.sub,
        action: 'update_profile_photo',
        details: 'Mengubah foto profil karyawan',
      })
    } catch (err) {
      // Ignore logging error
    }

    return reply.code(200).send(ok(result))
  })

  // POST /api/auth/forgot-password
  fastify.post('/forgot-password', async (request, reply) => {
    const { email } = request.body as { email: string }
    fastify.log.info(`[forgot-password] Request received for email: ${email}`)

    if (!email) {
      return reply.code(400).send(err('Email wajib diisi'))
    }

    try {
      const result = await forgotPasswordService(fastify, email)
      fastify.log.info(`[forgot-password] Service result: ${JSON.stringify(result)}`)
      return reply.code(200).send(ok(result))
    } catch (e: any) {
      fastify.log.error(`[forgot-password] ERROR: ${e.message}`)
      fastify.log.error(e)
      return reply.code(500).send(err(`Gagal mengirim email: ${e.message}`))
    }
  })

  // POST /api/auth/reset-password
  fastify.post('/reset-password', async (request, reply) => {
    const { token, password } = request.body as { token: string; password?: string }
    if (!token || !password) {
      return reply.code(400).send(err('Token dan password wajib diisi'))
    }
    const result = await resetPasswordService(fastify, token, password)
    return reply.code(200).send(ok(result))
  })
}