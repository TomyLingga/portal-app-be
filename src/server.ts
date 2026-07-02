// ─── Server Entry Point ───────────────────────────────────────────────────────
import 'dotenv/config'
import path         from 'path'
import fs           from 'fs'
import Fastify      from 'fastify'
import cors         from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import multipart    from '@fastify/multipart'
import { config }   from './config/env'
import { errorHandler } from './utils/errorHandler'

import jwtPlugin    from './plugins/jwt'
import authPlugin   from './plugins/auth'

import authRoutes       from './routes/auth.route'
import userRoutes       from './routes/user.route'
import employeeRoutes   from './routes/employee.route'
import organisasiRoutes from './routes/organisasi.route'
import aplikasiRoutes   from './routes/aplikasi.route'
import ssoRoutes        from './routes/sso.route'
import masterRoutes     from './routes/master.route'

// ─── Pastikan folder uploads ada ─────────────────────────────────────────────
const uploadDir = path.resolve(config.upload.dir)
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// ─── Fastify instance ─────────────────────────────────────────────────────────
const fastify = Fastify({
  logger: {
    transport: config.app.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  },
})

const allowedOrigins = new Set([
  config.app.frontendUrl,
  ...config.webauthn.expectedOrigins,
])

type RateBucket = { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>()

function rateLimitFor(ip: string, url: string) {
  const pathOnly = url.split('?')[0]
  const strictPaths = [
    '/api/auth/login',
    '/api/auth/login/totp-verify',
    '/api/auth/passkey/login/options',
    '/api/auth/passkey/login/verify',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/refresh',
  ]
  const strict = strictPaths.includes(pathOnly)
  return {
    key: `${ip}:${strict ? pathOnly : 'global'}`,
    limit: strict ? 20 : 600,
    windowMs: 60_000,
  }
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
fastify.setErrorHandler(errorHandler)

// ─── Plugins ──────────────────────────────────────────────────────────────────
async function buildApp() {
  fastify.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (config.app.nodeEnv === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }

    const { key, limit, windowMs } = rateLimitFor(request.ip, request.url)
    const now = Date.now()
    const bucket = rateBuckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
      return
    }

    bucket.count += 1
    if (bucket.count > limit) {
      return reply.code(429).send({ success: false, error: 'Terlalu banyak request. Silakan coba lagi nanti.' })
    }
  })

  await fastify.register(cors, {
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(origin)) {
        cb(null, true)
        return
      }
      cb(new Error('Origin tidak diizinkan'), false)
    },
    credentials: true,
  })
  await fastify.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  })
  await fastify.register(fastifyStatic, {
    root:   uploadDir,
    prefix: '/uploads/',
  })

  await fastify.register(jwtPlugin)
  await fastify.register(authPlugin)

  // ─── Routes ─────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes,       { prefix: '/api/auth'   })
  await fastify.register(userRoutes,       { prefix: '/api/users'  })
  await fastify.register(employeeRoutes,   { prefix: '/api/employees' })
  await fastify.register(organisasiRoutes, { prefix: '/api/org'    })
  await fastify.register(aplikasiRoutes,   { prefix: '/api/apps'   })
  await fastify.register(ssoRoutes,        { prefix: '/api/sso'    })
  await fastify.register(masterRoutes,     { prefix: '/api/master' })

  // ─── Health check ────────────────────────────────────────────────────────────
  fastify.get('/health', async () => ({
    status:    'ok',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version ?? '1.0.0',
  }))

  return fastify
}

// ─── Start ────────────────────────────────────────────────────────────────────
buildApp()
  .then(app => app.listen({ port: config.app.port, host: config.app.host }))
  .then(() => {
    console.log(`\n🚀  INL Portal API running on http://${config.app.host}:${config.app.port}`)
    console.log(`📁  Static files: ${config.upload.url}`)
    console.log(`🔑  Health check: http://localhost:${config.app.port}/health\n`)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
